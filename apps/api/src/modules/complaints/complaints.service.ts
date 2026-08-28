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
import { transcribeAudio, transcribeAudioFromUrl, translateText } from '../../lib/transcribe';
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
  pendingAssignee: true,
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

  let vehicleIdToUse: string | null = null;

  if (input.vehicleNumber?.trim()) {
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
  } else if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!vehicle || vehicle.driverId !== driver.id) {
      throw ApiError.badRequest('Vehicle does not belong to you');
    }
    vehicleIdToUse = vehicle.id;
  }

  const categoryToUse = input.category ?? 'SUPPORT';
  const matchingAdmin = await prisma.user.findFirst({
    where: {
      role: { in: ['ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'] },
      isActive: true,
      approvalStatus: 'APPROVED',
      category: categoryToUse,
    },
    select: { id: true },
  });
  const autoAssignedToId = matchingAdmin?.id ?? null;

  const year = new Date().getFullYear();
  const admins = await prisma.user.findMany({
    where: { role: { in: ADMIN_ROLES }, isActive: true },
    select: { id: true },
  });

  const voiceFile = evidence.VOICE;
  let voiceTranscription: string | null = null;
  if (voiceFile) {
    try {
      voiceTranscription = await transcribeAudio(voiceFile.buffer, voiceFile.originalName);
    } catch {
      voiceTranscription = null;
    }
  }

  const pending = ATTACHMENT_KINDS.flatMap((kind) => {
    const file = evidence[kind];
    return file ? [{ kind, file }] : [];
  });
  const uploads = await Promise.all(
    pending.map(async ({ kind, file }) => ({
      kind,
      originalName: file.originalName ?? null,
      transcription: kind === 'VOICE' ? voiceTranscription : null,
      asset: await uploadBuffer(file.buffer, {
        folder: `${cloudinaryFolder}/complaints`,
        resourceType: resourceTypeFor(kind),
      }),
    })),
  );

  const isPlaceholderDescription =
    !input.description.trim() ||
    input.description === 'Voice note attached' ||
    input.description === 'Photo attached';
  const finalDescription =
    voiceTranscription && isPlaceholderDescription
      ? voiceTranscription
      : input.description;

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
        description: finalDescription,
        transcription: voiceTranscription,
        category: categoryToUse,
        priority: input.priority ?? 'MEDIUM',
        assignedToId: autoAssignedToId,
      },
    });

    if (uploads.length > 0) {
      await tx.complaintAttachment.createMany({
        data: uploads.map(({ kind, asset, originalName, transcription }) => ({
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
          transcription,
        })),
      });
    }

    await tx.complaintUpdate.create({
      data: {
        complaintId: complaint.id,
        authorId: driverUserId,
        toStatus: 'NEW',
        note: autoAssignedToId
          ? `Complaint submitted and auto-assigned to department admin based on category (${categoryToUse})`
          : `Complaint submitted under category (${categoryToUse})`,
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

/** Build the Prisma filter for list/export. Drivers are hard-scoped to their own rows; Admins and Executives are hard-scoped to complaints assigned to them. */
function buildWhere(
  actor: Actor,
  actorDriverId: string | undefined,
  query: ComplaintFilter,
): Prisma.ComplaintWhereInput {
  const where: Prisma.ComplaintWhereInput = {};

  if (actor.role === 'DRIVER') {
    where.driverId = actorDriverId;
  } else if (actor.role === 'ADMIN' || actor.role === 'EXECUTIVE') {
    where.assignedToId = actor.id;
  } else if (query.driverId) {
    where.driverId = query.driverId;
  }

  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.category) where.category = query.category;
  if (query.vehicleId) where.vehicleId = query.vehicleId;
  if (actor.role === 'SUPER_ADMIN' && query.assignedToId) {
    where.assignedToId = query.assignedToId;
  }

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

  const where = buildWhere(actor, actorDriverId, query);
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
  actor: Actor | string,
  filter: ComplaintFilter,
): AsyncGenerator<ComplaintExportRow[]> {
  const actorObj: Actor =
    typeof actor === 'string' ? { id: actor, role: 'SUPER_ADMIN' } : actor;

  let scopedDriverId: string | undefined;
  if (actorObj.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actorObj.id },
      select: { id: true },
    });
    if (!driver) return; // No driver profile → nothing to export.
    scopedDriverId = driver.id;
  }

  const where = buildWhere(actorObj, scopedDriverId, filter);
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

  if ((actor.role === 'ADMIN' || actor.role === 'EXECUTIVE') && complaint.assignedToId !== actor.id) {
    throw ApiError.forbidden('You can only view complaints assigned to you');
  }

  return toComplaintDetail(complaint);
}

