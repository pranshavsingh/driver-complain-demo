import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import type { CreateOperatingSite, UpdateOperatingSite, OperatingSitePublic } from '@driver-complaint/shared-types';

function toSitePublic(site: {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): OperatingSitePublic {
  return {
    id: site.id,
    name: site.name,
    code: site.code,
    address: site.address,
    isActive: site.isActive,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

export async function list(onlyActive = false): Promise<OperatingSitePublic[]> {
  const sites = await prisma.operatingSite.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    orderBy: { name: 'asc' },
  });
  return sites.map(toSitePublic);
}

export async function getById(id: string): Promise<OperatingSitePublic> {
  const site = await prisma.operatingSite.findUnique({
    where: { id },
  });
  if (!site) {
    throw ApiError.notFound('Operating site not found');
  }
  return toSitePublic(site);
}

export async function create(data: CreateOperatingSite): Promise<OperatingSitePublic> {
  const trimmedName = data.name.trim();
  const trimmedCode = data.code ? data.code.trim().toUpperCase() : null;

  const existing = await prisma.operatingSite.findFirst({
    where: {
      OR: [
        { name: { equals: trimmedName, mode: 'insensitive' } },
        ...(trimmedCode ? [{ code: trimmedCode }] : []),
      ],
    },
  });

  if (existing) {
    if (existing.name.toLowerCase() === trimmedName.toLowerCase()) {
      throw ApiError.conflict(`A site with name "${trimmedName}" already exists`);
    }
    if (trimmedCode && existing.code === trimmedCode) {
      throw ApiError.conflict(`A site with code "${trimmedCode}" already exists`);
    }
  }

  const site = await prisma.operatingSite.create({
    data: {
      name: trimmedName,
      code: trimmedCode,
      address: data.address?.trim() || null,
      isActive: data.isActive ?? true,
    },
  });

  return toSitePublic(site);
}

export async function update(id: string, data: UpdateOperatingSite): Promise<OperatingSitePublic> {
  const site = await prisma.operatingSite.findUnique({ where: { id } });
  if (!site) {
    throw ApiError.notFound('Operating site not found');
  }

  const trimmedName = data.name !== undefined ? data.name.trim() : undefined;
  const trimmedCode = data.code !== undefined ? (data.code ? data.code.trim().toUpperCase() : null) : undefined;

  if (trimmedName || trimmedCode) {
    const existing = await prisma.operatingSite.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(trimmedName ? [{ name: { equals: trimmedName, mode: 'insensitive' as const } }] : []),
          ...(trimmedCode ? [{ code: trimmedCode }] : []),
        ],
      },
    });

    if (existing) {
      if (trimmedName && existing.name.toLowerCase() === trimmedName.toLowerCase()) {
        throw ApiError.conflict(`A site with name "${trimmedName}" already exists`);
      }
      if (trimmedCode && existing.code === trimmedCode) {
        throw ApiError.conflict(`A site with code "${trimmedCode}" already exists`);
      }
    }
  }

  const updated = await prisma.operatingSite.update({
    where: { id },
    data: {
      ...(trimmedName !== undefined ? { name: trimmedName } : {}),
      ...(trimmedCode !== undefined ? { code: trimmedCode } : {}),
      ...(data.address !== undefined ? { address: data.address?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });

  return toSitePublic(updated);
}

export async function remove(id: string): Promise<void> {
  const site = await prisma.operatingSite.findUnique({ where: { id } });
  if (!site) {
    throw ApiError.notFound('Operating site not found');
  }

  await prisma.operatingSite.delete({
    where: { id },
  });
}
