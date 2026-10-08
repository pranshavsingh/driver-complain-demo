import { z } from 'zod';
import { SupportMessageTypeSchema, RoleSchema, ComplaintCategorySchema, PrioritySchema } from './enums';
import type { UserPublic } from './user';
import type { VehiclePublic } from './vehicle';

export const SendSupportMessageSchema = z.object({
  receiverId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val ? val : undefined)),
  content: z.string().max(4000).default(''),
  type: SupportMessageTypeSchema.default('TEXT'),
});

export type SendSupportMessageInput = z.infer<typeof SendSupportMessageSchema>;

export const SupportMessageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

export type SupportMessageListQuery = z.infer<typeof SupportMessageListQuerySchema>;

export interface SupportUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  role: z.infer<typeof RoleSchema>;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
}

export interface SupportMessagePublic {
  id: string;
  senderId: string;
  sender?: SupportUserSummary | null;
  receiverId: string;
  receiver?: SupportUserSummary | null;
  content: string;
  type: z.infer<typeof SupportMessageTypeSchema>;
  attachmentUrl: string | null;
  attachmentPublicId: string | null;
  attachmentDurationSec: number | null;
  isRead: boolean;
  readAt: string | null;
  linkedComplaintId?: string | null;
  linkedComplaintNo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportConversationSummary {
  contactUser: SupportUserSummary;
  vehicle?: VehiclePublic | null;
  lastMessage?: SupportMessagePublic | null;
  unreadCount: number;
}

export const CreateComplaintFromChatSchema = z.object({
  driverUserId: z.string().uuid(),
  vehicleNumber: z.string().optional(),
  vehicleId: z.string().uuid().optional(),
  category: ComplaintCategorySchema,
  priority: PrioritySchema.default('MEDIUM'),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  messageIds: z.array(z.string().uuid()).min(1, 'At least one message must be selected'),
});

export type CreateComplaintFromChatInput = z.infer<typeof CreateComplaintFromChatSchema>;

export const BulkAttachChatMessagesSchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1, 'At least one message must be selected'),
  complaintId: z.string().uuid(),
});

export type BulkAttachChatMessagesInput = z.infer<typeof BulkAttachChatMessagesSchema>;

