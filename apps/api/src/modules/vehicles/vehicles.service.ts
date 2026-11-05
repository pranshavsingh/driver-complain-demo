import type { CreateVehicle, UpdateVehicle, VehiclePublic } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toVehiclePublic } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';
import { pushToUsers } from '../../lib/fcm';
import { emitToUsers, emitToAll } from '../../realtime/socket';
import { logger } from '../../lib/logger';
import {
  parsePagination,
  buildPaginationMetadata,
  type PaginationParams,
  type PaginatedResult,
} from '../../lib/pagination';

export interface VehicleFilterQuery extends PaginationParams {
  search?: string;
  agreementStatus?: string;
  wheels?: string;
  driverId?: string;
  assignmentFilter?: 'ALL' | 'ASSIGNED' | 'FREE';
}

/** All vehicles with optional search/filter — feeds admin vehicle management & dropdowns. */
export async function list(
  query?: VehicleFilterQuery,
  actor?: { id: string; role: string },
): Promise<PaginatedResult<VehiclePublic>> {
  const where: any = {};

  // For EXECUTIVE role, only return vehicles assigned to them
  if (actor?.role === 'EXECUTIVE') {
    where.siteInchargeId = actor.id;
  }

  if (query?.assignmentFilter === 'ASSIGNED') {
    where.driverId = { not: null };
  } else if (query?.assignmentFilter === 'FREE') {
    where.driverId = null;
  }

  if (query?.search?.trim()) {
    const q = query.search.trim();
    where.OR = [
      { plateNumber: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      { modelNumber: { contains: q, mode: 'insensitive' } },
      { chassisNumber: { contains: q, mode: 'insensitive' } },
      { vin: { contains: q, mode: 'insensitive' } },
      { make: { contains: q, mode: 'insensitive' } },
      { driver: { user: { firstName: { contains: q, mode: 'insensitive' } } } },
      { driver: { user: { lastName: { contains: q, mode: 'insensitive' } } } },
      { siteIncharge: { firstName: { contains: q, mode: 'insensitive' } } },
      { siteIncharge: { lastName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  if (query?.agreementStatus && query.agreementStatus !== 'ALL') {
    if (query.agreementStatus.toUpperCase() === 'ACTIVE') {
      const activeOr = [
        { agreementStatus: { contains: 'ACTIVE', mode: 'insensitive' } },
        { agreementStatus: { contains: 'FMS', mode: 'insensitive' } },
        { agreementStatus: { contains: 'PLATINUM', mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: activeOr }];
        delete where.OR;
      } else {
        where.OR = activeOr;
      }
    } else {
      where.agreementStatus = { equals: query.agreementStatus, mode: 'insensitive' };
    }
  }

  if (query?.wheels && query.wheels !== 'ALL') {
    where.wheels = query.wheels;
  }

  if (query?.driverId) {
    where.driverId = query.driverId;
  }

  const { page, pageSize, skip } = parsePagination(query);

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: {
        driver: {
          include: {
            user: true,
          },
        },
        siteIncharge: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
    }),
    prisma.vehicle.count({ where }),
  ]);

  const meta = buildPaginationMetadata(total, page, pageSize);

  return {
    data: vehicles.map(toVehiclePublic),
    meta,
  };
}

export interface VehicleSummary {
  total: number;
  assignedCount: number;
  freeCount: number;
  activeAgreementsCount: number;
  utilizationPct: number;
}

export interface DriverAssignment {
  vehicleId: string;
  plateNumber: string;
  driverId: string;
  driverName: string;
}

export async function getSummary(actor?: { id: string; role: string }): Promise<VehicleSummary> {
  const where: any = {};
  if (actor?.role === 'EXECUTIVE') {
    where.siteInchargeId = actor.id;
  }

  const [total, assignedCount, activeCount] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.count({ where: { ...where, driverId: { not: null } } }),
    prisma.vehicle.count({
      where: {
        ...where,
        OR: [
          { agreementStatus: { contains: 'ACTIVE', mode: 'insensitive' } },
          { agreementStatus: { contains: 'FMS', mode: 'insensitive' } },
          { agreementStatus: { contains: 'PLATINUM', mode: 'insensitive' } },
        ],
      },
    }),
  ]);

  const freeCount = Math.max(0, total - assignedCount);
  const utilizationPct = total > 0 ? Math.round((assignedCount / total) * 100) : 0;

  return {
    total,
    assignedCount,
    freeCount,
    activeAgreementsCount: activeCount,
    utilizationPct,
  };
}

