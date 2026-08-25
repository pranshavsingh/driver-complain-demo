import { z } from 'zod';
import { ApprovalStatusSchema, ComplaintCategorySchema, RoleSchema } from './enums';

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
  approvalStatus: ApprovalStatusSchema.optional(),
  category: ComplaintCategorySchema.nullable().optional(),
  createdByAdminId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const CreateUserSchema = z.object({
  employeeId: z.string().min(2).max(50),
  pin: z.string().min(4).max(10),
  role: RoleSchema,
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  category: ComplaintCategorySchema.nullable().optional(),
  licenseNumber: z.string().optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  category: ComplaintCategorySchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

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
  category: ComplaintCategorySchema.nullable().optional(),
});
export type AdminSummary = z.infer<typeof AdminSummarySchema>;
