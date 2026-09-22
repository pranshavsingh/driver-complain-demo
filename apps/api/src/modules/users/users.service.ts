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
import { emitToRoles, emitEventToUsers } from '../../realtime/socket';

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

  // Admin can only add Drivers for SuperAdmin approval
  if (actor.role === 'ADMIN') {
    if (input.role !== 'DRIVER') {
      throw ApiError.forbidden('Admins can only register Drivers for SuperAdmin approval.');
    }
  }

  // 1. Employee ID Uniqueness Check (B-Tree unique index)
  const normEmpId = input.employeeId.trim().toUpperCase();
  const existingEmp = await prisma.user.findFirst({
    where: { employeeId: { equals: normEmpId, mode: 'insensitive' } },
  });
  if (existingEmp) {
    throw ApiError.badRequest(`Employee ID "${normEmpId}" is already registered.`);
  }

  // 2. Phone Number (Required & Unique)
  const normPhone = input.phone?.trim();
  if (!normPhone) {
    throw ApiError.badRequest('Phone number is required.');
  }
  const existingPhone = await prisma.user.findFirst({
    where: { phone: normPhone },
  });
  if (existingPhone) {
    throw ApiError.badRequest(`Phone number "${normPhone}" is already registered.`);
  }

  // 3. Email (Optional, but Unique if provided)
  const normEmail = input.email?.trim() ? input.email.trim().toLowerCase() : null;
  if (normEmail) {
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: normEmail, mode: 'insensitive' } },
    });
    if (existingEmail) {
      throw ApiError.badRequest(`Email address "${normEmail}" is already registered.`);
    }
  }

  // 4. Driving License (DL) for Driver Role (Required & Unique)
  let normLicense = input.licenseNumber?.trim() || null;
  if (input.role === 'DRIVER') {
    if (!normLicense) {
      throw ApiError.badRequest('Driving License (DL) number is required for driver accounts.');
    }
    const existingLicense = await prisma.driver.findFirst({
      where: { licenseNumber: { equals: normLicense, mode: 'insensitive' } },
    });
    if (existingLicense) {
      throw ApiError.badRequest(`Driving License "${normLicense}" is already registered.`);
    }
  }

  const pinHash = await hashPin(input.pin.trim());
  const isSuperAdmin = actor.role === 'SUPER_ADMIN';
  const approvalStatus: ApprovalStatus = isSuperAdmin ? 'APPROVED' : 'PENDING_APPROVAL';
  const isActive = isSuperAdmin;

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        employeeId: normEmpId,
        pinHash,
        role: input.role,
        approvalStatus,
        category: input.category ?? null,
        createdByAdminId: isSuperAdmin ? null : actor.id,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: normEmail,
        phone: normPhone,
        isActive,
      },
    });

    if (input.role === 'DRIVER') {
      await tx.driver.create({
        data: {
          userId: newUser.id,
          licenseNumber: normLicense!,
        },
      });
    }

    return newUser;
  });

  // Realtime Broadcasts & Notifications
  if (user.approvalStatus === 'PENDING_APPROVAL') {
    // Notify all SuperAdmins
    const superAdmins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true },
    });

    if (superAdmins.length > 0) {
      await prisma.notification.createMany({
        data: superAdmins.map((sa) => ({
          userId: sa.id,
          type: 'USER_APPROVAL_REQUESTED',
          title: 'New Driver Approval Request',
          body: `Driver ${user.firstName} ${user.lastName} (${user.employeeId}) submitted by Admin for approval.`,
          data: { userId: user.id, employeeId: user.employeeId, role: user.role },
        })),
      });

      for (const sa of superAdmins) {
        emitEventToUsers([sa.id], 'notification:new', {
          id: `notif-${user.id}-${Date.now()}`,
          userId: sa.id,
          type: 'USER_APPROVAL_REQUESTED',
          title: 'New Driver Approval Request',
          body: `Driver ${user.firstName} ${user.lastName} (${user.employeeId}) submitted by Admin for approval.`,
          createdAt: new Date().toISOString(),
          isRead: false,
        });
      }
    }

    emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:approval-requested', {
      userId: user.id,
      employeeId: user.employeeId,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      approvalStatus: user.approvalStatus,
      createdByAdminId: user.createdByAdminId,
      action: 'APPROVAL_REQUESTED',
      at: new Date().toISOString(),
    });
  }

  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:created', {
    userId: user.id,
    employeeId: user.employeeId,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    approvalStatus: user.approvalStatus,
    createdByAdminId: user.createdByAdminId,
    action: 'CREATED',
    at: new Date().toISOString(),
  });

  return toUserPublic(user);
}

