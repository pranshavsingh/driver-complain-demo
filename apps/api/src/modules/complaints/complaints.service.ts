import type { Prisma } from '@prisma/client';
import {
  ATTACHMENT_KINDS,
  REALTIME_EVENTS,
  type AttachmentKind,
  type Role,
  type CreateComplaint,
  type UpdateComplaintStatus,
  type AssignComplaint,
  type ComplaintPublic,
  type ComplaintDetail,
  type ComplaintFilter,
  type ComplaintListQuery,
  type ListComplaintsResponse,
} from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toComplaintPublic, toComplaintDetail } from '../../lib/serializers';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { dispatchComplaintEvent } from '../../lib/notify';
import { ApiError } from '../../errors/api-error';

/** The authenticated caller, as far as the complaint layer is concerned. */
export interface Actor {
  id: string;
  role: Role;
}

/** One in-memory file (from multer) to attach to a new complaint. */
export interface EvidenceFile {
  buffer: Buffer;
  originalName?: string;
}

/** Optional evidence for a new complaint: at most one file per kind. */
export type ComplaintEvidence = Partial<Record<AttachmentKind, EvidenceFile>>;

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

/**
 * Photos go to Cloudinary's image pipeline; voice notes and videos both go to its video
 * pipeline — that is where anything with a timeline lives, and the only one that reports a
 * duration.
 */
function resourceTypeFor(kind: AttachmentKind): 'image' | 'video' {
  return kind === 'PHOTO' ? 'image' : 'video';
}

/** Eager relations needed to render the complaint detail view. */
const detailInclude = {
  attachments: true,
  // author is eager-loaded so the timeline can name who made each change.
  updates: { orderBy: { createdAt: 'asc' }, include: { author: true } },
  driver: { include: { user: true } },
  vehicle: true,
  assignedTo: true,
} satisfies Prisma.ComplaintInclude;

/**
 * A driver files a complaint. Generates a human-readable complaintNo, records the
 * opening timeline entry, stores any attached evidence (photo / voice note / video), and
 * notifies every active admin — the DB writes all atomic. (FCM push is best-effort post-commit.)
 */
