import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { pushToUsers } from '../../lib/fcm';
import { logger } from '../../lib/logger';
import { emitEventToUsers, emitToRoles } from '../../realtime/socket';
import {
  REALTIME_EVENTS,
  type SendSupportMessageInput,
  type SupportMessagePublic,
  type SupportConversationSummary,
  type SupportMessageListQuery,
  type SupportUserSummary,
  type CreateComplaintFromChatInput,
  type BulkAttachChatMessagesInput,
  type ComplaintPublic,
} from '@driver-complaint/shared-types';
import * as complaintsService from '../complaints/complaints.service';

function toUserSummary(user: any): SupportUserSummary {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    role: user.role,
    phone: user.phone ?? null,
    email: user.email ?? null,
    isActive: user.isActive ?? true,
  };
}

export function toSupportMessagePublic(row: any): SupportMessagePublic {
  return {
    id: row.id,
    senderId: row.senderId,
    sender: row.sender ? toUserSummary(row.sender) : null,
    receiverId: row.receiverId,
    receiver: row.receiver ? toUserSummary(row.receiver) : null,
    content: row.content,
    type: row.type,
    attachmentUrl: row.attachmentUrl ?? null,
    attachmentPublicId: row.attachmentPublicId ?? null,
    attachmentDurationSec: row.attachmentDurationSec ?? null,
    isRead: row.isRead,
    readAt: row.readAt instanceof Date ? row.readAt.toISOString() : (row.readAt ?? null),
    linkedComplaintId: row.linkedComplaintId ?? null,
    linkedComplaintNo: row.linkedComplaintNo ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export async function getDefaultSupportAdmin(): Promise<SupportUserSummary> {
  const admin = await prisma.user.findFirst({
    where: {
      role: 'SUPER_ADMIN',
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (admin) return toUserSummary(admin);

  // Fallback to any active ADMIN
  const fallbackAdmin = await prisma.user.findFirst({
    where: {
      role: 'ADMIN',
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallbackAdmin) {
    throw ApiError.badRequest('No active Support/SuperAdmin account found to receive messages');
  }

  return toUserSummary(fallbackAdmin);
}

export async function getConversations(
  currentUserId: string,
  currentUserRole: string,
): Promise<SupportConversationSummary[]> {
  // If currentUser is DRIVER, list support admins (SuperAdmins & Admins)
  if (currentUserRole === 'DRIVER') {
    const supportAdmins = await prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: true,
      },
      orderBy: { role: 'asc' },
    });

    const [lastMessage, unreadCount] = await Promise.all([
      prisma.supportMessage.findFirst({
        where: {
          OR: [
            { senderId: currentUserId },
            { receiverId: currentUserId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: { sender: true, receiver: true },
      }),
      prisma.supportMessage.count({
        where: {
          receiverId: currentUserId,
          isRead: false,
        },
      }),
    ]);

    const formattedLastMsg = lastMessage ? toSupportMessagePublic(lastMessage) : null;

    const summaries: SupportConversationSummary[] = supportAdmins.map((admin) => ({
      contactUser: toUserSummary(admin),
      lastMessage: formattedLastMsg,
      unreadCount,
    }));

    return summaries.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  // If currentUser is SUPER_ADMIN / ADMIN / EXECUTIVE:
  // List all active users with conversation history & vehicle details
  const [allUsers, unreadGroups, rawLatest] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isActive: true,
      },
      include: {
        driver: {
          include: {
            vehicles: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.supportMessage.groupBy({
      by: ['senderId'],
      where: { isRead: false },
      _count: { id: true },
    }),
    prisma.$queryRaw<{ partner_id: string; id: string }[]>`
      SELECT DISTINCT ON (partner_id) partner_id, id
      FROM (
        SELECT id, "senderId" AS partner_id, "createdAt" FROM "SupportMessage"
        UNION ALL
        SELECT id, "receiverId" AS partner_id, "createdAt" FROM "SupportMessage"
      ) sub
      ORDER BY partner_id, "createdAt" DESC
    `,
  ]);

  const unreadMap = new Map<string, number>();
  for (const g of unreadGroups) {
    unreadMap.set(g.senderId, g._count.id);
  }

  const latestMsgIds = Array.from(new Set(rawLatest.map((r) => r.id)));
  const latestMessages =
    latestMsgIds.length > 0
      ? await prisma.supportMessage.findMany({
          where: { id: { in: latestMsgIds } },
          include: { sender: true, receiver: true },
        })
      : [];

  const messageById = new Map(latestMessages.map((m) => [m.id, m]));
  const partnerToMessageMap = new Map<string, typeof latestMessages[0]>();

  for (const r of rawLatest) {
    const msg = messageById.get(r.id);
    if (msg) {
      partnerToMessageMap.set(r.partner_id, msg);
    }
  }

  const results: SupportConversationSummary[] = allUsers.map((user) => {
    const lastMsg = partnerToMessageMap.get(user.id) ?? null;
    const unreadCount = unreadMap.get(user.id) ?? 0;

    const vehicle = user.driver?.vehicles?.[0]
      ? {
          id: user.driver.vehicles[0].id,
          plateNumber: user.driver.vehicles[0].plateNumber,
          make: user.driver.vehicles[0].make ?? null,
          model: user.driver.vehicles[0].model ?? null,
          modelNumber: user.driver.vehicles[0].modelNumber ?? null,
          registrationDate: user.driver.vehicles[0].registrationDate
            ? new Date(user.driver.vehicles[0].registrationDate).toISOString()
            : null,
          chassisNumber: user.driver.vehicles[0].chassisNumber ?? null,
          wheels: user.driver.vehicles[0].wheels ?? null,
          agreementStatus: user.driver.vehicles[0].agreementStatus ?? 'ACTIVE',
          year: user.driver.vehicles[0].year ?? null,
          vin: user.driver.vehicles[0].vin ?? null,
          driverId: user.driver.vehicles[0].driverId ?? null,
          createdAt: user.driver.vehicles[0].createdAt.toISOString(),
          updatedAt: user.driver.vehicles[0].updatedAt.toISOString(),
        }
      : null;

    return {
      contactUser: toUserSummary(user),
      vehicle,
      lastMessage: lastMsg ? toSupportMessagePublic(lastMsg) : null,
      unreadCount,
    };
  });

  // Sort contacts: users with messages sorted by latest message, then unread count, then alphabetically
  return results.sort((a, b) => {
    const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return a.contactUser.firstName.localeCompare(b.contactUser.firstName);
  });
}

export async function getMessages(
  currentUserId: string,
  otherUserId: string,
  query: SupportMessageListQuery,
): Promise<{ data: SupportMessagePublic[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const skip = (page - 1) * limit;

  const [currentUser, otherUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: currentUserId }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: otherUserId }, select: { role: true } }),
  ]);

  const isDriverThread = currentUser?.role === 'DRIVER' || otherUser?.role === 'DRIVER';
  const driverUserId = currentUser?.role === 'DRIVER' ? currentUserId : otherUserId;

  const where = isDriverThread
    ? {
        OR: [
          { senderId: driverUserId },
          { receiverId: driverUserId },
        ],
      }
    : {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      };

  const [items, total] = await Promise.all([
    prisma.supportMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        sender: true,
        receiver: true,
      },
    }),
    prisma.supportMessage.count({ where }),
  ]);

  // Return chronological order (oldest -> newest) for clean chat rendering
  const chronological = items.reverse();

  return {
    data: chronological.map(toSupportMessagePublic),
    total,
    page,
    limit,
  };
}

export async function sendMessage(
  senderUserId: string,
  input: SendSupportMessageInput,
  file?: Express.Multer.File,
): Promise<SupportMessagePublic> {
  const sender = await prisma.user.findUnique({
    where: { id: senderUserId },
  });
  if (!sender) throw ApiError.unauthorized();

  let targetReceiverId = input.receiverId;

  // Auto-route driver messages to SuperAdmin if receiverId is absent
  if (!targetReceiverId) {
    const defaultAdmin = await getDefaultSupportAdmin();
    targetReceiverId = defaultAdmin.id;
  }

  if (targetReceiverId === senderUserId) {
    throw ApiError.badRequest('You cannot send a message to yourself');
  }

  const receiver = await prisma.user.findUnique({
    where: { id: targetReceiverId },
  });
  if (!receiver) throw ApiError.badRequest('Recipient user does not exist');

  let attachmentUrl: string | null = null;
  let attachmentPublicId: string | null = null;
  let attachmentDurationSec: number | null = null;
  let msgType = input.type ?? 'TEXT';

  if (file?.buffer) {
    const isAudio =
      file.mimetype.startsWith('audio/') ||
      file.originalname.endsWith('.m4a') ||
      file.originalname.endsWith('.mp3') ||
      file.originalname.endsWith('.webm');

    if (isAudio) {
      msgType = 'AUDIO';
      try {
        const uploaded = await uploadBuffer(file.buffer, {
          folder: `${cloudinaryFolder}/support/audio`,
          resourceType: 'video',
          format: 'm4a',
        });
        attachmentUrl = uploaded.url;
        attachmentPublicId = uploaded.publicId;
        attachmentDurationSec = uploaded.durationSec;
      } catch (err: any) {
        logger.error({ err }, 'Failed to upload audio message attachment');
      }
    } else {
      msgType = 'IMAGE';
      try {
        const uploaded = await uploadBuffer(file.buffer, {
          folder: `${cloudinaryFolder}/support/photos`,
          resourceType: 'image',
        });
        attachmentUrl = uploaded.url;
        attachmentPublicId = uploaded.publicId;
      } catch (err: any) {
        logger.error({ err }, 'Failed to upload image message attachment');
      }
    }
  }

  const content = input.content?.trim() || (msgType === 'AUDIO' ? 'Voice Message' : msgType === 'IMAGE' ? 'Photo' : '');

  const created = await prisma.supportMessage.create({
    data: {
      senderId: senderUserId,
      receiverId: targetReceiverId,
      content,
      type: msgType,
      attachmentUrl,
      attachmentPublicId,
      attachmentDurationSec,
      isRead: false,
    },
    include: {
      sender: true,
      receiver: true,
    },
  });

  const publicMsg = toSupportMessagePublic(created);

  // 1. Live Realtime Socket Emission to both users' rooms + all support admins if a driver is involved
  try {
    emitEventToUsers([targetReceiverId, senderUserId], 'support:message', publicMsg);
    if (sender.role === 'DRIVER' || receiver.role === 'DRIVER') {
      emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'support:message', publicMsg);
    }
  } catch (err) {
    logger.error({ err }, 'Socket emission for support message failed');
  }

  // 2. FCM Push Notification to recipient
  const senderFullName = `${sender.firstName} ${sender.lastName}`.trim();
  const pushBody =
    msgType === 'AUDIO'
      ? '🎤 Sent a voice message'
      : msgType === 'IMAGE'
      ? '📷 Sent a photo'
      : content.length > 80
      ? `${content.slice(0, 77)}…`
      : content;

  void pushToUsers([targetReceiverId], {
    title: `💬 ${senderFullName}`,
    body: pushBody,
    data: {
      type: 'SUPPORT_MESSAGE_RECEIVED',
      senderId: senderUserId,
      messageId: created.id,
    },
  }).catch((err) => {
    logger.error({ err }, 'FCM push for support message failed');
  });

  return publicMsg;
}