/** Separate bounded lookup for driver-to-vehicle assignments with role scoping. */
export async function getAssignments(
  query?: { driverId?: string; driverIds?: string[]; limit?: number },
  actor?: { id: string; role: string },
): Promise<DriverAssignment[]> {
  const where: any = { driverId: { not: null } };
  if (actor?.role === 'EXECUTIVE') {
    where.siteInchargeId = actor.id;
  }

  const requestedIds = query?.driverIds && query.driverIds.length > 0
    ? query.driverIds.slice(0, 100)
    : undefined;

  if (query?.driverId) {
    where.driverId = query.driverId;
  } else if (requestedIds) {
    where.driverId = { in: requestedIds };
  }

  // Determine appropriate default:
  // - single driverId lookup -> 1
  // - driverIds array lookup -> requested count (up to 100) so all requested IDs can be returned
  // - generic lookup -> 50
  const defaultLimit = query?.driverId ? 1 : requestedIds ? Math.min(requestedIds.length, 100) : 50;

  let limit = defaultLimit;
  if (query?.limit !== undefined) {
    const rawLimit = Number(query.limit);
    if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
      limit = defaultLimit;
    } else {
      limit = Math.min(Math.max(1, Math.floor(rawLimit)), 100);
    }
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    select: {
      id: true,
      plateNumber: true,
      driverId: true,
      driver: {
        select: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    take: limit,
  });

  return vehicles.map((v) => ({
    vehicleId: v.id,
    plateNumber: v.plateNumber,
    driverId: v.driverId!,
    driverName: v.driver?.user ? `${v.driver.user.firstName} ${v.driver.user.lastName}`.trim() : 'Driver',
  }));
}

/** Vehicles assigned to the calling user's driver profile ("my vehicles"). */
export async function listForUser(userId: string): Promise<VehiclePublic[]> {
  const driver = await prisma.driver.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!driver) throw ApiError.badRequest('Your account has no driver profile');

  const vehicles = await prisma.vehicle.findMany({
    where: { driverId: driver.id },
    include: {
      driver: {
        include: {
          user: true,
        },
      },
      siteIncharge: true,
    },
    orderBy: { plateNumber: 'asc' },
  });
  return vehicles.map(toVehiclePublic);
}

/** Get single vehicle by ID. */
export async function getById(id: string, actor?: { id: string; role: string }): Promise<VehiclePublic> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      driver: {
        include: {
          user: true,
        },
      },
      siteIncharge: true,
    },
  });
  if (!vehicle) throw ApiError.notFound('Vehicle not found');

  if (actor?.role === 'EXECUTIVE' && vehicle.siteInchargeId !== actor.id) {
    throw ApiError.forbidden('You are not authorized to view this vehicle');
  }

  return toVehiclePublic(vehicle);
}

/** Create a new vehicle entry. */
export async function create(input: CreateVehicle): Promise<VehiclePublic> {
  const normalizedPlate = input.plateNumber.trim().toUpperCase();

  // 1. Vehicle Number uniqueness
  const existingPlate = await prisma.vehicle.findFirst({
    where: {
      plateNumber: { equals: normalizedPlate, mode: 'insensitive' },
    },
  });
  if (existingPlate) {
    throw ApiError.badRequest(`Vehicle with plate number "${normalizedPlate}" already exists.`);
  }

  // 2. Chassis No / VIN uniqueness
  const chassisOrVin = input.chassisNumber?.trim() || input.vin?.trim();
  if (chassisOrVin) {
    const existingChassis = await prisma.vehicle.findFirst({
      where: {
        OR: [
          { chassisNumber: { equals: chassisOrVin, mode: 'insensitive' } },
          { vin: { equals: chassisOrVin, mode: 'insensitive' } },
        ],
      },
      select: { plateNumber: true },
    });
    if (existingChassis) {
      throw ApiError.badRequest(
        `Vehicle with Chassis No (VIN) "${chassisOrVin}" already exists (registered on vehicle "${existingChassis.plateNumber}").`
      );
    }
  }

  // 3. Driver 1:1 Assignment Validation
  const targetDriverId = input.driverId?.trim() ? input.driverId.trim() : null;
  if (targetDriverId) {
    const existingAssigned = await prisma.vehicle.findFirst({
      where: { driverId: targetDriverId },
      select: {
        id: true,
        plateNumber: true,
        driver: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (existingAssigned) {
      const driverName = existingAssigned.driver?.user
        ? `${existingAssigned.driver.user.firstName} ${existingAssigned.driver.user.lastName}`.trim()
        : 'Driver';
      throw ApiError.badRequest(
        `Driver ${driverName} is already assigned on vehicle "${existingAssigned.plateNumber}". Please free from that vehicle first then assign to a new vehicle.`
      );
    }
  }

  const targetSiteInchargeId = input.siteInchargeId?.trim() ? input.siteInchargeId.trim() : null;

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber: normalizedPlate,
      model: input.model?.trim() || null,
      make: input.make?.trim() || null,
      modelNumber: input.modelNumber?.trim() || null,
      registrationDate: input.registrationDate ? new Date(input.registrationDate) : null,
      chassisNumber: input.chassisNumber?.trim() || null,
      wheels: input.wheels?.trim() || null,
      agreementStatus: input.agreementStatus?.trim() || 'FMS Pack 1',
      year: input.year ?? null,
      vin: input.vin?.trim() || input.chassisNumber?.trim() || null,
      driverId: targetDriverId,
      siteInchargeId: targetSiteInchargeId,
    },
    include: {
      driver: {
        include: {
          user: true,
        },
      },
      siteIncharge: true,
    },
  });

  // If driver was assigned on creation, dispatch notification & push
  if (vehicle.driver?.user?.id) {
    const title = 'Vehicle Assigned 🚛';
    const body = `Vehicle ${vehicle.plateNumber} (${vehicle.model || vehicle.wheels || 'Fleet Vehicle'}) has been assigned to you.`;
    void (async () => {
      try {
        const n = await prisma.notification.create({
          data: {
            userId: vehicle.driver!.user.id,
            type: 'VEHICLE_ASSIGNED' as any,
            title,
            body,
            data: {
              vehicleId: vehicle.id,
              plateNumber: vehicle.plateNumber,
              model: vehicle.model,
              wheels: vehicle.wheels,
            },
          },
        });
        await pushToUsers([vehicle.driver!.user.id], {
          title,
          body,
          data: {
            type: 'VEHICLE_ASSIGNED',
            vehicleId: vehicle.id,
            plateNumber: vehicle.plateNumber,
          },
        });
        emitToUsers([vehicle.driver!.user.id], 'notification:new' as any, {
          id: n.id,
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data,
          createdAt: n.createdAt.toISOString(),
          isRead: n.isRead,
        } as any);
      } catch (err) {
        logger.error({ err, vehicleId: vehicle.id }, 'Failed to notify assigned driver');
      }
    })();
  }

  const publicVehicle = toVehiclePublic(vehicle);
  emitToAll('vehicle:created', { vehicle: publicVehicle });
  return publicVehicle;
}

