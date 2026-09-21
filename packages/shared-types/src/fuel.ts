import { z } from 'zod';
import { FuelTypeSchema } from './enums';
import type { DriverPublic } from './driver';
import type { VehiclePublic } from './vehicle';
import { PaginationMetaSchema } from './common';

export const CreateFuelRecordSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  vehicleNumber: z.string().trim().min(1, 'Vehicle number is required').max(50).optional(),
  type: FuelTypeSchema.default('FUEL'),
  quantityLtr: z.coerce.number().positive('Quantity must be greater than 0').max(10000, 'Quantity exceeds maximum limit'),
  totalPrice: z.coerce.number().nonnegative('Total price cannot be negative').max(1000000).optional().default(0),
  odometerKm: z.coerce.number().int().nonnegative().max(10000000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateFuelRecordInput = z.infer<typeof CreateFuelRecordSchema>;

export const FuelRecordPublicSchema = z.object({
  id: z.string(),
  driverId: z.string(),
  vehicleId: z.string(),
  type: FuelTypeSchema,
  quantityLtr: z.number(),
  totalPrice: z.number(),
  ratePerLtr: z.number().nullable(),
  odometerKm: z.number().nullable(),
  receiptUrl: z.string().nullable(),
  receiptPublicId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  driver: z.any().optional(),
  vehicle: z.any().optional(),
});

export type FuelRecordPublic = z.infer<typeof FuelRecordPublicSchema> & {
  driver?: DriverPublic & {
    user?: {
      firstName: string;
      lastName: string;
      employeeId: string;
    };
  };
  vehicle?: VehiclePublic;
};

export const FuelStatsSummarySchema = z.object({
  totalFuelCost: z.number(),
  totalDefCost: z.number(),
  totalFuelVolumeLtr: z.number(),
  totalDefVolumeLtr: z.number(),
  totalEntriesCount: z.number(),
});

export type FuelStatsSummary = z.infer<typeof FuelStatsSummarySchema>;

export const FuelListQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  type: FuelTypeSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type FuelListQuery = z.infer<typeof FuelListQuerySchema>;

export const ListFuelRecordsResponseSchema = z.object({
  data: z.array(FuelRecordPublicSchema),
  meta: PaginationMetaSchema,
});

export type ListFuelRecordsResponse = z.infer<typeof ListFuelRecordsResponseSchema>;