export async function updateStatus(
  actor: Actor | string,
  id: string,
  input: UpdateComplaintStatus,
): Promise<ComplaintPublic> {
  const actorObj: Actor =
    typeof actor === 'string' ? { id: actor, role: 'SUPER_ADMIN' } : actor;

  const existing = await prisma.complaint.findUnique({
    where: { id },
    include: { driver: true },
  });
  if (!existing) throw ApiError.notFound('Complaint not found');

  if ((actorObj.role === 'ADMIN' || actorObj.role === 'EXECUTIVE') && existing.assignedToId !== actorObj.id) {
    throw ApiError.forbidden('You can only update complaints assigned to you');
  }

  const from = existing.status;
  const to = input.status;

  // RESOLVED stamps the resolution time; reopening clears it; CLOSED keeps it.
  let resolvedAt: Date | null = existing.resolvedAt;
  if (to === 'RESOLVED') resolvedAt = existing.resolvedAt ?? new Date();
  else if (to === 'NEW' || to === 'IN_PROGRESS') resolvedAt = null;

  const isStatusChange = from !== to;
  const notifTitle = isStatusChange
    ? `Complaint ${existing.complaintNo} is now ${to}`
    : `Progress update on ${existing.complaintNo}`;
  const notifBody =
    input.note && input.note.trim()
      ? input.note.trim()
      : isStatusChange
        ? `Status changed from ${from} to ${to}.`
        : `Progress updated.`;
  const notifType = isStatusChange ? 'STATUS_CHANGED' : 'COMMENT_ADDED';

  const updated = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.update({
      where: { id },
      data: { status: to, resolvedAt },
    });
    await tx.complaintUpdate.create({
      data: {
        complaintId: id,
        authorId: actorObj.id,
        fromStatus: from,
        toStatus: to,
        note: input.note ?? null,
      },
    });
    await tx.notification.create({
      data: {
        userId: existing.driver.userId,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        complaintId: id,
        data: { complaintId: id, type: notifType, status: to },
      },
    });
    return complaint;
  });

  // Tell the driver their complaint moved or was updated. Post-commit, best-effort.
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
      title: notifTitle,
      body: notifBody,
      data: { complaintId: updated.id, type: notifType, status: to },
    },
  });

  return toComplaintPublic(updated);
}