/** Update an existing vehicle entry. */
export async function update(
  id: string,
  input: UpdateVehicle,
  actor?: { id: string; role: string },
): Promise<VehiclePublic> {
  const existing = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      driver: {
        include: {
          user: true,
        },
      },
    },
  });
  if (!existing) throw ApiError.notFound('Vehicle not found');

  if (actor?.role === 'EXECUTIVE' && existing.siteInchargeId !== actor.id) {
    throw ApiError.forbidden('You are not authorized to update this vehicle');
  }

  // 1. Check plateNumber uniqueness
  if (input.plateNumber) {
    const normalizedPlate = input.plateNumber.trim().toUpperCase();
    if (normalizedPlate !== existing.plateNumber) {
      const duplicate = await prisma.vehicle.findFirst({
        where: {
          plateNumber: { equals: normalizedPlate, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw ApiError.badRequest(`Vehicle with plate number "${normalizedPlate}" already exists.`);
      }
    }
  }

  // 2. Check Chassis No (VIN) uniqueness
  const updatedChassisOrVin = input.chassisNumber !== undefined ? input.chassisNumber?.trim() : input.vin?.trim();
  if (updatedChassisOrVin) {
    const duplicateChassis = await prisma.vehicle.findFirst({
      where: {
        id: { not: id },
        OR: [
          { chassisNumber: { equals: updatedChassisOrVin, mode: 'insensitive' } },
          { vin: { equals: updatedChassisOrVin, mode: 'insensitive' } },
        ],
      },
      select: { plateNumber: true },
    });
    if (duplicateChassis) {
      throw ApiError.badRequest(
        `Vehicle with Chassis No (VIN) "${updatedChassisOrVin}" already exists (registered on vehicle "${duplicateChassis.plateNumber}").`
      );
    }
  }

  const data: any = {};
  if (input.plateNumber !== undefined) data.plateNumber = input.plateNumber?.trim().toUpperCase();
  if (input.model !== undefined) data.model = input.model?.trim() || null;
  if (input.make !== undefined) data.make = input.make?.trim() || null;
  if (input.modelNumber !== undefined) data.modelNumber = input.modelNumber?.trim() || null;
  if (input.registrationDate !== undefined) {
    data.registrationDate = input.registrationDate ? new Date(input.registrationDate) : null;
  }
  if (input.chassisNumber !== undefined) data.chassisNumber = input.chassisNumber?.trim() || null;
  if (input.wheels !== undefined) data.wheels = input.wheels?.trim() || null;
  if (input.agreementStatus !== undefined) data.agreementStatus = input.agreementStatus?.trim() || 'FMS Pack 1';
  if (input.year !== undefined) data.year = input.year ?? null;
  if (input.vin !== undefined) data.vin = input.vin?.trim() || null;
  if ('siteInchargeId' in input && input.siteInchargeId !== undefined) {
    data.siteInchargeId = input.siteInchargeId?.trim() ? input.siteInchargeId.trim() : null;
  }

  // 3. Check Driver 1:1 assignment
  const hasDriverIdInInput = 'driverId' in input && input.driverId !== undefined;
  const newDriverId = hasDriverIdInInput ? (input.driverId?.trim() ? input.driverId.trim() : null) : undefined;
  if (hasDriverIdInInput) {
    data.driverId = newDriverId;
    if (newDriverId && newDriverId !== existing.driverId) {
      const assignedOtherVehicle = await prisma.vehicle.findFirst({
        where: {
          driverId: newDriverId,
          id: { not: id },
        },
        select: {
          id: true,
          plateNumber: true,
          driver: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      });
      if (assignedOtherVehicle) {
        const driverName = assignedOtherVehicle.driver?.user
          ? `${assignedOtherVehicle.driver.user.firstName} ${assignedOtherVehicle.driver.user.lastName}`.trim()
          : 'Driver';
        throw ApiError.badRequest(
          `Driver ${driverName} is already assigned on vehicle "${assignedOtherVehicle.plateNumber}". Please free from that vehicle first then assign to a new vehicle.`
        );
      }
    }
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data,
    include: {
      driver: {
        include: {
          user: true,
        },
      },
      siteIncharge: true,
    },
  });

  // Handle Driver Assignment Notifications
  const previousDriverUserId = existing.driver?.user?.id;
  const newDriverUserId = vehicle.driver?.user?.id;

  if (hasDriverIdInInput && (newDriverId || null) !== (existing.driverId || null)) {
    // 1. If previous driver was unassigned or replaced
    if (previousDriverUserId && previousDriverUserId !== newDriverUserId) {
      const title = 'Vehicle Unassigned 🚛';
      const body = `Vehicle ${vehicle.plateNumber} has been unassigned from your profile.`;
      void (async () => {
        try {
          const n = await prisma.notification.create({
            data: {
              userId: previousDriverUserId,
              type: 'VEHICLE_UNASSIGNED' as any,
              title,
              body,
              data: {
                vehicleId: vehicle.id,
                plateNumber: vehicle.plateNumber,
              },
            },
          });
          await pushToUsers([previousDriverUserId], {
            title,
            body,
            data: {
              type: 'VEHICLE_UNASSIGNED',
              vehicleId: vehicle.id,
              plateNumber: vehicle.plateNumber,
            },
          });
          emitToUsers([previousDriverUserId], 'notification:new' as any, {
            id: n.id,
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            data: n.data,
            createdAt: n.createdAt.toISOString(),
            isRead: n.isRead,
          } as any);
        } catch (err) {
          logger.error({ err, userId: previousDriverUserId }, 'Failed to notify unassigned driver');
        }
      })();
    }

    // 2. If new driver is assigned
    if (newDriverUserId && newDriverUserId !== previousDriverUserId) {
      const title = 'Vehicle Assigned 🚛';
      const body = `Vehicle ${vehicle.plateNumber} (${vehicle.model || vehicle.wheels || 'Fleet Vehicle'}) has been assigned to you.`;
      void (async () => {
        try {
          const n = await prisma.notification.create({
            data: {
              userId: newDriverUserId,
              type: 'VEHICLE_ASSIGNED' as any,
              title,
              body,
              data: {
                vehicleId: vehicle.id,
                plateNumber: vehicle.plateNumber,
                model: vehicle.model,
                wheels: vehicle.wheels,
              },
            },
          });
          await pushToUsers([newDriverUserId], {
            title,
            body,
            data: {
              type: 'VEHICLE_ASSIGNED',
              vehicleId: vehicle.id,
              plateNumber: vehicle.plateNumber,
            },
          });
          emitToUsers([newDriverUserId], 'notification:new' as any, {
            id: n.id,
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            data: n.data,
            createdAt: n.createdAt.toISOString(),
            isRead: n.isRead,
          } as any);
        } catch (err) {
          logger.error({ err, userId: newDriverUserId }, 'Failed to notify assigned driver');
        }
      })();
    }
  }

  const publicVehicle = toVehiclePublic(vehicle);
  emitToAll('vehicle:updated', { vehicle: publicVehicle });
  if (hasDriverIdInInput && (newDriverId || null) !== (existing.driverId || null)) {
    emitToAll('vehicle:assigned', {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      driverId: vehicle.driverId,
      previousDriverId: existing.driverId,
      vehicle: publicVehicle,
    });
  }

  return publicVehicle;
}

/** Delete a vehicle entry. */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Vehicle not found');

  await prisma.vehicle.delete({ where: { id } });
  emitToAll('vehicle:deleted', { id, plateNumber: existing.plateNumber });
}