export async function create(
  driverUserId: string,
  input: CreateComplaint,
  evidence: ComplaintEvidence = {},
): Promise<ComplaintPublic> {
  const driver = await prisma.driver.findUnique({ where: { userId: driverUserId } });
  if (!driver) throw ApiError.badRequest('Your account has no driver profile');

  let vehicleIdToUse = input.vehicleId ?? null;

  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle || vehicle.driverId !== driver.id) {
      throw ApiError.badRequest('Vehicle does not belong to you');
    }
  } else if (input.vehicleNumber?.trim()) {
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
    vehicleIdToUse = vehicle.id;
  }

  const year = new Date().getFullYear();
  const admins = await prisma.user.findMany({
    where: { role: { in: ADMIN_ROLES }, isActive: true },
    select: { id: true },
  });

  const pending = ATTACHMENT_KINDS.flatMap((kind) => {
    const file = evidence[kind];
    return file ? [{ kind, file }] : [];
  });
  const uploads = await Promise.all(
    pending.map(async ({ kind, file }) => ({
      kind,
      originalName: file.originalName ?? null,
      asset: await uploadBuffer(file.buffer, {
        folder: `${cloudinaryFolder}/complaints`,
        resourceType: resourceTypeFor(kind),
      }),
    })),
  );

  const created = await prisma.$transaction(async (tx) => {
    const counter = await tx.counter.upsert({
      where: { name: `complaint-${year}` },
      create: { name: `complaint-${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    const complaintNo = `DC-${year}-${String(counter.value).padStart(6, '0')}`;

    const complaint = await tx.complaint.create({
      data: {
        complaintNo,
        driverId: driver.id,
        vehicleId: vehicleIdToUse,
        title: input.title,
        description: input.description,
        priority: input.priority ?? 'MEDIUM',
      },
    });

    if (uploads.length > 0) {
      await tx.complaintAttachment.createMany({
        data: uploads.map(({ kind, asset, originalName }) => ({
          complaintId: complaint.id,
          uploadedById: driverUserId,
          kind,
          url: asset.url,
          publicId: asset.publicId,
          resourceType: asset.resourceType,
          format: asset.format,
          bytes: asset.bytes,
          durationSec: asset.durationSec,
          originalName,
        })),
      });
    }

    await tx.complaintUpdate.create({
      data: {
        complaintId: complaint.id,
        authorId: driverUserId,
        toStatus: 'NEW',
        note: 'Complaint submitted',
      },
    });

    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: 'COMPLAINT_CREATED' as const,
          title: `New complaint ${complaintNo}`,
          body: input.title,
          complaintId: complaint.id,
          data: { complaintId: complaint.id, type: 'COMPLAINT_CREATED' },
        })),
      });
    }

    return complaint;
  });

  // Live + push delivery, post-commit and best-effort — the admins' Notification rows
  // (written in the transaction above) are the durable record if this fails.
  dispatchComplaintEvent({
    userIds: admins.map((a) => a.id),
    event: REALTIME_EVENTS.complaintCreated,
    payload: {
      complaintId: created.id,
      complaintNo: created.complaintNo,
      title: created.title,
      status: created.status,
      at: new Date().toISOString(),
    },
    push: {
      title: `New complaint ${created.complaintNo}`,
      body: created.title,
      data: { complaintId: created.id, type: 'COMPLAINT_CREATED' },
    },
  });

  return toComplaintPublic(created);
}

/** Build the Prisma filter for list/export. Drivers are hard-scoped to their own rows. */
function buildWhere(
  role: Role,
  actorDriverId: string | undefined,
  query: ComplaintFilter,
): Prisma.ComplaintWhereInput {
  const where: Prisma.ComplaintWhereInput = {};

  if (role === 'DRIVER') {
    where.driverId = actorDriverId;
  } else if (query.driverId) {
    where.driverId = query.driverId;
  }

  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.vehicleId) where.vehicleId = query.vehicleId;
  if (query.assignedToId) where.assignedToId = query.assignedToId;

  if (query.createdFrom || query.createdTo) {
    where.createdAt = {
      ...(query.createdFrom ? { gte: query.createdFrom } : {}),
      ...(query.createdTo ? { lte: query.createdTo } : {}),
    };
  }

  if (query.search) {
    where.OR = [
      { complaintNo: { contains: query.search, mode: 'insensitive' } },
      { title: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function list(
  actor: Actor,
  query: ComplaintListQuery,
): Promise<ListComplaintsResponse> {
  let actorDriverId: string | undefined;
  if (actor.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    // No driver profile → no complaints (and never scope a uuid column to a bogus id).
    if (!driver) {
      return {
        data: [],
        meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
      };
    }
    actorDriverId = driver.id;
  }

  const where = buildWhere(actor.role, actorDriverId, query);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await prisma.$transaction([
    prisma.complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.pageSize,
    }),
    prisma.complaint.count({ where }),
  ]);

  return {
    data: rows.map(toComplaintPublic),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

/** Relations needed to render human-readable names in an exported spreadsheet. */
const exportInclude = {
  driver: { include: { user: true } },
  vehicle: true,
  assignedTo: true,
  // Only the kinds are needed — the Evidence column counts them, it does not link to files.
  attachments: { select: { kind: true } },
} satisfies Prisma.ComplaintInclude;

/** One complaint row with the relations the export writer expects. */
export type ComplaintExportRow = Prisma.ComplaintGetPayload<{ include: typeof exportInclude }>;

/** Rows fetched per round-trip during an export — bounds memory on large result sets. */
const EXPORT_BATCH_SIZE = 500;

/**
 * Stream the full filtered result set for an export, in batches. Same filters as list(),
 * but deliberately unpaginated: an export must contain every matching row.
 *
 * Pages by keyset (`cursor` on the id) rather than skip/take. Ids are uuid v7, so id order
 * is insertion order; unlike offset paging, a complaint filed *during* a long export cannot
 * shift the window and cause a row to be duplicated or silently dropped.
 */
export async function* iterateForExport(
  actor: Actor,
  filter: ComplaintFilter,
): AsyncGenerator<ComplaintExportRow[]> {
  let scopedDriverId: string | undefined;
  if (actor.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!driver) return; // No driver profile → nothing to export.
    scopedDriverId = driver.id;
  }

  const where = buildWhere(actor.role, scopedDriverId, filter);
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.complaint.findMany({
      where,
      include: exportInclude,
      orderBy: { id: 'desc' }, // newest first, matching the list view
      take: EXPORT_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (batch.length === 0) return;
    yield batch;
    if (batch.length < EXPORT_BATCH_SIZE) return;

    cursor = batch[batch.length - 1]?.id;
    if (!cursor) return;
  }
}

export async function getOne(actor: Actor, id: string): Promise<ComplaintDetail> {
  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: detailInclude,
  });
  if (!complaint) throw ApiError.notFound('Complaint not found');

  if (actor.role === 'DRIVER' && complaint.driver.userId !== actor.id) {
    throw ApiError.forbidden('You can only view your own complaints');
  }

  return toComplaintDetail(complaint);
}

export async function updateStatus(
  adminUserId: string,
  id: string,
  input: UpdateComplaintStatus,
): Promise<ComplaintPublic> {
  const existing = await prisma.complaint.findUnique({
    where: { id },
    include: { driver: true },
  });
  if (!existing) throw ApiError.notFound('Complaint not found');

  const from = existing.status;
  const to = input.status;

  // RESOLVED stamps the resolution time; reopening clears it; CLOSED keeps it.
  let resolvedAt: Date | null = existing.resolvedAt;
  if (to === 'RESOLVED') resolvedAt = existing.resolvedAt ?? new Date();
  else if (to === 'NEW' || to === 'IN_PROGRESS') resolvedAt = null;

  const updated = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.update({
      where: { id },
      data: { status: to, resolvedAt },
    });
    await tx.complaintUpdate.create({
      data: {
        complaintId: id,
        authorId: adminUserId,
        fromStatus: from,
        toStatus: to,
        note: input.note ?? null,
      },
    });
    await tx.notification.create({
      data: {
        userId: existing.driver.userId,
        type: 'STATUS_CHANGED',
        title: `Complaint ${existing.complaintNo} is now ${to}`,
        body: input.note ?? `Status changed from ${from} to ${to}.`,
        complaintId: id,
        data: { complaintId: id, type: 'STATUS_CHANGED', status: to },
      },
    });
    return complaint;
  });

  // Tell the driver their complaint moved. Post-commit, best-effort (see create()).
  dispatchComplaintEvent({
    userIds: [existing.driver.userId],
    event: REALTIME_EVENTS.complaintStatusChanged,
    payload: {
      complaintId: updated.id,
      complaintNo: updated.complaintNo,
      title: updated.title,
      status: updated.status,
      at: new Date().toISOString(),
    },
    push: {
      title: `Complaint ${existing.complaintNo} is now ${to}`,
      body: input.note ?? `Status changed from ${from} to ${to}.`,
      data: { complaintId: updated.id, type: 'STATUS_CHANGED', status: to },
    },
  });

  return toComplaintPublic(updated);
}

export async function assign(
  adminUserId: string,
  id: string,
  input: AssignComplaint,
): Promise<ComplaintPublic> {
  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Complaint not found');

  const target = await prisma.user.findUnique({ where: { id: input.assignedToId } });
  if (!target || !target.isActive || !ADMIN_ROLES.includes(target.role)) {
    throw ApiError.badRequest('Assignee must be an active admin');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.update({
      where: { id },
      data: { assignedToId: target.id },
    });
    await tx.complaintUpdate.create({
      data: {
        complaintId: id,
        authorId: adminUserId,
        note: `Assigned to ${target.firstName} ${target.lastName}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: target.id,
        type: 'ASSIGNED',
        title: `Assigned complaint ${existing.complaintNo}`,
        body: existing.title,
        complaintId: id,
        data: { complaintId: id, type: 'ASSIGNED' },
      },
    });
    return complaint;
  });

  // Notify the assignee only. Post-commit, best-effort (see create()).
  dispatchComplaintEvent({
    userIds: [target.id],
    event: REALTIME_EVENTS.complaintAssigned,
    payload: {
      complaintId: updated.id,
      complaintNo: updated.complaintNo,
      title: updated.title,
      status: updated.status,
      at: new Date().toISOString(),
    },
    push: {
      title: `Assigned complaint ${existing.complaintNo}`,
      body: existing.title,
      data: { complaintId: updated.id, type: 'ASSIGNED' },
    },
  });

  return toComplaintPublic(updated);
}
