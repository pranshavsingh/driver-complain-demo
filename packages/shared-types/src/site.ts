import { z } from 'zod';

export const OperatingSitePublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OperatingSitePublic = z.infer<typeof OperatingSitePublicSchema>;

export const CreateOperatingSiteSchema = z.object({
  name: z.string().trim().min(1, 'Site name is required').max(100),
  code: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});
export type CreateOperatingSite = z.infer<typeof CreateOperatingSiteSchema>;

export const UpdateOperatingSiteSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateOperatingSite = z.infer<typeof UpdateOperatingSiteSchema>;
