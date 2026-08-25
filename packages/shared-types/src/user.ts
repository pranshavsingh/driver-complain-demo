import { z } from 'zod';
import { RoleSchema } from './enums';

/** The safe, client-facing shape of a user (never includes pinHash). */
export const UserPublicSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  role: RoleSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

/**
 * Active admins / super-admins, name-ordered. Feeds the admin dashboard's "Assigned to"
 * filter and the assign control, so an admin picks a person instead of pasting a uuid.
 */
export const AdminSummarySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: RoleSchema,
});
export type AdminSummary = z.infer<typeof AdminSummarySchema>;