export async function markConversationRead(
  currentUserId: string,
  otherUserId: string,
): Promise<{ updated: number }> {
  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { role: true },
  });
  const isOtherDriver = otherUser?.role === 'DRIVER';

  const { count } = await prisma.supportMessage.updateMany({
    where: {
      senderId: otherUserId,
      ...(isOtherDriver ? {} : { receiverId: currentUserId }),
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  if (count > 0) {
    try {
      emitEventToUsers([otherUserId, currentUserId], 'support:read', {
        readerId: currentUserId,
        otherUserId,
        readAt: new Date().toISOString(),
      });
      if (isOtherDriver) {
        emitToRoles(['SUPER_ADMIN', 'ADMIN'], 'support:read', {
          readerId: currentUserId,
          otherUserId,
          readAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error({ err }, 'Socket emission for support read receipt failed');
    }
  }

  return { updated: count };
}

export async function getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  if (user && ['SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'].includes(user.role)) {
    const count = await prisma.supportMessage.count({
      where: {
        isRead: false,
        OR: [
          { receiverId: userId },
          { sender: { role: 'DRIVER' } },
        ],
      },
    });
    return { unreadCount: count };
  }

  const count = await prisma.supportMessage.count({
    where: {
      receiverId: userId,
      isRead: false,
    },
  });
  return { unreadCount: count };
}

export async function appendChatMessageToComplaint(
  actorUserId: string,
  messageId: string,
  complaintId: string,
): Promise<{ ok: boolean; complaintNo: string }> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
  });
  if (!actor || !['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) {
    throw ApiError.forbidden('Only SuperAdmin or Admin can link chat messages to complaints');
  }

  const message = await prisma.supportMessage.findUnique({
    where: { id: messageId },
    include: { sender: true },
  });
  if (!message) {
    throw ApiError.notFound('Chat message not found');
  }

  if (message.linkedComplaintId) {
    throw ApiError.badRequest(`This chat message is already linked to Complaint #${message.linkedComplaintNo ?? ''}`);
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: {
      driver: {
        include: { user: true },
      },
    },
  });
  if (!complaint) {
    throw ApiError.notFound('Complaint not found');
  }

  if (complaint.status === 'RESOLVED' || complaint.status === 'CLOSED') {
    throw ApiError.badRequest(`Cannot link chat message to a ${complaint.status.toLowerCase()} complaint`);
  }

  if (complaint.driver.userId !== message.senderId) {
    throw ApiError.badRequest('This chat message was not sent by the complaint driver');
  }

  const dateStr = new Date(message.createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  await prisma.$transaction(async (tx) => {
    let updatedDescription = complaint.description;
    if (message.content?.trim()) {
      const chatBlock = `\n\n[Linked Support Chat • ${dateStr}]:\n${message.content.trim()}`;
      updatedDescription = `${complaint.description}${chatBlock}`;
    }

    if (message.attachmentUrl) {
      const isAudio = message.type === 'AUDIO';
      const kind = isAudio ? 'VOICE' : 'PHOTO';
      const resourceType = isAudio ? 'video' : 'image';
      const format = isAudio ? 'm4a' : 'jpg';
      const pubId = `chat-${message.id}-c${complaint.id.slice(0, 8)}`;

      await tx.complaintAttachment.create({
        data: {
          complaintId: complaint.id,
          uploadedById: message.senderId,
          kind,
          url: message.attachmentUrl,
          publicId: pubId,
          resourceType,
          format,
          durationSec: message.attachmentDurationSec ?? null,
          originalName: isAudio ? `Voice Note (${dateStr})` : `Photo (${dateStr})`,
        },
      });
    }

    await tx.complaint.update({
      where: { id: complaint.id },
      data: {
        description: updatedDescription,
        updatedAt: new Date(),
      },
    });

    await tx.supportMessage.update({
      where: { id: message.id },
      data: {
        linkedComplaintId: complaint.id,
        linkedComplaintNo: complaint.complaintNo,
      },
    });
  });

  try {
    const notifyUserIds = Array.from(
      new Set([
        complaint.driver.userId,
        ...(complaint.assignedToId ? [complaint.assignedToId] : []),
      ]),
    );

    emitEventToUsers(notifyUserIds, REALTIME_EVENTS.complaintStatusChanged, {
      complaintId: complaint.id,
      complaintNo: complaint.complaintNo,
      title: complaint.title,
      status: complaint.status,
      at: new Date().toISOString(),
    });

    emitToRoles(['SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'], REALTIME_EVENTS.complaintStatusChanged, {
      complaintId: complaint.id,
      complaintNo: complaint.complaintNo,
      title: complaint.title,
      status: complaint.status,
      at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to emit socket updates for attached chat message');
  }

  return { ok: true, complaintNo: complaint.complaintNo };
}

export async function detachChatMessageFromComplaint(
  actorUserId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
  });
  if (!actor || !['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) {
    throw ApiError.forbidden('Only SuperAdmin or Admin can unlink chat messages from complaints');
  }

  const message = await prisma.supportMessage.findUnique({
    where: { id: messageId },
  });
  if (!message) {
    throw ApiError.notFound('Chat message not found');
  }

  if (!message.linkedComplaintId) {
    throw ApiError.badRequest('Message is not linked to any complaint');
  }

  const complaintId = message.linkedComplaintId;
  const pubIdPrefix = `chat-${message.id}-`;

  await prisma.$transaction(async (tx) => {
    // 1. Remove attachment created for this chat message (if any)
    await tx.complaintAttachment.deleteMany({
      where: {
        complaintId,
        publicId: { startsWith: pubIdPrefix },
      },
    });

    // 2. Remove appended chat text from complaint description (if any)
    if (message.content?.trim()) {
      const complaint = await tx.complaint.findUnique({ where: { id: complaintId } });
      if (complaint && complaint.description) {
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const textToMatch = message.content.trim();
        const pattern = new RegExp(`\\n\\n\\[Linked Support Chat • [^\\]]+\\]:\\n${escapeRegex(textToMatch)}`, 'g');
        const updatedDesc = complaint.description.replace(pattern, '').trim();
        if (updatedDesc !== complaint.description) {
          await tx.complaint.update({
            where: { id: complaintId },
            data: { description: updatedDesc, updatedAt: new Date() },
          });
        }
      }
    }

    // 3. Clear message link
    await tx.supportMessage.update({
      where: { id: messageId },
      data: {
        linkedComplaintId: null,
        linkedComplaintNo: null,
      },
    });
  });

  return { ok: true };
}

export async function createComplaintFromChat(
  actorUserId: string,
  input: CreateComplaintFromChatInput,
): Promise<ComplaintPublic> {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
  if (!actor || !['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) {
    throw ApiError.forbidden('Only SuperAdmin or Admin can create complaints from support chat');
  }

  // 1. Resolve Driver
  const driver = await prisma.driver.findUnique({
    where: { userId: input.driverUserId },
    include: { user: true },
  });
  if (!driver) {
    throw ApiError.badRequest('Selected user has no registered driver profile');
  }

  // 2. Resolve Vehicle
  let vehicleNumber = input.vehicleNumber;
  let vehicleId = input.vehicleId;
  if (!vehicleNumber && vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (v) vehicleNumber = v.plateNumber;
  }

  // 3. Create the complaint using the existing complaint service
  const createdComplaint = await complaintsService.create(
    input.driverUserId,
    {
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority ?? 'MEDIUM',
      vehicleNumber,
      vehicleId,
    },
    {},
  );

  // 4. Link selected chat messages to the created complaint
  if (input.messageIds && input.messageIds.length > 0) {
    const messages = await prisma.supportMessage.findMany({
      where: { id: { in: input.messageIds } },
    });

    await prisma.$transaction(async (tx) => {
      for (const msg of messages) {
        // Link message
        await tx.supportMessage.update({
          where: { id: msg.id },
          data: {
            linkedComplaintId: createdComplaint.id,
            linkedComplaintNo: createdComplaint.complaintNo,
          },
        });

        // Copy attachment if any
        if (msg.attachmentUrl) {
          const isAudio = msg.type === 'AUDIO';
          const kind = isAudio ? 'VOICE' : 'PHOTO';
          const resourceType = isAudio ? 'video' : 'image';
          const format = isAudio ? 'm4a' : 'jpg';
          const pubId = `chat-${msg.id}-c${createdComplaint.id.slice(0, 8)}`;
          const dateStr = new Date(msg.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata',
          });

          await tx.complaintAttachment.create({
            data: {
              complaintId: createdComplaint.id,
              uploadedById: msg.senderId,
              kind,
              url: msg.attachmentUrl,
              publicId: pubId,
              resourceType,
              format,
              durationSec: msg.attachmentDurationSec ?? null,
              originalName: isAudio ? `Voice Note (${dateStr})` : `Photo (${dateStr})`,
            },
          });
        }
      }

      // Add timeline entry for chat linking
      await tx.complaintUpdate.create({
        data: {
          complaintId: createdComplaint.id,
          authorId: actorUserId,
          toStatus: 'NEW',
          note: `Registered via Support Chat by Super Admin (${messages.length} chat messages linked).`,
        },
      });
    });

    // Realtime notification for chat updates
    try {
      emitEventToUsers([input.driverUserId, actorUserId], 'support:message', {
        messageIds: input.messageIds,
        linkedComplaintId: createdComplaint.id,
        linkedComplaintNo: createdComplaint.complaintNo,
      } as any);
    } catch {}
  }

  return createdComplaint;
}

export async function bulkAttachChatMessages(
  actorUserId: string,
  input: BulkAttachChatMessagesInput,
): Promise<{ ok: boolean; count: number; complaintNo: string }> {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
  if (!actor || !['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) {
    throw ApiError.forbidden('Only SuperAdmin or Admin can link chat messages to complaints');
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id: input.complaintId },
    include: { driver: true },
  });
  if (!complaint) throw ApiError.notFound('Complaint not found');
  if (complaint.status === 'RESOLVED' || complaint.status === 'CLOSED') {
    throw ApiError.badRequest(`Cannot link chat messages to a ${complaint.status.toLowerCase()} complaint`);
  }

  const messages = await prisma.supportMessage.findMany({
    where: { id: { in: input.messageIds } },
  });

  if (messages.length === 0) {
    throw ApiError.badRequest('No valid messages selected');
  }

  await prisma.$transaction(async (tx) => {
    let extraDescription = '';

    for (const msg of messages) {
      if (msg.linkedComplaintId) continue; // skip already linked

      const dateStr = new Date(msg.createdAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      });

      if (msg.content?.trim()) {
        extraDescription += `\n\n[Linked Support Chat • ${dateStr}]:\n${msg.content.trim()}`;
      }

      if (msg.attachmentUrl) {
        const isAudio = msg.type === 'AUDIO';
        const kind = isAudio ? 'VOICE' : 'PHOTO';
        const resourceType = isAudio ? 'video' : 'image';
        const format = isAudio ? 'm4a' : 'jpg';
        const pubId = `chat-${msg.id}-c${complaint.id.slice(0, 8)}`;

        await tx.complaintAttachment.create({
          data: {
            complaintId: complaint.id,
            uploadedById: msg.senderId,
            kind,
            url: msg.attachmentUrl,
            publicId: pubId,
            resourceType,
            format,
            durationSec: msg.attachmentDurationSec ?? null,
            originalName: isAudio ? `Voice Note (${dateStr})` : `Photo (${dateStr})`,
          },
        });
      }

      await tx.supportMessage.update({
        where: { id: msg.id },
        data: {
          linkedComplaintId: complaint.id,
          linkedComplaintNo: complaint.complaintNo,
        },
      });
    }

    if (extraDescription) {
      await tx.complaint.update({
        where: { id: complaint.id },
        data: {
          description: `${complaint.description}${extraDescription}`,
          updatedAt: new Date(),
        },
      });
    }

    await tx.complaintUpdate.create({
      data: {
        complaintId: complaint.id,
        authorId: actorUserId,
        fromStatus: complaint.status,
        toStatus: complaint.status,
        note: `Linked ${messages.length} support chat messages to complaint history.`,
      },
    });
  });

  return { ok: true, count: messages.length, complaintNo: complaint.complaintNo };
}



