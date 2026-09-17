import { z } from 'zod';

export const CreateWarehouseSchema = z.object({
  name: z.string().trim().min(1, 'Warehouse name is required').max(100),
  code: z.string().trim().max(50).optional(),
  location: z.string().trim().max(200).optional(),
  contactPerson: z.string().trim().max(100).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  isActive: z.boolean().default(true),
});

export type CreateWarehouseInput = z.infer<typeof CreateWarehouseSchema>;

export const UpdateWarehouseSchema = CreateWarehouseSchema.partial();
export type UpdateWarehouseInput = z.infer<typeof UpdateWarehouseSchema>;

export interface WarehousePublic {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    issuedParts: number;
  };
}

