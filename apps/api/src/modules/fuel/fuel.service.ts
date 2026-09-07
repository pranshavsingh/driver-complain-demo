import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { uploadBuffer } from '../../lib/cloudinary';
import { CreateFuelRecordSchema, type FuelType } from '@driver-complaint/shared-types';

export interface CreateFuelInput {
  vehicleId?: string;
  vehicleNumber?: string;
  type?: FuelType;
  quantityLtr: number;
  totalPrice: number;
  odometerKm?: number;
  notes?: string;
}

export interface FuelFilterOpts {
  driverUserId?: string;
  userRole?: string;
  vehicleId?: string;
  type?: FuelType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export async function createFuelRecord(
  userId: string,
  input: CreateFuelInput,
  receiptFile?: Express.Multer.File,
) {
  const parsed = CreateFuelRecordSchema.parse(input);

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
    throw ApiError.forbidden('Only registered drivers can log fuel entries');
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

  const ratePerLtr = parsed.quantityLtr > 0 ? parsed.totalPrice / parsed.quantityLtr : 0;

  let receiptUrl: string | null = null;
  let receiptPublicId: string | null = null;

  if (receiptFile?.buffer) {
    try {
      const uploaded = await uploadBuffer(receiptFile.buffer, {
        folder: 'fuel-receipts',
        resourceType: 'image',
      });
      receiptUrl = uploaded.url;
      receiptPublicId = uploaded.publicId;
    } catch {
      // If cloudinary fails, proceed without image rather than crashing fuel log
    }
  }

  const fuelRecord = await prisma.fuelRecord.create({
    data: {
      driverId: driver.id,
      vehicleId: targetVehicleId,
      type: parsed.type ?? 'FUEL',
      quantityLtr: parsed.quantityLtr,
      totalPrice: parsed.totalPrice,
      ratePerLtr: Number(ratePerLtr.toFixed(2)),
      odometerKm: parsed.odometerKm ?? null,
      receiptUrl,
      receiptPublicId,
      notes: parsed.notes ?? null,
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

  return fuelRecord;
}

export async function listFuelRecords(opts: FuelFilterOpts) {
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
    // Admin filtering by driver ID or driver user ID
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

  const [items, total] = await Promise.all([
    prisma.fuelRecord.findMany({
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
    prisma.fuelRecord.count({ where }),
  ]);

  return {
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getFuelStatsSummary(opts: { startDate?: string; endDate?: string; vehicleId?: string }) {
  const where: any = {};

  if (opts.vehicleId) {
    where.vehicleId = opts.vehicleId;
  }

  if (opts.startDate || opts.endDate) {
    where.createdAt = {};
    if (opts.startDate) where.createdAt.gte = new Date(opts.startDate);
    if (opts.endDate) where.createdAt.lte = new Date(opts.endDate);
  }

  const [fuelAgg, defAgg, totalEntries] = await Promise.all([
    prisma.fuelRecord.aggregate({
      where: { ...where, type: 'FUEL' },
      _sum: { totalPrice: true, quantityLtr: true },
    }),
    prisma.fuelRecord.aggregate({
      where: { ...where, type: 'DEF' },
      _sum: { totalPrice: true, quantityLtr: true },
    }),
    prisma.fuelRecord.count({ where }),
  ]);

  return {
    totalFuelCost: fuelAgg._sum.totalPrice ?? 0,
    totalDefCost: defAgg._sum.totalPrice ?? 0,
    totalFuelVolumeLtr: fuelAgg._sum.quantityLtr ?? 0,
    totalDefVolumeLtr: defAgg._sum.quantityLtr ?? 0,
    totalEntriesCount: totalEntries,
  };
}
