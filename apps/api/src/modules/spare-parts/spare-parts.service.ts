import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { transcribeAudio } from '../../lib/transcribe';
import { env } from '../../config/env';
import { pushToUsers } from '../../lib/fcm';
import { logger } from '../../lib/logger';
import type {
  CreateSparePartRequestInput,
  IssueSparePartInput,
  RejectSparePartRequestInput,
  SparePartListQuery,
  SparePartRequestPublic,
  SparePartStatsSummary,
} from '@driver-complaint/shared-types';

export interface SparePartEvidence {
  photo?: { buffer: Buffer; originalName?: string };
  voice?: { buffer: Buffer; originalName?: string };
}

export interface Actor {
  id: string;
  role: string;
}

const sparePartInclude = {
  driver: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          phone: true,
        },
      },
      vehicles: { orderBy: { updatedAt: 'desc' as const }, take: 1 },
    },
  },
  vehicle: true,
  warehouse: true,
  approvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
    },
  },
  issuedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
    },
  },
};

export function toSparePartPublic(row: any): SparePartRequestPublic {
  return {
    id: row.id,
    requestNo: row.requestNo,
    driverId: row.driverId,
    vehicleId: row.vehicleId,
    description: row.description,
    transcription: row.transcription ?? null,
    partName: row.partName ?? null,
    quantity: row.quantity,
    photoUrl: row.photoUrl ?? null,
    photoPublicId: row.photoPublicId ?? null,
    voiceUrl: row.voiceUrl ?? null,
    voicePublicId: row.voicePublicId ?? null,
    status: row.status,
    type: row.type,
    approvedById: row.approvedById ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt instanceof Date ? row.approvedAt.toISOString() : (row.approvedAt ?? null),
    issuedById: row.issuedById ?? null,
    issuedBy: row.issuedBy ?? null,
    issuedAt: row.issuedAt instanceof Date ? row.issuedAt.toISOString() : (row.issuedAt ?? null),
    warehouseId: row.warehouseId ?? null,
    warehouse: row.warehouse
      ? {
          id: row.warehouse.id,
          name: row.warehouse.name,
          code: row.warehouse.code ?? null,
          location: row.warehouse.location ?? null,
          contactPerson: row.warehouse.contactPerson ?? null,
          contactPhone: row.warehouse.contactPhone ?? null,
          isActive: row.warehouse.isActive,
          createdAt: row.warehouse.createdAt instanceof Date ? row.warehouse.createdAt.toISOString() : row.warehouse.createdAt,
          updatedAt: row.warehouse.updatedAt instanceof Date ? row.warehouse.updatedAt.toISOString() : row.warehouse.updatedAt,
        }
      : null,
    issuedPartName: row.issuedPartName ?? null,
    issuedPartNo: row.issuedPartNo ?? null,
    issuedQty: row.issuedQty ?? null,
    returnedPartNo: row.returnedPartNo ?? null,
    returnedPartCondition: row.returnedPartCondition ?? null,
    adminNotes: row.adminNotes ?? null,
    rejectionReason: row.rejectionReason ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    driver: row.driver
      ? {
          id: row.driver.id,
          userId: row.driver.userId,
          licenseNumber: row.driver.licenseNumber,
          createdAt: row.driver.createdAt instanceof Date ? row.driver.createdAt.toISOString() : row.driver.createdAt,
          updatedAt: row.driver.updatedAt instanceof Date ? row.driver.updatedAt.toISOString() : row.driver.updatedAt,
          user: row.driver.user,
        }
      : undefined,
    vehicle: row.vehicle
      ? {
          id: row.vehicle.id,
          plateNumber: row.vehicle.plateNumber,
          make: row.vehicle.make ?? null,
          model: row.vehicle.model ?? null,
          modelNumber: row.vehicle.modelNumber ?? null,
          registrationDate: row.vehicle.registrationDate ? new Date(row.vehicle.registrationDate).toISOString() : null,
          chassisNumber: row.vehicle.chassisNumber ?? null,
          wheels: row.vehicle.wheels ?? null,
          agreementStatus: row.vehicle.agreementStatus ?? 'ACTIVE',
          year: row.vehicle.year ?? null,
          vin: row.vehicle.vin ?? null,
          driverId: row.vehicle.driverId ?? null,
          createdAt: row.vehicle.createdAt instanceof Date ? row.vehicle.createdAt.toISOString() : row.vehicle.createdAt,
          updatedAt: row.vehicle.updatedAt instanceof Date ? row.vehicle.updatedAt.toISOString() : row.vehicle.updatedAt,
        }
      : undefined,
  };
}

