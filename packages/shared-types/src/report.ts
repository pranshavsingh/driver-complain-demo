import { z } from 'zod';
import { ComplaintCategorySchema, ComplaintStatusSchema, PrioritySchema, LoadingStatusSchema, FuelTypeSchema, MaintenanceTypeSchema } from './enums';
import { VehiclePublicSchema } from './vehicle';
import { DriverListItemSchema } from './driver';

export const VehicleReportQuerySchema = z.object({
  vehicleId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type VehicleReportQuery = z.infer<typeof VehicleReportQuerySchema>;

export const VehicleReportSummarySchema = z.object({
  totalTrips: z.number().int(),
  completedTrips: z.number().int(),
  totalLoadingWaitMinutes: z.number().int(),
  totalTripDurationMinutes: z.number().int(),
  totalUnloadingWaitMinutes: z.number().int(),
  totalComplaints: z.number().int(),
  breakdownCount: z.number().int(),
  tyreIssueCount: z.number().int(),
  fuelIssueCount: z.number().int(),
  totalFuelLtr: z.number(),
  totalFuelCost: z.number(),
  totalMaintenanceCost: z.number(),
});
export type VehicleReportSummary = z.infer<typeof VehicleReportSummarySchema>;

export const VehicleReportTripItemSchema = z.object({
  id: z.string(),
  status: LoadingStatusSchema,
  reachedAt: z.string(),
  reachedAddress: z.string().nullable().optional(),
  reachedPhotoUrl: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  completedAddress: z.string().nullable().optional(),
  completedPhotoUrl: z.string().nullable().optional(),
  waitingTimeMinutes: z.number().int().nullable().optional(),
  tripStartedAt: z.string().nullable().optional(),
  tripStartAddress: z.string().nullable().optional(),
  tripCompletedAt: z.string().nullable().optional(),
  tripCompletedAddress: z.string().nullable().optional(),
  tripCompletedPhotoUrl: z.string().nullable().optional(),
  tripDurationMinutes: z.number().int().nullable().optional(),
  unloadingCompletedAt: z.string().nullable().optional(),
  unloadingAddress: z.string().nullable().optional(),
  unloadingPhotoUrl: z.string().nullable().optional(),
  unloadingDurationMinutes: z.number().int().nullable().optional(),
  driverName: z.string().optional(),
  driverEmployeeId: z.string().optional(),
});
export type VehicleReportTripItem = z.infer<typeof VehicleReportTripItemSchema>;

export const VehicleReportComplaintItemSchema = z.object({
  id: z.string(),
  complaintNo: z.string(),
  category: ComplaintCategorySchema,
  title: z.string(),
  description: z.string(),
  status: ComplaintStatusSchema,
  priority: PrioritySchema,
  driverName: z.string().optional(),
  driverEmployeeId: z.string().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
  photoUrls: z.array(z.string()).optional(),
  voiceUrl: z.string().nullable().optional(),
});
export type VehicleReportComplaintItem = z.infer<typeof VehicleReportComplaintItemSchema>;

export const VehicleReportFuelItemSchema = z.object({
  id: z.string(),
  type: FuelTypeSchema,
  quantityLtr: z.number(),
  totalPrice: z.number(),
  ratePerLtr: z.number().nullable().optional(),
  odometerKm: z.number().int().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  driverName: z.string().optional(),
});
export type VehicleReportFuelItem = z.infer<typeof VehicleReportFuelItemSchema>;

export const VehicleReportMaintenanceItemSchema = z.object({
  id: z.string(),
  type: MaintenanceTypeSchema,
  itemNumber: z.string(),
  quantity: z.number().int(),
  brand: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  odometerKm: z.number().int().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  driverName: z.string().optional(),
});
export type VehicleReportMaintenanceItem = z.infer<typeof VehicleReportMaintenanceItemSchema>;

export const VehicleReportTimelineItemSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  eventType: z.enum([
    'LOADING_REACHED',
    'LOADING_COMPLETED',
    'TRIP_STARTED',
    'UNLOADING_REACHED',
    'UNLOADING_COMPLETED',
    'COMPLAINT_REPORTED',
    'COMPLAINT_RESOLVED',
    'FUEL_LOGGED',
    'MAINTENANCE_LOGGED',
  ]),
  title: z.string(),
  description: z.string().optional(),
  badgeText: z.string().optional(),
  badgeVariant: z.enum(['default', 'success', 'warning', 'danger', 'info']).optional(),
  location: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type VehicleReportTimelineItem = z.infer<typeof VehicleReportTimelineItemSchema>;

export const VehicleFullReportResponseSchema = z.object({
  vehicle: VehiclePublicSchema.nullable(),
  driver: DriverListItemSchema.nullable().optional(),
  summary: VehicleReportSummarySchema,
  timeline: z.array(VehicleReportTimelineItemSchema),
  trips: z.array(VehicleReportTripItemSchema),
  complaints: z.array(VehicleReportComplaintItemSchema),
  fuelRecords: z.array(VehicleReportFuelItemSchema),
  maintenanceRecords: z.array(VehicleReportMaintenanceItemSchema),
});
export type VehicleFullReportResponse = z.infer<typeof VehicleFullReportResponseSchema>;

export const FleetVehicleSummaryItemSchema = z.object({
  id: z.string(),
  plateNumber: z.string(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  vin: z.string().nullable().optional(),
  driverName: z.string().optional(),
  driverEmployeeId: z.string().optional(),
  driverLicenseNumber: z.string().optional(),
  totalTrips: z.number().int(),
  completedTrips: z.number().int(),
  activeTripStatus: LoadingStatusSchema.nullable().optional(),
  totalComplaints: z.number().int(),
  breakdownCount: z.number().int(),
  totalFuelCost: z.number(),
  totalMaintenanceCost: z.number(),
  createdAt: z.string(),
});
export type FleetVehicleSummaryItem = z.infer<typeof FleetVehicleSummaryItemSchema>;
