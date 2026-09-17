import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  WarehousePublic,
} from '@driver-complaint/shared-types';

function toWarehousePublic(row: any): WarehousePublic {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    location: row.location ?? null,
    contactPerson: row.contactPerson ?? null,
    contactPhone: row.contactPhone ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    ...(row._count ? { _count: row._count } : {}),
  };
}

export async function listWarehouses(includeInactive = false): Promise<WarehousePublic[]> {
  const rows = await prisma.warehouse.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { issuedParts: true },
      },
    },
  });
  return rows.map(toWarehousePublic);
}

export async function getWarehouseById(id: string): Promise<WarehousePublic> {
  const row = await prisma.warehouse.findUnique({
    where: { id },
    include: {
      _count: {
        select: { issuedParts: true },
      },
    },
  });
  if (!row) throw ApiError.notFound('Warehouse not found');
  return toWarehousePublic(row);
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<WarehousePublic> {
  const existing = await prisma.warehouse.findUnique({
    where: { name: input.name.trim() },
  });
  if (existing) {
    throw ApiError.badRequest('A warehouse with this name already exists');
  }

  const row = await prisma.warehouse.create({
    data: {
      name: input.name.trim(),
      code: input.code ? input.code.trim() : null,
      location: input.location ? input.location.trim() : null,
      contactPerson: input.contactPerson ? input.contactPerson.trim() : null,
      contactPhone: input.contactPhone ? input.contactPhone.trim() : null,
      isActive: input.isActive ?? true,
    },
  });
  return toWarehousePublic(row);
}

export async function updateWarehouse(id: string, input: UpdateWarehouseInput): Promise<WarehousePublic> {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Warehouse not found');

  if (input.name && input.name.trim() !== existing.name) {
    const duplicate = await prisma.warehouse.findUnique({
      where: { name: input.name.trim() },
    });
    if (duplicate) {
      throw ApiError.badRequest('A warehouse with this name already exists');
    }
  }

  const row = await prisma.warehouse.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.code !== undefined ? { code: input.code ? input.code.trim() : null } : {}),
      ...(input.location !== undefined ? { location: input.location ? input.location.trim() : null } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson ? input.contactPerson.trim() : null } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone ? input.contactPhone.trim() : null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: {
      _count: {
        select: { issuedParts: true },
      },
    },
  });
  return toWarehousePublic(row);
}

export async function deleteWarehouse(id: string): Promise<void> {
  const existing = await prisma.warehouse.findUnique({
    where: { id },
    include: { _count: { select: { issuedParts: true } } },
  });
  if (!existing) throw ApiError.notFound('Warehouse not found');

  if (existing._count.issuedParts > 0) {
    // Has issued parts historical relation, soft-deactivate instead of hard delete
    await prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
    return;
  }

  await prisma.warehouse.delete({ where: { id } });
}

