import { prisma } from '../../lib/prisma';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { emitToUsers } from '../../realtime/socket';
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

async function getCompletedTripsCountForDriver(driverId: string): Promise<number> {
  return await prisma.loadingRecord.count({
    where: {
      driverId,
      status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
    },
  });
}

async function serializeLoadingRecord(rec: any): Promise<LoadingRecord> {
  const driverUser = rec.driver?.user;
  const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : undefined;
  const vehicle = rec.driver?.vehicles?.[0];
  const vehiclePlate = vehicle ? vehicle.plateNumber : undefined;

  const count = rec.driverId ? await getCompletedTripsCountForDriver(rec.driverId) : 0;

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
    completedTripsCount: count,
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
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  const adminIds = admins.map((a) => a.id);
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
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  const adminIds = admins.map((a) => a.id);
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

export async function getActiveLoadingRecord(userId: string): Promise<LoadingRecord | null> {
  const driver = await prisma.driver.findUnique({
    where: { userId },
  });
  if (!driver) return null;

  const record = await prisma.loadingRecord.findFirst({
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
  });

  return record ? await serializeLoadingRecord(record) : null;
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

  return await Promise.all(records.map(serializeLoadingRecord));
}