export async function assign(
  actor: Actor | string,
  id: string,
  input: AssignComplaint,
): Promise<ComplaintPublic> {
  const actorObj: Actor =
    typeof actor === 'string' ? { id: actor, role: 'SUPER_ADMIN' } : actor;

  const actorUser = await prisma.user.findUnique({ where: { id: actorObj.id } });
  if (!actorUser) throw ApiError.unauthorized();

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Complaint not found');

  if (existing.assignmentStatus === 'PENDING') {
    throw ApiError.badRequest(
      'Please accept or reject the pending assignment request before re-assigning this complaint.',
    );
  }

  const target = await prisma.user.findUnique({ where: { id: input.assignedToId } });
  if (!target || !target.isActive || !ADMIN_ROLES.includes(target.role)) {
    throw ApiError.badRequest('Assignee must be an active admin');
  }

  // Admin assigning to SuperAdmin requires SuperAdmin acceptance
  const isRequestingSuperAdmin = actorUser.role === 'ADMIN' && target.role === 'SUPER_ADMIN';

  const updated = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.update({
      where: { id },
      data: isRequestingSuperAdmin
        ? {
            pendingAssigneeId: target.id,
            assignmentStatus: 'PENDING',
            // Keep assignedToId as the requesting admin until SuperAdmin accepts
            assignedToId: existing.assignedToId ?? actorUser.id,
          }
        : {
            assignedToId: target.id,
            pendingAssigneeId: null,
            assignmentStatus: 'NONE',
          },
    });

    const noteText = isRequestingSuperAdmin
      ? `Requested assignment to SuperAdmin ${target.firstName} ${target.lastName} (Pending Acceptance)`
      : `Assigned to ${target.firstName} ${target.lastName}`;

    await tx.complaintUpdate.create({
      data: {
        complaintId: id,
        authorId: actorUser.id,
        note: noteText,
      },
    });

    const notifType = isRequestingSuperAdmin ? 'ASSIGNMENT_REQUESTED' : 'ASSIGNED';
    const notifTitle = isRequestingSuperAdmin
      ? `Assignment Request for ${existing.complaintNo}`
      : `Assigned complaint ${existing.complaintNo}`;
    const notifBody = isRequestingSuperAdmin
      ? `${actorUser.firstName} ${actorUser.lastName} requested to assign complaint ${existing.complaintNo} to you.`
      : existing.title;

    await tx.notification.create({
      data: {
        userId: target.id,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        complaintId: id,
        data: { complaintId: id, type: notifType },
      },
    });

    return complaint;
  });

  // Notify target user
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
      title: isRequestingSuperAdmin
        ? `Assignment Request for ${existing.complaintNo}`
        : `Assigned complaint ${existing.complaintNo}`,
      body: isRequestingSuperAdmin
        ? `${actorUser.firstName} ${actorUser.lastName} requested to assign complaint ${existing.complaintNo} to you.`
        : existing.title,
      data: { complaintId: updated.id, type: isRequestingSuperAdmin ? 'ASSIGNMENT_REQUESTED' : 'ASSIGNED' },
    },
  });

  return toComplaintPublic(updated);
}

export async function acceptAssignment(
  actor: Actor | string,
  id: string,
): Promise<ComplaintPublic> {
  const actorObj: Actor =
    typeof actor === 'string' ? { id: actor, role: 'SUPER_ADMIN' } : actor;

  const actorUser = await prisma.user.findUnique({ where: { id: actorObj.id } });
  if (!actorUser) throw ApiError.unauthorized();

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Complaint not found');

  if (existing.assignmentStatus !== 'PENDING' || !existing.pendingAssigneeId) {
    throw ApiError.badRequest('No pending assignment to accept');
  }

  if (actorObj.role !== 'SUPER_ADMIN' && existing.pendingAssigneeId !== actorObj.id) {
    throw ApiError.forbidden('Only the target SuperAdmin can accept this assignment');
  }

  const previousAdminId = existing.assignedToId;
  const newAssigneeId = existing.pendingAssigneeId;

  const updated = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.update({
      where: { id },
      data: {
        assignedToId: newAssigneeId,
        pendingAssigneeId: null,
        assignmentStatus: 'NONE',
      },
    });

    await tx.complaintUpdate.create({
      data: {
        complaintId: id,
        authorId: actorUser.id,
        note: `SuperAdmin ${actorUser.firstName} ${actorUser.lastName} accepted the assignment request`,
      },
    });

    if (previousAdminId && previousAdminId !== actorUser.id) {
      await tx.notification.create({
        data: {
          userId: previousAdminId,
          type: 'ASSIGNMENT_ACCEPTED',
          title: `Assignment Accepted: ${existing.complaintNo}`,
          body: `SuperAdmin ${actorUser.firstName} ${actorUser.lastName} accepted assignment of complaint ${existing.complaintNo}.`,
          complaintId: id,
          data: { complaintId: id, type: 'ASSIGNMENT_ACCEPTED' },
        },
      });
    }

    return complaint;
  });

  if (previousAdminId && previousAdminId !== actorUser.id) {
    dispatchComplaintEvent({
      userIds: [previousAdminId],
      event: REALTIME_EVENTS.complaintAssigned,
      payload: {
        complaintId: updated.id,
        complaintNo: updated.complaintNo,
        title: updated.title,
        status: updated.status,
        at: new Date().toISOString(),
      },
      push: {
        title: `Assignment Accepted: ${existing.complaintNo}`,
        body: `SuperAdmin ${actorUser.firstName} ${actorUser.lastName} accepted assignment of complaint ${existing.complaintNo}.`,
        data: { complaintId: updated.id, type: 'ASSIGNMENT_ACCEPTED' },
      },
    });
  }

  return toComplaintPublic(updated);
}

