import { z } from 'zod';

export const CreateVehicleSchema = z.object({
  plateNumber: z.string().min(1, 'Vehicle number is required').max(30),
  model: z.string().max(100).optional().nullable(),
  make: z.string().max(100).optional().nullable(),
  registrationDate: z.string().optional().nullable(),
  modelNumber: z.string().max(100).optional().nullable(),
  chassisNumber: z.string().max(100).optional().nullable(),
  wheels: z.string().max(50).optional().nullable(),
  agreementStatus: z.string().max(50).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  vin: z.string().max(64).optional().nullable(),
  driverId: z.string().uuid().optional().nullable().or(z.literal('')).or(z.null()),
});
export type CreateVehicle = z.infer<typeof CreateVehicleSchema>;

export const UpdateVehicleSchema = CreateVehicleSchema.partial();
export type UpdateVehicle = z.infer<typeof UpdateVehicleSchema>;

export const VehiclePublicSchema = z.object({
  id: z.string(),
  driverId: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  plateNumber: z.string(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelNumber: z.string().nullable().optional(),
  registrationDate: z.string().nullable().optional(),
  chassisNumber: z.string().nullable().optional(),
  wheels: z.string().nullable().optional(),
  agreementStatus: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  vin: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VehiclePublic = z.infer<typeof VehiclePublicSchema>;
