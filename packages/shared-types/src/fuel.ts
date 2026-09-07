import { z } from 'zod';
import { FuelTypeSchema } from './enums';
import type { DriverPublic } from './driver';
import type { VehiclePublic } from './vehicle';

export const CreateFuelRecordSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  vehicleNumber: z.string().trim().min(1, 'Vehicle number is required').optional(),
  type: FuelTypeSchema.default('FUEL'),
  quantityLtr: z.number().positive('Quantity must be greater than 0'),
  totalPrice: z.number().nonnegative('Total price cannot be negative'),
  odometerKm: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateFuelRecordInput = z.infer<typeof CreateFuelRecordSchema>;

export interface FuelRecordPublic {
  id: string;
  driverId: string;
  vehicleId: string;
  type: z.infer<typeof FuelTypeSchema>;
  quantityLtr: number;
  totalPrice: number;
  ratePerLtr: number | null;
  odometerKm: number | null;
  receiptUrl: string | null;
  receiptPublicId: string | null;
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

export interface FuelStatsSummary {
  totalFuelCost: number;
  totalDefCost: number;
  totalFuelVolumeLtr: number;
  totalDefVolumeLtr: number;
  totalEntriesCount: number;
}
