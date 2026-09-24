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
  site: z.string().nullable().optional(),
  createdByAdminId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const CreateUserSchema = z.object({
  employeeId: z.string().trim().min(2, 'Employee ID is required').max(50),
  pin: z.string().trim().min(4, 'PIN must be at least 4 digits').max(10),
  role: RoleSchema,
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  email: z.string().trim().email('Invalid email address').nullable().optional().or(z.literal('')),
  phone: z.string().trim().min(7, 'Phone number is required').max(20, 'Phone number is too long'),
  category: ComplaintCategorySchema.nullable().optional(),
  site: z.string().trim().nullable().optional(),
  licenseNumber: z.string().trim().max(50).optional(),
  createdByAdminId: z.string().nullable().optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const AvailabilityFieldResultSchema = z.object({
  available: z.boolean(),
  message: z.string().optional(),
});
export type AvailabilityFieldResult = z.infer<typeof AvailabilityFieldResultSchema>;

export const UserAvailabilityResponseSchema = z.object({
  employeeId: AvailabilityFieldResultSchema.optional(),
  phone: AvailabilityFieldResultSchema.optional(),
  email: AvailabilityFieldResultSchema.optional(),
  licenseNumber: AvailabilityFieldResultSchema.optional(),
});
export type UserAvailabilityResponse = z.infer<typeof UserAvailabilityResponseSchema>;

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  category: ComplaintCategorySchema.nullable().optional(),
  site: z.string().nullable().optional(),
  createdByAdminId: z.string().nullable().optional(),
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
  site: z.string().nullable().optional(),
});
export type AdminSummary = z.infer<typeof AdminSummarySchema>;
