import { z } from 'zod';
import { MaintenanceTypeSchema } from './enums';
import type { DriverPublic } from './driver';
import type { VehiclePublic } from './vehicle';

export const CreateMaintenanceRecordSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  vehicleNumber: z.string().trim().min(1, 'Vehicle number is required').optional(),
  type: MaintenanceTypeSchema.default('TYRE'),
  itemNumber: z.string().trim().min(1, 'Identification / Serial number is required'),
  quantity: z.coerce.number().int().min(1).default(1),
  odometerKm: z.coerce.number().int().nonnegative().optional(),
  brand: z.string().trim().max(100).optional(),
  position: z.string().trim().max(100).optional(),
  cost: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateMaintenanceRecordInput = z.infer<typeof CreateMaintenanceRecordSchema>;

export interface MaintenanceRecordPublic {
  id: string;
  driverId: string;
  vehicleId: string;
  type: z.infer<typeof MaintenanceTypeSchema>;
  itemNumber: string;
  quantity: number;
  photoUrl: string;
  photoPublicId: string | null;
  odometerKm: number | null;
  brand: string | null;
  position: string | null;
  cost: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  driver?: DriverPublic & {
    user?: {
      firstName: string;
      lastName: string;
      employeeId: string;
    };
  };
  vehicle?: VehiclePublic;
}

export interface MaintenanceStatsSummary {
  totalTyreCount: number;
  totalBatteryCount: number;
  totalEntriesCount: number;
  recentThisMonthCount: number;
}
