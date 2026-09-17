import { z } from 'zod';
import { SparePartRequestStatusSchema, SparePartTypeSchema } from './enums';
import type { DriverPublic } from './driver';
import type { VehiclePublic } from './vehicle';
import type { WarehousePublic } from './warehouse';

export const CreateSparePartRequestSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  vehicleNumber: z.string().trim().optional(),
  partName: z.string().trim().max(100).optional(),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  type: SparePartTypeSchema.default('NEW'),
});

export type CreateSparePartRequestInput = z.infer<typeof CreateSparePartRequestSchema>;

export const IssueSparePartSchema = z.object({
  warehouseId: z.string().uuid('Warehouse is required'),
  type: SparePartTypeSchema.default('NEW'),
  issuedPartName: z.string().trim().min(1, 'Issued part name is required').max(100),
  issuedPartNo: z.string().trim().min(1, 'Issued part / serial number is required').max(100),
  issuedQty: z.coerce.number().int().min(1).default(1),
  returnedPartNo: z.string().trim().max(100).optional(),
  returnedPartCondition: z.string().trim().max(100).optional(),
  adminNotes: z.string().trim().max(1000).optional(),
});

export type IssueSparePartInput = z.infer<typeof IssueSparePartSchema>;

export const RejectSparePartRequestSchema = z.object({
  rejectionReason: z.string().trim().min(1, 'Rejection reason is required').max(1000),
});

export type RejectSparePartRequestInput = z.infer<typeof RejectSparePartRequestSchema>;

export const SparePartListQuerySchema = z.object({
  status: SparePartRequestStatusSchema.optional(),
  type: SparePartTypeSchema.optional(),
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SparePartListQuery = z.infer<typeof SparePartListQuerySchema>;

export interface SparePartUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
}

export interface SparePartRequestPublic {
  id: string;
  requestNo: string;
  driverId: string;
  vehicleId: string;
  description: string;
  transcription: string | null;
  partName: string | null;
  quantity: number;
  photoUrl: string | null;
  photoPublicId: string | null;
  voiceUrl: string | null;
  voicePublicId: string | null;
  status: z.infer<typeof SparePartRequestStatusSchema>;
  type: z.infer<typeof SparePartTypeSchema>;
  approvedById: string | null;
  approvedBy?: SparePartUserSummary | null;
  approvedAt: string | null;
  issuedById: string | null;
  issuedBy?: SparePartUserSummary | null;
  issuedAt: string | null;
  warehouseId: string | null;
  warehouse?: WarehousePublic | null;
  issuedPartName: string | null;
  issuedPartNo: string | null;
  issuedQty: number | null;
  returnedPartNo: string | null;
  returnedPartCondition: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  driver?: DriverPublic & {
    user?: {
      firstName: string;
      lastName: string;
      employeeId: string;
      phone?: string | null;
    };
  };
  vehicle?: VehiclePublic;
}

export interface SparePartStatsSummary {
  totalPending: number;
  totalApproved: number;
  totalIssued: number;
  totalRejected: number;
  totalRequests: number;
  recentThisMonth: number;
}

