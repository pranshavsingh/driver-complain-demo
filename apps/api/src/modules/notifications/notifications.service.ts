import type {
  RegisterDeviceToken,
  DeviceTokenPublic,
  NotificationListQuery,
  ListNotificationsResponse,
  NotificationPublic,
  MarkAllReadResponse,
  ClearAllNotificationsResponse,
} from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toNotificationPublic, toDeviceTokenPublic } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';

/** A user's own inbox, newest first, excluding cleared notifications, plus the unread total for the badge. */
export async function listForUser(
  userId: string,
  query: NotificationListQuery,
): Promise<ListNotificationsResponse> {
  const where = {
    userId,
    clearedAt: null,
    ...(query.unreadOnly ? { isRead: false } : {}),
  };
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.pageSize,
    }),
    prisma.notification.count({ where }),
    // Always the full unread count, independent of the unreadOnly filter and paging, excluding cleared.
    prisma.notification.count({ where: { userId, clearedAt: null, isRead: false } }),
  ]);

  return {
    data: rows.map(toNotificationPublic),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
      unreadCount,
    },
  };
}

/**
 * Register (or refresh) a push token for the calling user. Clients call this on every app
 * start, so it must be idempotent.
 *
 * SAFETY-CRITICAL: `token` is globally unique and the upsert REASSIGNS it to the calling
 * user. That is required, not incidental — when a shared phone is handed to another driver,
 * FCM reissues the same token, and leaving it on the previous owner would push one driver's
 * complaint updates to a different person. The single upsert statement keeps the move atomic.
 */
export async function registerDevice(
  userId: string,
  input: RegisterDeviceToken,
): Promise<DeviceTokenPublic> {
  const row = await prisma.deviceToken.upsert({
    where: { token: input.token },
    create: { userId, token: input.token, platform: input.platform },
    update: { userId, platform: input.platform, lastUsedAt: new Date() },
  });
  return toDeviceTokenPublic(row);
}

/**
 * Drop a push token (logout / notifications turned off). Scoped to the caller so one user
 * can never unregister another's device. Idempotent: unknown tokens succeed silently.
 */
export async function unregisterDevice(userId: string, token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token, userId } });
}

export async function markRead(userId: string, id: string): Promise<NotificationPublic> {
  // Scope the lookup by userId and uncleared so another user's notification is a 404, not a 403 leak.
  const existing = await prisma.notification.findFirst({
    where: { id, userId, clearedAt: null },
  });
  if (!existing) throw ApiError.notFound('Notification not found');
  if (existing.isRead) return toNotificationPublic(existing);

  const updated = await prisma.notification.update({
    where: { id: existing.id },
    data: { isRead: true, readAt: new Date() },
  });
  return toNotificationPublic(updated);
}

export async function markAllRead(userId: string): Promise<MarkAllReadResponse> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, clearedAt: null, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: count };
}

/**
 * Mark all currently visible notifications as cleared for the authenticated user.
 * Scoped strictly to the caller's notifications — other users' notifications are unaffected.
 */
export async function clearAll(userId: string): Promise<ClearAllNotificationsResponse> {
  const now = new Date();
  const [updateResult, unreadCount] = await prisma.$transaction([
    prisma.notification.updateMany({
      where: { userId, clearedAt: null },
      data: { clearedAt: now, isRead: true, readAt: now },
    }),
    prisma.notification.count({
      where: { userId, clearedAt: null, isRead: false },
    }),
  ]);

  return {
    success: true,
    cleared: updateResult.count,
    unreadCount,
  };
}

/**
 * Clear a single notification for the authenticated user.
 * Scoped strictly to the caller's notification.
 */
export async function clearOne(
  userId: string,
  id: string,
): Promise<{ success: boolean; id: string; unreadCount: number }> {
  const existing = await prisma.notification.findFirst({
    where: { id, userId, clearedAt: null },
  });
  if (!existing) throw ApiError.notFound('Notification not found');

  const now = new Date();
  const [, unreadCount] = await prisma.$transaction([
    prisma.notification.update({
      where: { id: existing.id },
      data: { clearedAt: now, isRead: true, readAt: existing.readAt ?? now },
    }),
    prisma.notification.count({
      where: { userId, clearedAt: null, isRead: false },
    }),
  ]);

  return {
    success: true,
    id: existing.id,
    unreadCount,
  };
}
