import { z } from 'zod';
import { ComplaintCategorySchema } from './enums';

export const CategorySlaItemSchema = z.object({
  category: ComplaintCategorySchema,
  slaHours: z.number().min(0.1, 'SLA duration must be at least 0.1 hours').max(720, 'SLA duration cannot exceed 720 hours'),
  updatedAt: z.string().optional().nullable(),
});
export type CategorySlaItem = z.infer<typeof CategorySlaItemSchema>;

export const UpdateCategorySlaSchema = z.object({
  slas: z.array(CategorySlaItemSchema),
});
export type UpdateCategorySla = z.infer<typeof UpdateCategorySlaSchema>;
