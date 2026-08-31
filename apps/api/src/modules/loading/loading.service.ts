import { prisma } from '../../lib/prisma';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { emitToUsers } from '../../realtime/socket';
import { getActiveAdminUserIds } from '../../lib/admin-cache';
import { REALTIME_EVENTS, type LoadingRecord, type LoadingStatus } from '@driver-complaint/shared-types';
import { ApiError } from '../../errors/api-error';

export function formatDurationText(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 1) return '< 1 min';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export async function getDriverTripStats(driverId: string): Promise<{
  completedTripsCount: number;
  monthlyTripsCount: number;
}> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [completedTripsCount, monthlyTripsCount] = await Promise.all([
    prisma.loadingRecord.count({
      where: {
        driverId,
        status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
      },
    }),
    prisma.loadingRecord.count({
      where: {
        driverId,
        status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  return { completedTripsCount, monthlyTripsCount };
}

async function serializeLoadingRecord(
  rec: any,
  overrideStats?: { completedTripsCount?: number; monthlyTripsCount?: number },
): Promise<LoadingRecord> {
  const driverUser = rec.driver?.user;
  const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : undefined;
  const vehicle = rec.driver?.vehicles?.[0];
  const vehiclePlate = vehicle ? vehicle.plateNumber : undefined;

  let stats = overrideStats;
  if (!stats) {
    stats = rec.driverId
      ? await getDriverTripStats(rec.driverId)
      : { completedTripsCount: 0, monthlyTripsCount: 0 };
  }

  return {
    id: rec.id,
    driverId: rec.driverId,
    complaintId: rec.complaintId ?? null,
    locationName: rec.locationName ?? null,
    reachedAt: rec.reachedAt.toISOString(),
    reachedLatitude: rec.reachedLatitude,
    reachedLongitude: rec.reachedLongitude,
    reachedAddress: rec.reachedAddress ?? null,
    reachedPhotoUrl: rec.reachedPhotoUrl,
    completedAt: rec.completedAt ? rec.completedAt.toISOString() : null,
    completedLatitude: rec.completedLatitude ?? null,
    completedLongitude: rec.completedLongitude ?? null,
    completedAddress: rec.completedAddress ?? null,
    completedPhotoUrl: rec.completedPhotoUrl ?? null,

    tripStartedAt: rec.tripStartedAt ? rec.tripStartedAt.toISOString() : null,
    tripStartLatitude: rec.tripStartLatitude ?? null,
    tripStartLongitude: rec.tripStartLongitude ?? null,
    tripStartAddress: rec.tripStartAddress ?? null,

    tripCompletedAt: rec.tripCompletedAt ? rec.tripCompletedAt.toISOString() : null,
    tripCompletedLatitude: rec.tripCompletedLatitude ?? null,
    tripCompletedLongitude: rec.tripCompletedLongitude ?? null,
    tripCompletedAddress: rec.tripCompletedAddress ?? null,
    tripCompletedPhotoUrl: rec.tripCompletedPhotoUrl ?? null,
    tripDurationMinutes: rec.tripDurationMinutes ?? null,
    formattedTripDuration: formatDurationText(rec.tripDurationMinutes),

    waitingTimeMinutes: rec.waitingTimeMinutes ?? null,
    formattedWaitingTime: formatDurationText(rec.waitingTimeMinutes),
    status: rec.status as LoadingStatus,
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
    driverName,
    vehiclePlate,
    completedTripsCount: stats.completedTripsCount ?? 0,
    monthlyTripsCount: stats.monthlyTripsCount ?? 0,
  };
}

export async function markReachedLoadingPoint(opts: {
  userId: string;
  fileBuffer: Buffer;
  latitude: number;
  longitude: number;
  address?: string;
  locationName?: string;
  complaintId?: string;
}): Promise<LoadingRecord> {
  const driver = await prisma.driver.findUnique({
    where: { userId: opts.userId },
  });
  if (!driver) {
    throw ApiError.forbidden('Only registered drivers can record loading point milestones');
  }

  // Check if there is already an active loading session for this driver
  const existingActive = await prisma.loadingRecord.findFirst({
    where: { driverId: driver.id, status: { in: ['REACHED', 'TRIP_STARTED'] } },
  });
  if (existingActive) {
    throw ApiError.badRequest('You already have an active loading/trip session in progress');
  }

  // Upload photo proof
  const asset = await uploadBuffer(opts.fileBuffer, {
    folder: `${cloudinaryFolder}/loading`,
    resourceType: 'image',
  });

  const record = await prisma.loadingRecord.create({
    data: {
      driverId: driver.id,
      complaintId: opts.complaintId || null,
      locationName: opts.locationName || 'Loading Point',
      reachedAt: new Date(),
      reachedLatitude: opts.latitude,
      reachedLongitude: opts.longitude,
      reachedAddress: opts.address || null,
      reachedPhotoUrl: asset.url,
      reachedPublicId: asset.publicId,
      status: 'REACHED',
    },
    include: {
      driver: {
        include: {
          user: true,
          vehicles: true,
        },
      },
    },
  });

  const serialized = await serializeLoadingRecord(record);

  // Broadcast realtime event to all admins
  const adminIds = await getActiveAdminUserIds();
  emitToUsers(adminIds, REALTIME_EVENTS.loadingReached as any, {
    complaintId: record.id,
    complaintNo: 'LOADING-REACHED',
    title: `Driver ${serialized.driverName || 'Driver'} arrived at loading point`,
    status: 'IN_PROGRESS' as any,
    at: record.reachedAt.toISOString(),
  });

  return serialized;
}

export async function markLoadingCompleted(opts: {
  userId: string;
  loadingId?: string;
  fileBuffer: Buffer;
  latitude: number;
  longitude: number;
  address?: string;
}): Promise<LoadingRecord> {
  const driver = await prisma.driver.findUnique({
    where: { userId: opts.userId },
  });
  if (!driver) {
    throw ApiError.forbidden('Only registered drivers can record loading point milestones');
  }

  let recordToUpdate;
  if (opts.loadingId) {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { id: opts.loadingId, driverId: driver.id },
    });
  } else {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { driverId: driver.id, status: 'REACHED' },
      orderBy: { reachedAt: 'desc' },
    });
  }

  if (!recordToUpdate || recordToUpdate.status === 'COMPLETED' || recordToUpdate.status === 'TRIP_STARTED' || recordToUpdate.status === 'TRIP_COMPLETED') {
    throw ApiError.notFound('No active loading session found to complete');
  }

  // Upload completion photo proof
  const asset = await uploadBuffer(opts.fileBuffer, {
    folder: `${cloudinaryFolder}/loading`,
    resourceType: 'image',
  });

  const completedAt = new Date();
  const diffMs = completedAt.getTime() - recordToUpdate.reachedAt.getTime();
  const waitingTimeMinutes = Math.max(0, Math.round(diffMs / 60000));

  const updated = await prisma.loadingRecord.update({
    where: { id: recordToUpdate.id },
    data: {
      completedAt,
      completedLatitude: opts.latitude,
      completedLongitude: opts.longitude,
      completedAddress: opts.address || null,
      completedPhotoUrl: asset.url,
      completedPublicId: asset.publicId,
      waitingTimeMinutes,
      status: 'COMPLETED',
    },
    include: {
      driver: {
        include: {
          user: true,
          vehicles: true,
        },
      },
    },
  });

  const serialized = await serializeLoadingRecord(updated);

  // Broadcast realtime event to admins
  const adminIds = await getActiveAdminUserIds();
  emitToUsers(adminIds, REALTIME_EVENTS.loadingCompleted as any, {
    complaintId: updated.id,
    complaintNo: 'LOADING-COMPLETED',
    title: `Driver ${serialized.driverName || 'Driver'} completed loading (Duration: ${serialized.formattedWaitingTime})`,
    status: 'RESOLVED' as any,
    at: completedAt.toISOString(),
  });

  return serialized;
}