export async function listUsers(
  actor: Actor,
  filters?: {
    role?: Role;
    approvalStatus?: ApprovalStatus;
    isActive?: boolean;
    search?: string;
  },
): Promise<UserPublic[]> {
  const where: Prisma.UserWhereInput = {};

  // Admin can ONLY see drivers
  if (actor.role === 'ADMIN') {
    where.role = 'DRIVER';
  } else if (filters?.role) {
    where.role = filters.role;
  }

  if (filters?.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;
  if (filters?.search) {
    where.OR = [
      { employeeId: { contains: filters.search, mode: 'insensitive' } },
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return users.map(toUserPublic);
}

export async function getPendingCount(): Promise<{ pendingCount: number }> {
  const pendingCount = await prisma.user.count({
    where: { approvalStatus: 'PENDING_APPROVAL' },
  });
  return { pendingCount };
}

export async function checkAvailability(query: {
  employeeId?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  excludeUserId?: string;
}): Promise<{
  employeeId?: { available: boolean; message?: string };
  phone?: { available: boolean; message?: string };
  email?: { available: boolean; message?: string };
  licenseNumber?: { available: boolean; message?: string };
}> {
  const result: {
    employeeId?: { available: boolean; message?: string };
    phone?: { available: boolean; message?: string };
    email?: { available: boolean; message?: string };
    licenseNumber?: { available: boolean; message?: string };
  } = {};

  // Check Employee ID
  if (query.employeeId?.trim()) {
    const norm = query.employeeId.trim().toUpperCase();
    const existing = await prisma.user.findFirst({
      where: {
        employeeId: { equals: norm, mode: 'insensitive' },
        ...(query.excludeUserId ? { id: { not: query.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    result.employeeId = {
      available: !existing,
      message: existing ? `Employee ID "${norm}" is already taken` : 'Employee ID is available',
    };
  }

  // Check Phone Number
  if (query.phone?.trim()) {
    const norm = query.phone.trim();
    const existing = await prisma.user.findFirst({
      where: {
        phone: norm,
        ...(query.excludeUserId ? { id: { not: query.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    result.phone = {
      available: !existing,
      message: existing ? 'Phone number is already registered' : 'Phone number is available',
    };
  }

  // Check Email
  if (query.email?.trim()) {
    const norm = query.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: norm, mode: 'insensitive' },
        ...(query.excludeUserId ? { id: { not: query.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    result.email = {
      available: !existing,
      message: existing ? 'Email is already in use' : 'Email is available',
    };
  }

  // Check License Number
  if (query.licenseNumber?.trim()) {
    const norm = query.licenseNumber.trim().toUpperCase();
    const existing = await prisma.driver.findFirst({
      where: {
        licenseNumber: { equals: norm, mode: 'insensitive' },
        ...(query.excludeUserId ? { user: { id: { not: query.excludeUserId } } } : {}),
      },
      select: { id: true },
    });
    result.licenseNumber = {
      available: !existing,
      message: existing ? 'Driving License is already registered' : 'Driving License is available',
    };
  }

  return result;
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

  // If created by an Admin, notify that Admin
  if (user.createdByAdminId) {
    await prisma.notification.create({
      data: {
        userId: user.createdByAdminId,
        type: 'USER_APPROVED',
        title: 'Driver Approved',
        body: `Driver ${updated.firstName} ${updated.lastName} (${updated.employeeId}) has been approved by SuperAdmin.`,
        data: { userId: updated.id, employeeId: updated.employeeId },
      },
    });

    emitEventToUsers([user.createdByAdminId], 'notification:new', {
      id: `notif-${updated.id}-appr-${Date.now()}`,
      userId: user.createdByAdminId,
      type: 'USER_APPROVED',
      title: 'Driver Approved',
      body: `Driver ${updated.firstName} ${updated.lastName} (${updated.employeeId}) has been approved by SuperAdmin.`,
      createdAt: new Date().toISOString(),
      isRead: false,
    });
  }

  // Realtime Broadcasts to SuperAdmin and Admin roles
  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:approved', {
    userId: updated.id,
    employeeId: updated.employeeId,
    name: `${updated.firstName} ${updated.lastName}`,
    role: updated.role,
    approvalStatus: updated.approvalStatus,
    action: 'APPROVED',
    at: new Date().toISOString(),
  });

  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:updated', {
    userId: updated.id,
    employeeId: updated.employeeId,
    name: `${updated.firstName} ${updated.lastName}`,
    role: updated.role,
    approvalStatus: updated.approvalStatus,
    action: 'UPDATED',
    at: new Date().toISOString(),
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

  // If created by an Admin, notify that Admin
  if (user.createdByAdminId) {
    await prisma.notification.create({
      data: {
        userId: user.createdByAdminId,
        type: 'USER_REJECTED',
        title: 'Driver Approval Rejected',
        body: `Driver ${updated.firstName} ${updated.lastName} (${updated.employeeId}) was rejected by SuperAdmin.`,
        data: { userId: updated.id, employeeId: updated.employeeId },
      },
    });

    emitEventToUsers([user.createdByAdminId], 'notification:new', {
      id: `notif-${updated.id}-rej-${Date.now()}`,
      userId: user.createdByAdminId,
      type: 'USER_REJECTED',
      title: 'Driver Approval Rejected',
      body: `Driver ${updated.firstName} ${updated.lastName} (${updated.employeeId}) was rejected by SuperAdmin.`,
      createdAt: new Date().toISOString(),
      isRead: false,
    });
  }

  // Realtime Broadcasts to SuperAdmin and Admin roles
  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:rejected', {
    userId: updated.id,
    employeeId: updated.employeeId,
    name: `${updated.firstName} ${updated.lastName}`,
    role: updated.role,
    approvalStatus: updated.approvalStatus,
    action: 'REJECTED',
    at: new Date().toISOString(),
  });

  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:updated', {
    userId: updated.id,
    employeeId: updated.employeeId,
    name: `${updated.firstName} ${updated.lastName}`,
    role: updated.role,
    approvalStatus: updated.approvalStatus,
    action: 'UPDATED',
    at: new Date().toISOString(),
  });

  return toUserPublic(updated);
}

export async function updateUser(userId: string, input: UpdateUser): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  // If email is provided, check uniqueness
  if (input.email !== undefined && input.email) {
    const normEmail = input.email.trim().toLowerCase();
    const dup = await prisma.user.findFirst({
      where: {
        email: { equals: normEmail, mode: 'insensitive' },
        id: { not: userId },
      },
    });
    if (dup) throw ApiError.badRequest(`Email "${normEmail}" is already registered.`);
  }

  // If phone is provided, check uniqueness
  if (input.phone !== undefined && input.phone) {
    const normPhone = input.phone.trim();
    const dup = await prisma.user.findFirst({
      where: {
        phone: normPhone,
        id: { not: userId },
      },
    });
    if (dup) throw ApiError.badRequest(`Phone number "${normPhone}" is already registered.`);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName.trim() }),
      ...(input.lastName !== undefined && { lastName: input.lastName.trim() }),
      ...(input.email !== undefined && { email: input.email ? input.email.trim().toLowerCase() : null }),
      ...(input.phone !== undefined && { phone: input.phone ? input.phone.trim() : null }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:updated', {
    userId: updated.id,
    employeeId: updated.employeeId,
    name: `${updated.firstName} ${updated.lastName}`,
    role: updated.role,
    approvalStatus: updated.approvalStatus,
    action: 'UPDATED',
    at: new Date().toISOString(),
  });

  return toUserPublic(updated);
}

export async function deleteUser(actor: Actor, targetUserId: string): Promise<void> {
  if (actor.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only SuperAdmin can delete user accounts.');
  }

  if (actor.id === targetUserId) {
    throw ApiError.badRequest('You cannot delete your own SuperAdmin account.');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { driver: true },
  });

  if (!target) {
    throw ApiError.notFound('User not found');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Unassign createdByAdminId reference for any users created by this admin
    await tx.user.updateMany({
      where: { createdByAdminId: targetUserId },
      data: { createdByAdminId: null },
    });

    // 2. Unassign assignedToId / pendingAssigneeId on Complaints
    await tx.complaint.updateMany({
      where: { assignedToId: targetUserId },
      data: { assignedToId: null, assignmentStatus: 'NONE' },
    });

    await tx.complaint.updateMany({
      where: { pendingAssigneeId: targetUserId },
      data: { pendingAssigneeId: null },
    });

    // 3. Handle Driver relations if the user is a driver
    if (target.driver) {
      const driverId = target.driver.id;

      // Unassign driver from any vehicles
      await tx.vehicle.updateMany({
        where: { driverId },
        data: { driverId: null },
      });

      // Find complaints created for this driver
      const driverComplaints = await tx.complaint.findMany({
        where: { driverId },
        select: { id: true },
      });

      const complaintIds = driverComplaints.map((c) => c.id);

      if (complaintIds.length > 0) {
        await tx.notification.deleteMany({ where: { complaintId: { in: complaintIds } } });
        await tx.complaintAttachment.deleteMany({ where: { complaintId: { in: complaintIds } } });
        await tx.complaintUpdate.deleteMany({ where: { complaintId: { in: complaintIds } } });
        await tx.loadingRecord.deleteMany({ where: { complaintId: { in: complaintIds } } });
        await tx.complaint.deleteMany({ where: { id: { in: complaintIds } } });
      }

      // Delete driver-specific records
      await tx.loadingRecord.deleteMany({ where: { driverId } });
      await tx.fuelRecord.deleteMany({ where: { driverId } });
      await tx.maintenanceRecord.deleteMany({ where: { driverId } });
      await tx.sparePartRequest.deleteMany({ where: { driverId } });
      await tx.driver.delete({ where: { id: driverId } });
    }

    // 4. Delete user-level relations
    await tx.notification.deleteMany({ where: { userId: targetUserId } });
    await tx.deviceToken.deleteMany({ where: { userId: targetUserId } });
    await tx.refreshToken.deleteMany({ where: { userId: targetUserId } });
    await tx.supportMessage.deleteMany({
      where: {
        OR: [{ senderId: targetUserId }, { receiverId: targetUserId }],
      },
    });

    // 5. Delete the User record
    await tx.user.delete({ where: { id: targetUserId } });
  });

  // 6. Broadcast Realtime Delete Event
  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:deleted', {
    userId: targetUserId,
    employeeId: target.employeeId,
    name: `${target.firstName} ${target.lastName}`,
    role: target.role,
    approvalStatus: target.approvalStatus,
    action: 'DELETED',
    at: new Date().toISOString(),
  });

  emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'user:updated', {
    userId: targetUserId,
    employeeId: target.employeeId,
    name: `${target.firstName} ${target.lastName}`,
    role: target.role,
    approvalStatus: target.approvalStatus,
    action: 'UPDATED',
    at: new Date().toISOString(),
  });
}
