import type {
  UserPublic,
  AdminSummary,
  Role,
  CreateUser,
  UpdateUser,
  ApprovalStatus,
} from '@driver-complaint/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { toUserPublic, toAdminSummary } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';
import { hashPin } from '../../lib/password';

export interface Actor {
  id: string;
  role: Role;
}

export async function getById(id: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found');
  return toUserPublic(user);
}

export async function listAdmins(): Promise<AdminSummary[]> {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'] },
      isActive: true,
      approvalStatus: 'APPROVED',
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return admins.map(toAdminSummary);
}

export async function createUser(actor: Actor, input: CreateUser): Promise<UserPublic> {
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
    throw ApiError.forbidden('Only admins can create or request user accounts');
  }

  if (actor.role === 'ADMIN') {
    if (input.role !== 'EXECUTIVE' && input.role !== 'DRIVER') {
      throw ApiError.forbidden('Admins can only request creation of Executive or Driver accounts');
    }
  }

  const existing = await prisma.user.findUnique({ where: { employeeId: input.employeeId } });
  if (existing) throw ApiError.badRequest('Employee ID is already in use');

  const pinHash = await hashPin(input.pin);
  const isSuperAdmin = actor.role === 'SUPER_ADMIN';
  const approvalStatus: ApprovalStatus = isSuperAdmin ? 'APPROVED' : 'PENDING_APPROVAL';
  const isActive = isSuperAdmin;

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        employeeId: input.employeeId,
        pinHash,
        role: input.role,
        approvalStatus,
        category: input.category ?? null,
        createdByAdminId: isSuperAdmin ? null : actor.id,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        isActive,
      },
    });

    if (input.role === 'DRIVER') {
      await tx.driver.create({
        data: {
          userId: newUser.id,
          licenseNumber: input.licenseNumber?.trim() || `LIC-${input.employeeId}`,
        },
      });
    }

    return newUser;
  });

  return toUserPublic(user);
}

export async function listUsers(filters?: {
  role?: Role;
  approvalStatus?: ApprovalStatus;
  isActive?: boolean;
  search?: string;
}): Promise<UserPublic[]> {
  const where: Prisma.UserWhereInput = {};
  if (filters?.role) where.role = filters.role;
  if (filters?.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;
  if (filters?.search) {
    where.OR = [
      { employeeId: { contains: filters.search, mode: 'insensitive' } },
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return users.map(toUserPublic);
}

export async function approveUser(userId: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      approvalStatus: 'APPROVED',
      isActive: true,
    },
  });

  return toUserPublic(updated);
}

export async function rejectUser(userId: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      approvalStatus: 'REJECTED',
      isActive: false,
    },
  });

  return toUserPublic(updated);
}

export async function updateUser(userId: string, input: UpdateUser): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  return toUserPublic(updated);
}