export async function createRequest(
  driverUserId: string,
  input: CreateSparePartRequestInput,
  evidence: SparePartEvidence = {},
): Promise<SparePartRequestPublic> {
  const driver = await prisma.driver.findUnique({
    where: { userId: driverUserId },
    include: { vehicles: true, user: true },
  });
  if (!driver) throw ApiError.badRequest('Your account has no driver profile');

  // Resolve target vehicle
  let targetVehicleId = input.vehicleId;
  if (!targetVehicleId && input.vehicleNumber?.trim()) {
    const rawNumber = input.vehicleNumber.trim();
    let vehicle = await prisma.vehicle.findFirst({
      where: {
        OR: [
          { plateNumber: { equals: rawNumber, mode: 'insensitive' } },
          { vin: { equals: rawNumber, mode: 'insensitive' } },
        ],
      },
    });

    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          driverId: driver.id,
          plateNumber: rawNumber,
        },
      });
    }
    targetVehicleId = vehicle.id;
  }

  // Fallback to driver's assigned vehicle
  if (!targetVehicleId && driver.vehicles.length > 0) {
    targetVehicleId = driver.vehicles[0]?.id;
  }

  if (!targetVehicleId) {
    throw ApiError.badRequest('Vehicle identification is required for spare parts request');
  }

  // Voice transcription
  let voiceTranscription: string | null = null;
  if (evidence.voice?.buffer) {
    try {
      voiceTranscription = await transcribeAudio(evidence.voice.buffer, evidence.voice.originalName);
    } catch {
      voiceTranscription = null;
    }
  }

  // Upload Photo
  let photoUrl: string | null = null;
  let photoPublicId: string | null = null;
  if (evidence.photo?.buffer) {
    try {
      const uploadedPhoto = await uploadBuffer(evidence.photo.buffer, {
        folder: `${cloudinaryFolder}/spare-parts/photos`,
        resourceType: 'image',
      });
      photoUrl = uploadedPhoto.url;
      photoPublicId = uploadedPhoto.publicId;
    } catch {
      photoUrl = null;
      photoPublicId = null;
    }
  }

  // Upload Voice
  let voiceUrl: string | null = null;
  let voicePublicId: string | null = null;
  if (evidence.voice?.buffer) {
    try {
      const uploadedVoice = await uploadBuffer(evidence.voice.buffer, {
        folder: `${cloudinaryFolder}/spare-parts/voice`,
        resourceType: 'video',
        format: 'm4a',
      });
      voiceUrl = uploadedVoice.url;
      voicePublicId = uploadedVoice.publicId;
    } catch {
      voiceUrl = null;
      voicePublicId = null;
    }
  }

  const rawDesc = input.description?.trim();
  const finalDescription =
    voiceTranscription && (!rawDesc || rawDesc === 'Voice note attached' || rawDesc === 'Photo attached')
      ? voiceTranscription
      : rawDesc || voiceTranscription || 'Spare part request from driver';

  const year = new Date().getFullYear();

  // Create request inside transaction with atomic sequence counter
  const created = await prisma.$transaction(async (tx) => {
    const counter = await tx.counter.upsert({
      where: { name: `sparepart-${year}` },
      create: { name: `sparepart-${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    const requestNo = `SPR-${year}-${String(counter.value).padStart(6, '0')}`;

    const newRequest = await tx.sparePartRequest.create({
      data: {
        requestNo,
        driverId: driver.id,
        vehicleId: targetVehicleId,
        description: finalDescription,
        transcription: voiceTranscription,
        partName: input.partName?.trim() || null,
        quantity: input.quantity ?? 1,
        type: input.type ?? 'NEW',
        photoUrl,
        photoPublicId,
        voiceUrl,
        voicePublicId,
        status: 'PENDING_APPROVAL',
      },
      include: sparePartInclude,
    });

    // Notify SuperAdmins & Admins
    const admins = await tx.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: true,
      },
      select: { id: true },
    });

    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'SPARE_PART_REQUESTED' as const,
          title: `New Spare Part Request: ${requestNo}`,
          body: `Driver ${driver.user.firstName} ${driver.user.lastName} requested ${input.partName || 'spare parts'} (Qty: ${input.quantity ?? 1})`,
          data: { requestId: newRequest.id, requestNo, type: 'SPARE_PART_REQUESTED' },
        })),
      });
    }

    return newRequest;
  });

  return toSparePartPublic(created);
}

export async function listRequests(actor: Actor, query: SparePartListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (actor.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!driver) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
    where.driverId = driver.id;
  } else if (query.driverId) {
    where.driverId = query.driverId;
  }

  if (query.vehicleId) {
    where.vehicleId = query.vehicleId;
  }

  if (query.warehouseId) {
    where.warehouseId = query.warehouseId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.type) {
    where.type = query.type;
  }

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) where.createdAt.lte = new Date(query.endDate);
  }

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    where.OR = [
      { requestNo: { contains: term, mode: 'insensitive' } },
      { partName: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { issuedPartName: { contains: term, mode: 'insensitive' } },
      { issuedPartNo: { contains: term, mode: 'insensitive' } },
      { returnedPartNo: { contains: term, mode: 'insensitive' } },
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
      {
        warehouse: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.sparePartRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: sparePartInclude,
    }),
    prisma.sparePartRequest.count({ where }),
  ]);

  return {
    data: items.map(toSparePartPublic),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getOne(actor: Actor, id: string): Promise<SparePartRequestPublic> {
  const row = await prisma.sparePartRequest.findUnique({
    where: { id },
    include: sparePartInclude,
  });
  if (!row) throw ApiError.notFound('Spare part request not found');

  if (actor.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!driver || driver.id !== row.driverId) {
      throw ApiError.forbidden('You can only view your own spare part requests');
    }
  }

  return toSparePartPublic(row);
}

export async function approveAndIssueRequest(
  adminUserId: string,
  id: string,
  input: IssueSparePartInput,
): Promise<SparePartRequestPublic> {
  const existing = await prisma.sparePartRequest.findUnique({
    where: { id },
    include: {
      driver: { include: { user: true } },
      vehicle: true,
    },
  });
  if (!existing) throw ApiError.notFound('Spare part request not found');

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: input.warehouseId },
  });
  if (!warehouse) throw ApiError.badRequest('Selected warehouse does not exist');

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.sparePartRequest.update({
      where: { id },
      data: {
        status: 'ISSUED',
        type: input.type,
        approvedById: adminUserId,
        approvedAt: now,
        issuedById: adminUserId,
        issuedAt: now,
        warehouseId: input.warehouseId,
        issuedPartName: input.issuedPartName.trim(),
        issuedPartNo: input.issuedPartNo.trim(),
        issuedQty: input.issuedQty ?? 1,
        returnedPartNo: input.returnedPartNo ? input.returnedPartNo.trim() : null,
        returnedPartCondition: input.returnedPartCondition ? input.returnedPartCondition.trim() : null,
        adminNotes: input.adminNotes ? input.adminNotes.trim() : null,
      },
      include: sparePartInclude,
    });

    // Notify the Driver
    await tx.notification.create({
      data: {
        userId: existing.driver.userId,
        type: 'SPARE_PART_ISSUED',
        title: `Spare Part Issued: ${existing.requestNo}`,
        body: `Item ${input.issuedPartName} (Qty: ${input.issuedQty ?? 1}) has been issued from ${warehouse.name}.`,
        data: { requestId: id, requestNo: existing.requestNo, type: 'SPARE_PART_ISSUED' },
      },
    });

    return row;
  });

  // Post-commit push notification to driver
  void pushToUsers([existing.driver.userId], {
    title: `Spare Part Issued: ${existing.requestNo}`,
    body: `Item ${input.issuedPartName} (Qty: ${input.issuedQty ?? 1}) has been issued from ${warehouse.name}.`,
    data: { requestId: id, requestNo: existing.requestNo, type: 'SPARE_PART_ISSUED' },
  }).catch((err) => {
    logger.error({ err }, 'FCM push for spare part issuance failed');
  });

  return toSparePartPublic(updated);
}

export async function rejectRequest(
  adminUserId: string,
  id: string,
  input: RejectSparePartRequestInput,
): Promise<SparePartRequestPublic> {
  const existing = await prisma.sparePartRequest.findUnique({
    where: { id },
    include: {
      driver: { include: { user: true } },
    },
  });
  if (!existing) throw ApiError.notFound('Spare part request not found');

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.sparePartRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: adminUserId,
        approvedAt: now,
        rejectionReason: input.rejectionReason.trim(),
      },
      include: sparePartInclude,
    });

    // Notify the Driver
    await tx.notification.create({
      data: {
        userId: existing.driver.userId,
        type: 'SPARE_PART_REJECTED',
        title: `Spare Part Request Rejected: ${existing.requestNo}`,
        body: `Your request was rejected. Reason: ${input.rejectionReason}`,
        data: { requestId: id, requestNo: existing.requestNo, type: 'SPARE_PART_REJECTED' },
      },
    });

    return row;
  });

  // Post-commit push
  void pushToUsers([existing.driver.userId], {
    title: `Spare Part Request Rejected: ${existing.requestNo}`,
    body: `Your request was rejected: ${input.rejectionReason}`,
    data: { requestId: id, requestNo: existing.requestNo, type: 'SPARE_PART_REJECTED' },
  }).catch((err) => {
    logger.error({ err }, 'FCM push for spare part rejection failed');
  });

  return toSparePartPublic(updated);
}

export async function getStats(opts: { startDate?: string; endDate?: string; vehicleId?: string }): Promise<SparePartStatsSummary> {
  const where: any = {};
  if (opts.vehicleId) where.vehicleId = opts.vehicleId;
  if (opts.startDate || opts.endDate) {
    where.createdAt = {};
    if (opts.startDate) where.createdAt.gte = new Date(opts.startDate);
    if (opts.endDate) where.createdAt.lte = new Date(opts.endDate);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalPending, totalApproved, totalIssued, totalRejected, totalRequests, recentThisMonth] = await Promise.all([
    prisma.sparePartRequest.count({ where: { ...where, status: 'PENDING_APPROVAL' } }),
    prisma.sparePartRequest.count({ where: { ...where, status: 'APPROVED' } }),
    prisma.sparePartRequest.count({ where: { ...where, status: 'ISSUED' } }),
    prisma.sparePartRequest.count({ where: { ...where, status: 'REJECTED' } }),
    prisma.sparePartRequest.count({ where }),
    prisma.sparePartRequest.count({ where: { ...where, createdAt: { gte: startOfMonth } } }),
  ]);

  return {
    totalPending,
    totalApproved,
    totalIssued,
    totalRejected,
    totalRequests,
    recentThisMonth,
  };
}

export async function* iterateForExport(query: SparePartListQuery) {
  const batchSize = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await listRequests({ id: '', role: 'SUPER_ADMIN' }, { ...query, page, limit: batchSize });
    if (result.data.length === 0) break;
    yield result.data;
    if (result.data.length < batchSize) hasMore = false;
    page += 1;
  }
}