export async function startTrip(opts: {
  userId: string;
  loadingId?: string;
  latitude: number;
  longitude: number;
  address?: string;
}): Promise<LoadingRecord> {
  const driver = await prisma.driver.findUnique({
    where: { userId: opts.userId },
  });
  if (!driver) {
    throw ApiError.forbidden('Only registered drivers can start trips');
  }

  let recordToUpdate;
  if (opts.loadingId) {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { id: opts.loadingId, driverId: driver.id },
    });
  } else {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { driverId: driver.id, status: { in: ['COMPLETED', 'REACHED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!recordToUpdate) {
    throw ApiError.notFound('No loading session found to start trip');
  }

  const tripStartedAt = new Date();
  const updated = await prisma.loadingRecord.update({
    where: { id: recordToUpdate.id },
    data: {
      tripStartedAt,
      tripStartLatitude: opts.latitude,
      tripStartLongitude: opts.longitude,
      tripStartAddress: opts.address || null,
      status: 'TRIP_STARTED',
    },
    include: {
      driver: {
        include: {
          user: true,
          vehicles: true,
        },
      },
    },
  });

  return await serializeLoadingRecord(updated);
}

export async function completeTrip(opts: {
  userId: string;
  loadingId?: string;
  fileBuffer: Buffer;
  latitude: number;
  longitude: number;
  address?: string;
}): Promise<LoadingRecord> {
  const driver = await prisma.driver.findUnique({
    where: { userId: opts.userId },
  });
  if (!driver) {
    throw ApiError.forbidden('Only registered drivers can complete trips');
  }

  let recordToUpdate;
  if (opts.loadingId) {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { id: opts.loadingId, driverId: driver.id },
    });
  } else {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { driverId: driver.id, status: 'TRIP_STARTED' },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!recordToUpdate || !recordToUpdate.tripStartedAt) {
    throw ApiError.notFound('No active trip session found to complete');
  }

  const asset = await uploadBuffer(opts.fileBuffer, {
    folder: `${cloudinaryFolder}/trips`,
    resourceType: 'image',
  });

  const tripCompletedAt = new Date();
  const diffMs = tripCompletedAt.getTime() - recordToUpdate.tripStartedAt.getTime();
  const tripDurationMinutes = Math.max(0, Math.round(diffMs / 60000));

  const updated = await prisma.loadingRecord.update({
    where: { id: recordToUpdate.id },
    data: {
      tripCompletedAt,
      tripCompletedLatitude: opts.latitude,
      tripCompletedLongitude: opts.longitude,
      tripCompletedAddress: opts.address || null,
      tripCompletedPhotoUrl: asset.url,
      tripCompletedPublicId: asset.publicId,
      tripDurationMinutes,
      status: 'TRIP_COMPLETED',
    },
    include: {
      driver: {
        include: {
          user: true,
          vehicles: true,
        },
      },
    },
  });

  return await serializeLoadingRecord(updated);
}

