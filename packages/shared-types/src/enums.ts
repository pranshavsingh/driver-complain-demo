import { z } from 'zod';

/**
 * Enum values live here as the single source of truth for the app layer.
 * The Prisma schema mirrors these exact string values by hand (see
 * apps/api/prisma/schema.prisma). Do NOT import @prisma/client here — it would
 * pull the Prisma runtime into frontend bundles.
 */

export const RoleSchema = z.enum(['DRIVER', 'ADMIN', 'SUPER_ADMIN']);
export type Role = z.infer<typeof RoleSchema>;
export const ROLES = RoleSchema.options;

export const ComplaintStatusSchema = z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export type ComplaintStatus = z.infer<typeof ComplaintStatusSchema>;
export const COMPLAINT_STATUSES = ComplaintStatusSchema.options;

export const PrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type Priority = z.infer<typeof PrioritySchema>;
export const PRIORITIES = PrioritySchema.options;

export const NotificationTypeSchema = z.enum([
  'COMPLAINT_CREATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'COMMENT_ADDED',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export const NOTIFICATION_TYPES = NotificationTypeSchema.options;

/** Where a push device token came from. WEB = FCM Web Push (admin dashboard). */
export const PlatformSchema = z.enum(['ANDROID', 'IOS', 'WEB']);
export type Platform = z.infer<typeof PlatformSchema>;
export const PLATFORMS = PlatformSchema.options;

/**
 * What kind of evidence an attachment holds. Kept separate from Cloudinary's `resourceType`,
 * which stores audio as "video" and so cannot tell a voice note from a clip.
 */
export const AttachmentKindSchema = z.enum(['PHOTO', 'VOICE', 'VIDEO']);
export type AttachmentKind = z.infer<typeof AttachmentKindSchema>;
export const ATTACHMENT_KINDS = AttachmentKindSchema.options;

export const LoadingStatusSchema = z.enum(['REACHED', 'COMPLETED']);
export type LoadingStatus = z.infer<typeof LoadingStatusSchema>;
export const LOADING_STATUSES = LoadingStatusSchema.options;

