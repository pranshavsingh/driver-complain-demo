import { z } from 'zod';
import { NotificationTypeSchema } from './enums';
import { PaginationQuerySchema, PaginationMetaSchema } from './common';

export const NotificationPublicSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  data: z.unknown().nullable().optional(),
  complaintId: z.string().nullable().optional(),
  isRead: z.boolean(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type NotificationPublic = z.infer<typeof NotificationPublicSchema>;

/**
 * Inbox query. `unreadOnly` arrives as a query string, so it is parsed from the literal
 * "true"/"false" rather than z.coerce.boolean() (which treats the string "false" as true).
 */
export const NotificationListQuerySchema = PaginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

/** `unreadCount` is the total across the inbox, not just the current page — it drives the badge. */
export const ListNotificationsResponseSchema = z.object({
  data: z.array(NotificationPublicSchema),
  meta: PaginationMetaSchema.extend({ unreadCount: z.number().int() }),
});
export type ListNotificationsResponse = z.infer<typeof ListNotificationsResponseSchema>;

export const MarkAllReadResponseSchema = z.object({ updated: z.number().int() });
export type MarkAllReadResponse = z.infer<typeof MarkAllReadResponseSchema>;