export async function getActiveLoadingRecord(userId: string): Promise<{
  active: LoadingRecord | null;
  stats: { completedTripsCount: number; monthlyTripsCount: number };
}> {
  const driver = await prisma.driver.findUnique({
    where: { userId },
  });
  if (!driver) {
    return { active: null, stats: { completedTripsCount: 0, monthlyTripsCount: 0 } };
  }

  const [record, stats] = await Promise.all([
    prisma.loadingRecord.findFirst({
      where: { driverId: driver.id, status: { in: ['REACHED', 'COMPLETED', 'TRIP_STARTED'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: {
          include: {
            user: true,
            vehicles: true,
          },
        },
      },
    }),
    getDriverTripStats(driver.id),
  ]);

  return {
    active: record ? await serializeLoadingRecord(record, stats) : null,
    stats,
  };
}

export async function listDriverLoadingRecords(userId: string, limit = 50): Promise<LoadingRecord[]> {
  const driver = await prisma.driver.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!driver) return [];

  return listLoadingRecords({
    driverId: driver.id,
    limit: Math.min(Math.max(limit, 1), 100),
  });
}

export async function listLoadingRecords(opts: {
  driverId?: string;
  status?: LoadingStatus;
  limit?: number;
}): Promise<LoadingRecord[]> {
  const records = await prisma.loadingRecord.findMany({
    where: {
      ...(opts.driverId ? { driverId: opts.driverId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { reachedAt: 'desc' },
    take: opts.limit ?? 50,
    include: {
      driver: {
        include: {
          user: true,
          vehicles: true,
        },
      },
    },
  });

  if (records.length === 0) return [];

  // Batch query completed trip counts for all distinct driverIds in the result set
  const driverIds = Array.from(new Set(records.map((r) => r.driverId).filter(Boolean)));
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalCounts, monthlyCounts] = await Promise.all([
    prisma.loadingRecord.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
      },
      _count: { id: true },
    }),
    prisma.loadingRecord.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
        createdAt: { gte: startOfMonth },
      },
      _count: { id: true },
    }),
  ]);

  const totalMap = new Map<string, number>(totalCounts.map((c) => [c.driverId, c._count.id]));
  const monthlyMap = new Map<string, number>(monthlyCounts.map((c) => [c.driverId, c._count.id]));

  return Promise.all(
    records.map((rec) =>
      serializeLoadingRecord(rec, {
        completedTripsCount: totalMap.get(rec.driverId) ?? 0,
        monthlyTripsCount: monthlyMap.get(rec.driverId) ?? 0,
      }),
    ),
  );
}
