import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { uploadBuffer } from '../../lib/cloudinary';
import {
  CreateMaintenanceRecordSchema,
  type MaintenanceType,
} from '@driver-complaint/shared-types';

export interface CreateMaintenanceInput {
  vehicleId?: string;
  vehicleNumber?: string;
  type?: MaintenanceType;
  itemNumber: string;
  oldItemNumber?: string;
  quantity?: number;
  odometerKm?: number;
  brand?: string;
  position?: string;
  cost?: number;
  notes?: string;
}

export interface MaintenanceFilterOpts {
  driverUserId?: string;
  userRole?: string;
  vehicleId?: string;
  type?: MaintenanceType;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function createMaintenanceRecord(
  userId: string,
  input: CreateMaintenanceInput,
  photoFile?: Express.Multer.File,
) {
  const parsed = CreateMaintenanceRecordSchema.parse(input);

  // Get driver by userId
  const driver = await prisma.driver.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          employeeId: true,
        },
      },
      vehicles: true,
    },
  });

  if (!driver) {
    throw ApiError.forbidden('Only registered drivers can log vehicle maintenance entries');
  }

  // Resolve vehicle
  let targetVehicleId = parsed.vehicleId;

  if (!targetVehicleId && parsed.vehicleNumber) {
    const foundVehicle = await prisma.vehicle.findFirst({
      where: {
        plateNumber: { equals: parsed.vehicleNumber.trim(), mode: 'insensitive' },
      },
    });
    if (foundVehicle) {
      targetVehicleId = foundVehicle.id;
    }
  }

  // Fallback to driver's first assigned vehicle
  if (!targetVehicleId && driver.vehicles.length > 0) {
    targetVehicleId = driver.vehicles[0]?.id;
  }

  if (!targetVehicleId) {
    throw ApiError.badRequest('Vehicle ID or plate number is required');
  }

  let photoUrl = '';
  let photoPublicId: string | null = null;

  if (photoFile?.buffer) {
    try {
      const uploaded = await uploadBuffer(photoFile.buffer, {
        folder: 'vehicle-maintenance-proofs',
        resourceType: 'image',
      });
      photoUrl = uploaded.url;
      photoPublicId = uploaded.publicId;
    } catch {
      // Proceed or fail gracefully
      photoUrl = '';
    }
  }

  const record = await prisma.maintenanceRecord.create({
    data: {
      driverId: driver.id,
      vehicleId: targetVehicleId,
      type: parsed.type ?? 'TYRE',
      itemNumber: parsed.itemNumber.trim(),
      oldItemNumber: parsed.oldItemNumber ? parsed.oldItemNumber.trim() : null,
      quantity: parsed.quantity ?? 1,
      photoUrl: photoUrl || '',
      photoPublicId,
      odometerKm: parsed.odometerKm ?? null,
      brand: parsed.brand ? parsed.brand.trim() : null,
      position: parsed.position ? parsed.position.trim() : null,
      cost: parsed.cost !== undefined && parsed.cost !== null ? parsed.cost : null,
      notes: parsed.notes ? parsed.notes.trim() : null,
    },
    include: {
      driver: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              employeeId: true,
            },
          },
        },
      },
      vehicle: true,
    },
  });

  return record;
}

export async function listMaintenanceRecords(opts: MaintenanceFilterOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: any = {};

  // If role is DRIVER, restrict to their driver record
  if (opts.userRole === 'DRIVER' && opts.driverUserId) {
    const driver = await prisma.driver.findUnique({
      where: { userId: opts.driverUserId },
      select: { id: true },
    });
    if (driver) {
      where.driverId = driver.id;
    } else {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  } else if (opts.driverUserId) {
    where.driver = {
      OR: [
        { id: opts.driverUserId },
        { userId: opts.driverUserId },
      ],
    };
  }

  if (opts.vehicleId) {
    where.vehicleId = opts.vehicleId;
  }

  if (opts.type) {
    where.type = opts.type;
  }

  if (opts.startDate || opts.endDate) {
    where.createdAt = {};
    if (opts.startDate) {
      where.createdAt.gte = new Date(opts.startDate);
    }
    if (opts.endDate) {
      where.createdAt.lte = new Date(opts.endDate);
    }
  }

  if (opts.search && opts.search.trim()) {
    const term = opts.search.trim();
    where.OR = [
      { itemNumber: { contains: term, mode: 'insensitive' } },
      { oldItemNumber: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { notes: { contains: term, mode: 'insensitive' } },
      {
        vehicle: {
          plateNumber: { contains: term, mode: 'insensitive' },
        },
      },
      {
        driver: {
          user: {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { employeeId: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                employeeId: true,
              },
            },
          },
        },
        vehicle: true,
      },
    }),
    prisma.maintenanceRecord.count({ where }),
  ]);

  return {
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getMaintenanceStatsSummary(opts: {
  startDate?: string;
  endDate?: string;
  vehicleId?: string;
}) {
  const where: any = {};

  if (opts.vehicleId) {
    where.vehicleId = opts.vehicleId;
  }

  if (opts.startDate || opts.endDate) {
    where.createdAt = {};
    if (opts.startDate) where.createdAt.gte = new Date(opts.startDate);
    if (opts.endDate) where.createdAt.lte = new Date(opts.endDate);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [tyreCount, batteryCount, totalEntries, recentThisMonth] = await Promise.all([
    prisma.maintenanceRecord.count({
      where: { ...where, type: 'TYRE' },
    }),
    prisma.maintenanceRecord.count({
      where: { ...where, type: 'BATTERY' },
    }),
    prisma.maintenanceRecord.count({ where }),
    prisma.maintenanceRecord.count({
      where: {
        ...where,
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  return {
    totalTyreCount: tyreCount,
    totalBatteryCount: batteryCount,
    totalEntriesCount: totalEntries,
    recentThisMonthCount: recentThisMonth,
  };
}
