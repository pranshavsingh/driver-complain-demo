import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { uploadBuffer, cloudinaryFolder } from '../../lib/cloudinary';
import { pushToUsers } from '../../lib/fcm';
import { logger } from '../../lib/logger';
import { emitEventToUsers } from '../../realtime/socket';
import type {
  SendSupportMessageInput,
  SupportMessagePublic,
  SupportConversationSummary,
  SupportMessageListQuery,
  SupportUserSummary,
} from '@driver-complaint/shared-types';

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

    const summaries: SupportConversationSummary[] = [];

    for (const admin of supportAdmins) {
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.supportMessage.findFirst({
          where: {
            OR: [
              { senderId: currentUserId, receiverId: admin.id },
              { senderId: admin.id, receiverId: currentUserId },
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: { sender: true, receiver: true },
        }),
        prisma.supportMessage.count({
          where: {
            senderId: admin.id,
            receiverId: currentUserId,
            isRead: false,
          },
        }),
      ]);

      summaries.push({
        contactUser: toUserSummary(admin),
        lastMessage: lastMessage ? toSupportMessagePublic(lastMessage) : null,
        unreadCount,
      });
    }

    // Sort by latest message date
    return summaries.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  // If currentUser is SUPER_ADMIN / ADMIN / EXECUTIVE:
  // List all other users (Drivers, Admins, Executives) with conversation history & vehicle details
  const allUsers = await prisma.user.findMany({
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
  });

  const conversationPromises = allUsers.map(async (user) => {
    const [lastMessage, unreadCount] = await Promise.all([
      prisma.supportMessage.findFirst({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: user.id },
            { senderId: user.id, receiverId: currentUserId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: { sender: true, receiver: true },
      }),
      prisma.supportMessage.count({
        where: {
          senderId: user.id,
          receiverId: currentUserId,
          isRead: false,
        },
      }),
    ]);

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
      lastMessage: lastMessage ? toSupportMessagePublic(lastMessage) : null,
      unreadCount,
    };
  });

  const results = await Promise.all(conversationPromises);

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

  const where = {
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

  // 1. Live Realtime Socket Emission to both users' rooms
  try {
    emitEventToUsers([targetReceiverId, senderUserId], 'support:message', publicMsg);
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
  const { count } = await prisma.supportMessage.updateMany({
    where: {
      senderId: otherUserId,
      receiverId: currentUserId,
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
    } catch (err) {
      logger.error({ err }, 'Socket emission for support read receipt failed');
    }
  }

  return { updated: count };
}

export async function getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
  const count = await prisma.supportMessage.count({
    where: {
      receiverId: userId,
      isRead: false,
    },
  });
  return { unreadCount: count };
}

