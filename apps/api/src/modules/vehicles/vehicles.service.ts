import type { CreateVehicle, UpdateVehicle, VehiclePublic } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toVehiclePublic } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';
import { pushToUsers } from '../../lib/fcm';
import { emitToUsers } from '../../realtime/socket';
import { logger } from '../../lib/logger';

export interface VehicleFilterQuery {
  search?: string;
  agreementStatus?: string;
  wheels?: string;
  driverId?: string;
}

/** All vehicles with optional search/filter — feeds admin vehicle management & dropdowns. */
export async function list(query?: VehicleFilterQuery): Promise<VehiclePublic[]> {
  const where: any = {};

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
    ];
  }

  if (query?.agreementStatus && query.agreementStatus !== 'ALL') {
    where.agreementStatus = query.agreementStatus;
  }

  if (query?.wheels && query.wheels !== 'ALL') {
    where.wheels = query.wheels;
  }

  if (query?.driverId) {
    where.driverId = query.driverId;
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      driver: {
        include: {
          user: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return vehicles.map(toVehiclePublic);
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
    },
    orderBy: { plateNumber: 'asc' },
  });
  return vehicles.map(toVehiclePublic);
}

/** Get single vehicle by ID. */
export async function getById(id: string): Promise<VehiclePublic> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      driver: {
        include: {
          user: true,
        },
      },
    },
  });
  if (!vehicle) throw ApiError.notFound('Vehicle not found');
  return toVehiclePublic(vehicle);
}

/** Create a new vehicle entry. */
export async function create(input: CreateVehicle): Promise<VehiclePublic> {
  const normalizedPlate = input.plateNumber.trim().toUpperCase();

  const existing = await prisma.vehicle.findUnique({
    where: { plateNumber: normalizedPlate },
  });
  if (existing) {
    throw ApiError.badRequest(`Vehicle with plate number ${normalizedPlate} already exists.`);
  }

  if (input.vin?.trim()) {
    const existingVin = await prisma.vehicle.findUnique({
      where: { vin: input.vin.trim() },
    });
    if (existingVin) {
      throw ApiError.badRequest(`Vehicle with Chassis/VIN ${input.vin.trim()} already exists.`);
    }
  }

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
      driverId: input.driverId || null,
    },
    include: {
      driver: {
        include: {
          user: true,
        },
      },
    },
  });

  // If driver was assigned on creation, dispatch notification & push
  if (vehicle.driver?.user?.id) {
    const title = 'Vehicle Assigned 🚛';
    const body = `Vehicle ${vehicle.plateNumber} (${vehicle.model || vehicle.wheels || 'Fleet Vehicle'}) has been assigned to you.`;
    void (async () => {
      try {
        await prisma.notification.create({
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
          type: 'VEHICLE_ASSIGNED',
          title,
          body,
          data: { vehicleId: vehicle.id, plateNumber: vehicle.plateNumber },
        } as any);
      } catch (err) {
        logger.error({ err, vehicleId: vehicle.id }, 'Failed to notify assigned driver');
      }
    })();
  }

  return toVehiclePublic(vehicle);
}

/** Update an existing vehicle entry. */
export async function update(id: string, input: UpdateVehicle): Promise<VehiclePublic> {
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

  if (input.plateNumber) {
    const normalizedPlate = input.plateNumber.trim().toUpperCase();
    if (normalizedPlate !== existing.plateNumber) {
      const duplicate = await prisma.vehicle.findUnique({
        where: { plateNumber: normalizedPlate },
      });
      if (duplicate) {
        throw ApiError.badRequest(`Vehicle with plate number ${normalizedPlate} already exists.`);
      }
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
  
  const hasDriverIdInInput = 'driverId' in input && input.driverId !== undefined;
  const newDriverId = hasDriverIdInInput ? (input.driverId?.trim() ? input.driverId.trim() : null) : undefined;
  if (hasDriverIdInInput) {
    data.driverId = newDriverId;
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
          await prisma.notification.create({
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
            type: 'VEHICLE_UNASSIGNED',
            title,
            body,
            data: { vehicleId: vehicle.id, plateNumber: vehicle.plateNumber },
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
          await prisma.notification.create({
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
            type: 'VEHICLE_ASSIGNED',
            title,
            body,
            data: { vehicleId: vehicle.id, plateNumber: vehicle.plateNumber },
          } as any);
        } catch (err) {
          logger.error({ err, userId: newDriverUserId }, 'Failed to notify assigned driver');
        }
      })();
    }
  }

  return toVehiclePublic(vehicle);
}

/** Delete a vehicle entry. */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Vehicle not found');

  await prisma.vehicle.delete({ where: { id } });
}

