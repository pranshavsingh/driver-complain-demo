import { z } from 'zod';

export const CreateVehicleSchema = z.object({
  plateNumber: z.string().min(1).max(20),
  make: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  vin: z.string().max(64).optional(),
});
export type CreateVehicle = z.infer<typeof CreateVehicleSchema>;

export const VehiclePublicSchema = z.object({
  id: z.string(),
  driverId: z.string(),
  plateNumber: z.string(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  vin: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VehiclePublic = z.infer<typeof VehiclePublicSchema>;
