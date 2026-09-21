import { z } from 'zod';
import { MaintenanceTypeSchema } from './enums';
import type { DriverPublic } from './driver';
import type { VehiclePublic } from './vehicle';
import { PaginationMetaSchema } from './common';

export const CreateMaintenanceRecordSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  vehicleNumber: z.string().trim().min(1, 'Vehicle number is required').max(50).optional(),
  type: MaintenanceTypeSchema.default('TYRE'),
  itemNumber: z.string().trim().min(1, 'New identification / serial number is required').max(100),
  oldItemNumber: z.string().trim().max(100).optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity exceeds maximum limit').default(1),
  odometerKm: z.coerce.number().int().nonnegative().max(10000000).optional(),
  brand: z.string().trim().max(100).optional(),
  position: z.string().trim().max(100).optional(),
  cost: z.coerce.number().nonnegative().max(10000000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateMaintenanceRecordInput = z.infer<typeof CreateMaintenanceRecordSchema>;

export const MaintenanceRecordPublicSchema = z.object({
  id: z.string(),
  driverId: z.string(),
  vehicleId: z.string(),
  type: MaintenanceTypeSchema,
  itemNumber: z.string(),
  oldItemNumber: z.string().nullable().optional(),
  quantity: z.number(),
  photoUrl: z.string(),
  photoPublicId: z.string().nullable().optional(),
  odometerKm: z.number().nullable().optional(),
  brand: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  driver: z.any().optional(),
  vehicle: z.any().optional(),
});

export type MaintenanceRecordPublic = z.infer<typeof MaintenanceRecordPublicSchema> & {
  driver?: DriverPublic & {
    user?: {
      firstName: string;
      lastName: string;
      employeeId: string;
    };
  };
  vehicle?: VehiclePublic;
};

export const MaintenanceStatsSummarySchema = z.object({
  totalTyreCount: z.number(),
  totalBatteryCount: z.number(),
  totalEntriesCount: z.number(),
  recentThisMonthCount: z.number(),
});

export type MaintenanceStatsSummary = z.infer<typeof MaintenanceStatsSummarySchema>;

export const MaintenanceListQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  type: MaintenanceTypeSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type MaintenanceListQuery = z.infer<typeof MaintenanceListQuerySchema>;

export const ListMaintenanceRecordsResponseSchema = z.object({
  data: z.array(MaintenanceRecordPublicSchema),
  meta: PaginationMetaSchema,
});

export type ListMaintenanceRecordsResponse = z.infer<typeof ListMaintenanceRecordsResponseSchema>;
