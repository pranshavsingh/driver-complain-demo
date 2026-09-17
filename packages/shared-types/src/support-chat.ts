import { z } from 'zod';
import { SupportMessageTypeSchema, RoleSchema } from './enums';
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
  createdAt: string;
  updatedAt: string;
}

export interface SupportConversationSummary {
  contactUser: SupportUserSummary;
  vehicle?: VehiclePublic | null;
  lastMessage?: SupportMessagePublic | null;
  unreadCount: number;
}

