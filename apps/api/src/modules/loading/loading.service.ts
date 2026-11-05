import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { emitToUsers } from '../../realtime/socket';
import { getActiveAdminUserIds } from '../../lib/admin-cache';
import { buildPaginationMetadata } from '../../lib/pagination';
import { REALTIME_EVENTS, type LoadingRecord, type LoadingStatus, type Role } from '@driver-complaint/shared-types';
import { ApiError } from '../../errors/api-error';
import { resolveUserScope } from '../../lib/user-scope';

export interface Actor {
  id: string;
  role: Role;
  site?: string | null;
}

export function formatDurationText(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  const totalSec = Math.max(0, Math.round(minutes * 60));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export function formatHmsFromDates(start?: Date | null, end?: Date | null, fallbackMinutes?: number | null): string | null {
  if (start && end) {
    const diffSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return formatDurationText(fallbackMinutes);
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
        status: { in: ['TRIP_COMPLETED', 'COMPLETED', 'UNLOADING'] },
      },
    }),
    prisma.loadingRecord.count({
      where: {
        driverId,
        status: { in: ['TRIP_COMPLETED', 'COMPLETED', 'UNLOADING'] },
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  return { completedTripsCount, monthlyTripsCount };
}

async function serializeLoadingRecord(
  rec: Record<string, any> & {
    id: string;
    driverId: string;
    complaintId?: string | null;
    driver?: {
      user?: { firstName?: string; lastName?: string } | null;
      vehicles?: { plateNumber?: string }[] | null;
    } | null;
  },
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
    formattedTripDuration: formatHmsFromDates(rec.tripStartedAt, rec.tripCompletedAt, rec.tripDurationMinutes),

    unloadingCompletedAt: rec.unloadingCompletedAt ? rec.unloadingCompletedAt.toISOString() : null,
    unloadingLatitude: rec.unloadingLatitude ?? null,
    unloadingLongitude: rec.unloadingLongitude ?? null,
    unloadingAddress: rec.unloadingAddress ?? null,
    unloadingPhotoUrl: rec.unloadingPhotoUrl ?? null,
    unloadingDurationMinutes: rec.unloadingDurationMinutes ?? null,
    formattedUnloadingDuration: formatHmsFromDates(rec.tripCompletedAt, rec.unloadingCompletedAt, rec.unloadingDurationMinutes),

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

  // Check if there is already an active loading session for this driver.
  // SAFETY-CRITICAL: UNLOADING must stay in this list — a driver who has arrived at the
  // destination but not yet tapped "Unloading Done" still owns an open cycle, and letting
  // them start a second one would orphan the unloading time on the first.
  const existingActive = await prisma.loadingRecord.findFirst({
    where: { driverId: driver.id, status: { in: ['REACHED', 'TRIP_STARTED', 'UNLOADING'] } },
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
  emitToUsers(adminIds, REALTIME_EVENTS.loadingReached, {
    complaintId: record.id,
    complaintNo: 'LOADING-REACHED',
    title: `Driver ${serialized.driverName || 'Driver'} arrived at loading point`,
    status: 'IN_PROGRESS',
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

  if (!recordToUpdate || recordToUpdate.status !== 'REACHED') {
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
  emitToUsers(adminIds, REALTIME_EVENTS.loadingCompleted, {
    complaintId: updated.id,
    complaintNo: 'LOADING-COMPLETED',
    title: `Driver ${serialized.driverName || 'Driver'} completed loading (Duration: ${serialized.formattedWaitingTime})`,
    status: 'RESOLVED',
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

/**
 * Driver reached the unloading point: transit ends here, so this writes tripCompletedAt and
 * tripDurationMinutes, then parks the record in UNLOADING while the vehicle is unloaded.
 * The cycle is closed later by completeUnloading().
 */
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

  console.log('[DEBUG completeTrip] recordToUpdate:', recordToUpdate);
  console.log('[DEBUG completeTrip] updating id:', recordToUpdate.id);

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
      status: 'UNLOADING',
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

/**
 * Driver tapped "Unloading Done" at the destination. Closes the cycle: records the unloading
 * wait (unloadingCompletedAt - tripCompletedAt) and moves the record to TRIP_COMPLETED, which
 * is the terminal state every completed-trip count keys off.
 */
export async function completeUnloading(opts: {
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
    throw ApiError.forbidden('Only registered drivers can complete unloading');
  }

  let recordToUpdate;
  if (opts.loadingId) {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { id: opts.loadingId, driverId: driver.id },
    });
  } else {
    recordToUpdate = await prisma.loadingRecord.findFirst({
      where: { driverId: driver.id, status: 'UNLOADING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!recordToUpdate || recordToUpdate.status !== 'UNLOADING' || !recordToUpdate.tripCompletedAt) {
    throw ApiError.notFound('No active unloading session found to complete');
  }

  const asset = await uploadBuffer(opts.fileBuffer, {
    folder: `${cloudinaryFolder}/unloading`,
    resourceType: 'image',
  });

  const unloadingCompletedAt = new Date();
  const diffMs = unloadingCompletedAt.getTime() - recordToUpdate.tripCompletedAt.getTime();
  const unloadingDurationMinutes = Math.max(0, Math.round(diffMs / 60000));

  const updated = await prisma.loadingRecord.update({
    where: { id: recordToUpdate.id },
    data: {
      unloadingCompletedAt,
      unloadingLatitude: opts.latitude,
      unloadingLongitude: opts.longitude,
      unloadingAddress: opts.address || null,
      unloadingPhotoUrl: asset.url,
      unloadingPublicId: asset.publicId,
      unloadingDurationMinutes,
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

  const serialized = await serializeLoadingRecord(updated);

  // Reuses the existing loading:completed event so the admin Trip Analytics page — which
  // already subscribes to it — refreshes without needing a new event type.
  const adminIds = await getActiveAdminUserIds();
  emitToUsers(adminIds, REALTIME_EVENTS.loadingCompleted, {
    complaintId: updated.id,
    complaintNo: 'UNLOADING-COMPLETED',
    title: `Driver ${serialized.driverName || 'Driver'} finished unloading (Duration: ${serialized.formattedUnloadingDuration})`,
    status: 'RESOLVED',
    at: unloadingCompletedAt.toISOString(),
  });

  return serialized;
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
      // UNLOADING is included so the mobile card can resume the unloading timer after the
      // app is force-closed and reopened mid-unload.
      where: { driverId: driver.id, status: { in: ['REACHED', 'COMPLETED', 'TRIP_STARTED', 'UNLOADING'] } },
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

export async function getDelayedLoadingCount(actor: Actor): Promise<number> {
  if (!actor || !actor.role) {
    return 0; // Fail-closed: missing or unauthenticated actor cannot receive global count
  }

  const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
  const delayCondition: Prisma.LoadingRecordWhereInput = {
    OR: [
      { waitingTimeMinutes: { gt: 180 } },
      { unloadingDurationMinutes: { gt: 180 } },
      { status: 'REACHED', reachedAt: { lte: threeHoursAgo } },
      { status: 'UNLOADING', tripCompletedAt: { lte: threeHoursAgo } },
    ],
  };

  // ADMIN and SUPER_ADMIN receive authorized global count
  if (actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN') {
    return prisma.loadingRecord.count({
      where: delayCondition,
    });
  }

  // EXECUTIVE receives only the count within their permitted site/vehicle scope
  if (actor.role === 'EXECUTIVE') {
    const scope = await resolveUserScope(actor.id, actor.role);

    const scopeConditions: Prisma.LoadingRecordWhereInput[] = [
      { driver: { vehicles: { some: { siteInchargeId: actor.id } } } },
      { complaint: { vehicle: { siteInchargeId: actor.id } } },
    ];

    if (scope.site) {
      scopeConditions.push(
        { driver: { vehicles: { some: { siteIncharge: { site: { equals: scope.site, mode: 'insensitive' } } } } } },
        { complaint: { vehicle: { siteIncharge: { site: { equals: scope.site, mode: 'insensitive' } } } } },
      );
    }

    return prisma.loadingRecord.count({
      where: {
        AND: [
          delayCondition,
          { OR: scopeConditions },
        ],
      },
    });
  }

  return 0;
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
        status: { in: ['TRIP_COMPLETED', 'COMPLETED', 'UNLOADING'] },
      },
      _count: { id: true },
    }),
    prisma.loadingRecord.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        status: { in: ['TRIP_COMPLETED', 'COMPLETED', 'UNLOADING'] },
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

export interface TripFilters {
  search?: string;
  driverId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  year?: number;
  month?: number;
}

function tripWhere(filters: TripFilters): Prisma.LoadingRecordWhereInput {
  const search = filters.search?.trim();

  let fromDate = filters.from;
  let toDate = filters.to;

  if (!fromDate && filters.year) {
    if (filters.month && filters.month >= 1 && filters.month <= 12) {
      fromDate = new Date(filters.year, filters.month - 1, 1, 0, 0, 0, 0);
      toDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
    } else {
      fromDate = new Date(filters.year, 0, 1, 0, 0, 0, 0);
      toDate = new Date(filters.year, 11, 31, 23, 59, 59, 999);
    }
  }

  return {
    ...(fromDate || toDate
      ? {
          reachedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(filters.driverId ? { driverId: filters.driverId } : {}),
    ...(filters.status === 'ACTIVE' ? { status: 'TRIP_STARTED' } : {}),
    ...(filters.status === 'COMPLETED' ? { status: 'TRIP_COMPLETED' } : {}),
    ...(filters.status && filters.status !== 'ALL' && filters.status !== 'ACTIVE' && filters.status !== 'COMPLETED'
      ? { status: filters.status as Prisma.EnumLoadingStatusFilter }
      : {}),
    ...(search
      ? {
          OR: [
            { locationName: { contains: search, mode: 'insensitive' } },
            { reachedAddress: { contains: search, mode: 'insensitive' } },
            { tripStartAddress: { contains: search, mode: 'insensitive' } },
            { tripCompletedAddress: { contains: search, mode: 'insensitive' } },
            { driver: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
            { driver: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
            { driver: { user: { employeeId: { contains: search, mode: 'insensitive' } } } },
            { driver: { licenseNumber: { contains: search, mode: 'insensitive' } } },
            { driver: { vehicles: { some: { plateNumber: { contains: search, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };
}

const tripInclude = {
  driver: { include: { user: true, vehicles: true } },
} as const;

export async function listTripRecords(opts: TripFilters & { page: number; pageSize: number }) {
  const where = tripWhere(opts);
  const [rows, total] = await Promise.all([
    prisma.loadingRecord.findMany({
      where,
      include: tripInclude,
      orderBy: [{ reachedAt: 'desc' }, { id: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.loadingRecord.count({ where }),
  ]);

  if (rows.length === 0) {
    return {
      data: [],
      meta: buildPaginationMetadata(total, opts.page, opts.pageSize),
    };
  }

  // Batch query completed and monthly trip counts for all distinct driverIds in current page to eliminate N+1 queries
  const driverIds = Array.from(new Set(rows.map((r) => r.driverId).filter(Boolean)));
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalCounts, monthlyCounts] = await Promise.all([
    prisma.loadingRecord.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        status: { in: ['TRIP_COMPLETED', 'COMPLETED', 'UNLOADING'] },
      },
      _count: { _all: true },
    }),
    prisma.loadingRecord.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        status: { in: ['TRIP_COMPLETED', 'COMPLETED', 'UNLOADING'] },
        createdAt: { gte: startOfMonth },
      },
      _count: { _all: true },
    }),
  ]);

  const totalMap = new Map<string, number>(totalCounts.map((c) => [c.driverId, c._count._all]));
  const monthlyMap = new Map<string, number>(monthlyCounts.map((c) => [c.driverId, c._count._all]));

  const data = await Promise.all(
    rows.map((row) =>
      serializeLoadingRecord(row, {
        completedTripsCount: totalMap.get(row.driverId) ?? 0,
        monthlyTripsCount: monthlyMap.get(row.driverId) ?? 0,
      }),
    ),
  );

  return {
    data,
    meta: buildPaginationMetadata(total, opts.page, opts.pageSize),
  };
}

export async function* iterateTripRecords(filters: TripFilters) {
  const batchSize = 500;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.loadingRecord.findMany({
      where: tripWhere(filters),
      include: tripInclude,
      orderBy: [{ reachedAt: 'desc' }, { id: 'desc' }],
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) return;
    yield rows;
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) return;
  }
}

export async function getDriverMonthlyTripSummaries(opts: {
  year?: number;
  month?: number;
  driverId?: string;
  search?: string;
  status?: string;
}): Promise<Record<string, unknown>[]> {
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (opts.year) {
    if (opts.month && opts.month >= 1 && opts.month <= 12) {
      fromDate = new Date(opts.year, opts.month - 1, 1, 0, 0, 0, 0);
      toDate = new Date(opts.year, opts.month, 0, 23, 59, 59, 999);
    } else {
      fromDate = new Date(opts.year, 0, 1, 0, 0, 0, 0);
      toDate = new Date(opts.year, 11, 31, 23, 59, 59, 999);
    }
  } else if (opts.month && opts.month >= 1 && opts.month <= 12) {
    const currentYear = new Date().getFullYear();
    fromDate = new Date(currentYear, opts.month - 1, 1, 0, 0, 0, 0);
    toDate = new Date(currentYear, opts.month, 0, 23, 59, 59, 999);
  }

  const search = opts.search?.trim();

  // Build parameterized conditions safely using Prisma.sql
  const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

  if (fromDate && toDate) {
    conditions.push(Prisma.sql`lr."reachedAt" >= ${fromDate} AND lr."reachedAt" <= ${toDate}`);
  }

  if (opts.driverId) {
    conditions.push(Prisma.sql`lr."driverId" = ${opts.driverId}::uuid`);
  }

  if (opts.status) {
    conditions.push(Prisma.sql`lr."status"::text = ${opts.status}`);
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(Prisma.sql`(
      u."firstName" ILIKE ${searchPattern} OR
      u."lastName" ILIKE ${searchPattern} OR
      u."employeeId" ILIKE ${searchPattern} OR
      d."licenseNumber" ILIKE ${searchPattern} OR
      EXISTS (
        SELECT 1 FROM "Vehicle" v 
        WHERE v."driverId" = d."id" AND v."plateNumber" ILIKE ${searchPattern}
      )
    )`);
  }

  const whereClause = Prisma.join(conditions, ' AND ');

  const rows = await prisma.$queryRaw<
    Array<{
      driver_id: string;
      year: number;
      month: number;
      completed_trips_count: number;
      total_trip_duration_minutes: number;
      total_waiting_time_minutes: number;
      total_unloading_time_minutes: number;
      driver_name: string;
      license_number: string;
      vehicle_plate: string;
    }>
  >(Prisma.sql`
    SELECT
      lr."driverId"::text AS driver_id,
      EXTRACT(YEAR FROM lr."reachedAt")::int AS year,
      EXTRACT(MONTH FROM lr."reachedAt")::int AS month,
      COUNT(*)::int AS completed_trips_count,
      COALESCE(SUM(lr."tripDurationMinutes"), 0)::int AS total_trip_duration_minutes,
      COALESCE(SUM(lr."waitingTimeMinutes"), 0)::int AS total_waiting_time_minutes,
      COALESCE(SUM(lr."unloadingDurationMinutes"), 0)::int AS total_unloading_time_minutes,
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))), ''),
        'Unknown Driver'
      ) AS driver_name,
      COALESCE(d."licenseNumber", 'N/A') AS license_number,
      COALESCE(
        (SELECT v."plateNumber" FROM "Vehicle" v WHERE v."driverId" = d."id" ORDER BY v."createdAt" DESC, v."id" DESC LIMIT 1),
        'N/A'
      ) AS vehicle_plate
    FROM "LoadingRecord" lr
    JOIN "Driver" d ON d."id" = lr."driverId"
    LEFT JOIN "User" u ON u."id" = d."userId"
    WHERE ${whereClause}
    GROUP BY
      lr."driverId",
      EXTRACT(YEAR FROM lr."reachedAt"),
      EXTRACT(MONTH FROM lr."reachedAt"),
      u."firstName",
      u."lastName",
      d."licenseNumber",
      d."id"
    ORDER BY
      year DESC,
      month DESC,
      completed_trips_count DESC
  `);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return rows.map((r) => {
    const completedTripsCount = Number(r.completed_trips_count ?? 0);
    const totalTripDurationMinutes = Number(r.total_trip_duration_minutes ?? 0);
    const totalUnloadingTimeMinutes = Number(r.total_unloading_time_minutes ?? 0);
    const totalWaitingTimeMinutes = Number(r.total_waiting_time_minutes ?? 0);
    const year = Number(r.year);
    const month = Number(r.month);

    return {
      driverId: r.driver_id,
      driverName: r.driver_name,
      licenseNumber: r.license_number,
      vehiclePlate: r.vehicle_plate,
      year,
      month,
      completedTripsCount,
      totalTripDurationMinutes,
      totalWaitingTimeMinutes,
      totalUnloadingTimeMinutes,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      avgTripDurationMinutes: completedTripsCount > 0 ? Math.round(totalTripDurationMinutes / completedTripsCount) : 0,
      avgUnloadingTimeMinutes: completedTripsCount > 0 ? Math.round(totalUnloadingTimeMinutes / completedTripsCount) : 0,
    };
  });
}

export async function exportTripsToCsv(filters: TripFilters): Promise<string> {
  const where = tripWhere(filters);
  const rows = await prisma.loadingRecord.findMany({
    where,
    include: tripInclude,
    orderBy: { reachedAt: 'desc' },
    take: 5000,
  });

  const headers = [
    'Trip ID',
    'Driver Name',
    'Employee ID',
    'License Number',
    'Vehicle Plate',
    'Status',
    'Reached Time',
    'Trip Started Time',
    'Trip Completed Time',
    'Trip Duration (mins)',
    'Waiting Time (mins)',
    'Unloading Completed Time',
    'Unloading Duration (mins)',
    'Unloading Address',
    'Reached Location',
    'Start Address',
    'Completion Address',
  ];

  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = [headers.join(',')];

  for (const rec of rows) {
    const driverUser = rec.driver?.user;
    const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Unknown';
    const employeeId = driverUser?.employeeId ?? '';
    const licenseNumber = rec.driver?.licenseNumber ?? '';
    const vehiclePlate = rec.driver?.vehicles?.[0]?.plateNumber ?? '';

    csvRows.push(
      [
        escapeCsv(rec.id),
        escapeCsv(driverName),
        escapeCsv(employeeId),
        escapeCsv(licenseNumber),
        escapeCsv(vehiclePlate),
        escapeCsv(rec.status),
        escapeCsv(rec.reachedAt ? rec.reachedAt.toISOString() : ''),
        escapeCsv(rec.tripStartedAt ? rec.tripStartedAt.toISOString() : ''),
        escapeCsv(rec.tripCompletedAt ? rec.tripCompletedAt.toISOString() : ''),
        escapeCsv(rec.tripDurationMinutes ?? ''),
        escapeCsv(rec.waitingTimeMinutes ?? ''),
        escapeCsv(rec.unloadingCompletedAt ? rec.unloadingCompletedAt.toISOString() : ''),
        escapeCsv(rec.unloadingDurationMinutes ?? ''),
        escapeCsv(rec.unloadingAddress || ''),
        escapeCsv(rec.reachedAddress || rec.locationName || ''),
        escapeCsv(rec.tripStartAddress || ''),
        escapeCsv(rec.tripCompletedAddress || ''),
      ].join(','),
    );
  }

  return csvRows.join('\n');
}