export async function rejectAssignment(
  actor: Actor | string,
  id: string,
  input: { note?: string } = {},
): Promise<ComplaintPublic> {
  const actorObj: Actor =
    typeof actor === 'string' ? { id: actor, role: 'SUPER_ADMIN' } : actor;

  const actorUser = await prisma.user.findUnique({ where: { id: actorObj.id } });
  if (!actorUser) throw ApiError.unauthorized();

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Complaint not found');

  if (existing.assignmentStatus !== 'PENDING' || !existing.pendingAssigneeId) {
    throw ApiError.badRequest('No pending assignment to reject');
  }

  if (actorObj.role !== 'SUPER_ADMIN' && existing.pendingAssigneeId !== actorObj.id) {
    throw ApiError.forbidden('Only the target SuperAdmin can reject this assignment');
  }

  const previousAdminId = existing.assignedToId;

  const updated = await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.update({
      where: { id },
      data: {
        pendingAssigneeId: null,
        assignmentStatus: 'NONE',
      },
    });

    const rejectNote = input.note && input.note.trim()
      ? `SuperAdmin ${actorUser.firstName} ${actorUser.lastName} rejected assignment request. Reason: ${input.note.trim()}`
      : `SuperAdmin ${actorUser.firstName} ${actorUser.lastName} rejected assignment request`;

    await tx.complaintUpdate.create({
      data: {
        complaintId: id,
        authorId: actorUser.id,
        note: rejectNote,
      },
    });

    if (previousAdminId) {
      await tx.notification.create({
        data: {
          userId: previousAdminId,
          type: 'ASSIGNMENT_REJECTED',
          title: `Assignment Rejected: ${existing.complaintNo}`,
          body: rejectNote,
          complaintId: id,
          data: { complaintId: id, type: 'ASSIGNMENT_REJECTED' },
        },
      });
    }

    return complaint;
  });

  if (previousAdminId) {
    dispatchComplaintEvent({
      userIds: [previousAdminId],
      event: REALTIME_EVENTS.complaintAssigned,
      payload: {
        complaintId: updated.id,
        complaintNo: updated.complaintNo,
        title: updated.title,
        status: updated.status,
        at: new Date().toISOString(),
      },
      push: {
        title: `Assignment Rejected: ${existing.complaintNo}`,
        body: `SuperAdmin ${actorUser.firstName} ${actorUser.lastName} rejected assignment request.${input.note?.trim() ? ` Reason: ${input.note.trim()}` : ''}`,
        data: { complaintId: updated.id, type: 'ASSIGNMENT_REJECTED' },
      },
    });
  }

  return toComplaintPublic(updated);
}

export async function transcribeComplaint(id: string): Promise<ComplaintPublic> {
  const existing = await prisma.complaint.findUnique({
    where: { id },
    include: { attachments: true },
  });
  if (!existing) throw ApiError.notFound('Complaint not found');

  const voiceAttachment = existing.attachments.find((a) => a.kind === 'VOICE');
  if (!voiceAttachment) {
    throw ApiError.badRequest('No voice note attachment found on this complaint');
  }

  const transcribedText = await transcribeAudioFromUrl(voiceAttachment.url);
  if (!transcribedText) {
    throw ApiError.badRequest(
      'Could not transcribe audio recording. Please ensure Python and faster-whisper are installed on the server (pip install faster-whisper).',
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedComplaint = await tx.complaint.update({
      where: { id },
      data: {
        transcription: transcribedText,
        description:
          existing.description === 'Voice note attached' ||
          existing.description === 'Photo attached' ||
          !existing.description.trim()
            ? transcribedText
            : existing.description,
      },
    });

    await tx.complaintAttachment.update({
      where: { id: voiceAttachment.id },
      data: { transcription: transcribedText },
    });

    return updatedComplaint;
  });

  return toComplaintPublic(updated);
}

export async function translateComplaintText(
  text: string,
  targetLang: 'ENGLISH' | 'HINDI' | 'BENGALI',
): Promise<{ text: string; translatedText: string; targetLang: string }> {
  if (!text || typeof text !== 'string') {
    throw ApiError.badRequest('Text is required for translation');
  }
  const translatedText = await translateText(text, targetLang);
  return { text, translatedText, targetLang };
}

