import { z } from 'zod';
import { LoadingStatusSchema } from './enums';

export const LoadingRecordSchema = z.object({
  id: z.string(),
  driverId: z.string(),
  complaintId: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),

  reachedAt: z.string(),
  reachedLatitude: z.number(),
  reachedLongitude: z.number(),
  reachedAddress: z.string().nullable().optional(),
  reachedPhotoUrl: z.string(),

  completedAt: z.string().nullable().optional(),
  completedLatitude: z.number().nullable().optional(),
  completedLongitude: z.number().nullable().optional(),
  completedAddress: z.string().nullable().optional(),
  completedPhotoUrl: z.string().nullable().optional(),

  tripStartedAt: z.string().nullable().optional(),
  tripStartLatitude: z.number().nullable().optional(),
  tripStartLongitude: z.number().nullable().optional(),
  tripStartAddress: z.string().nullable().optional(),

  // tripCompletedAt is when the driver reached the unloading point: the end of transit and
  // the start of the unloading wait.
  tripCompletedAt: z.string().nullable().optional(),
  tripCompletedLatitude: z.number().nullable().optional(),
  tripCompletedLongitude: z.number().nullable().optional(),
  tripCompletedAddress: z.string().nullable().optional(),
  tripCompletedPhotoUrl: z.string().nullable().optional(),
  tripDurationMinutes: z.number().nullable().optional(),
  formattedTripDuration: z.string().nullable().optional(),

  // Unloading finished at the destination.
  unloadingCompletedAt: z.string().nullable().optional(),
  unloadingLatitude: z.number().nullable().optional(),
  unloadingLongitude: z.number().nullable().optional(),
  unloadingAddress: z.string().nullable().optional(),
  unloadingPhotoUrl: z.string().nullable().optional(),
  unloadingDurationMinutes: z.number().nullable().optional(),
  formattedUnloadingDuration: z.string().nullable().optional(),

  /** Wait at the loading point: completedAt - reachedAt. */
  waitingTimeMinutes: z.number().nullable().optional(),
  formattedWaitingTime: z.string().nullable().optional(),
  status: LoadingStatusSchema,

  createdAt: z.string(),
  updatedAt: z.string(),

  driverName: z.string().nullable().optional(),
  vehiclePlate: z.string().nullable().optional(),
  completedTripsCount: z.number().nullable().optional(),
  monthlyTripsCount: z.number().nullable().optional(),
});
export type LoadingRecord = z.infer<typeof LoadingRecordSchema>;

export const LoadingStatsSchema = z.object({
  completedTripsCount: z.number(),
  monthlyTripsCount: z.number(),
});
export type LoadingStats = z.infer<typeof LoadingStatsSchema>;

export const ActiveLoadingResponseSchema = z.object({
  active: LoadingRecordSchema.nullable(),
  stats: LoadingStatsSchema.optional(),
});
export type ActiveLoadingResponse = z.infer<typeof ActiveLoadingResponseSchema>;

export const DriverMonthlyTripSummarySchema = z.object({
  driverId: z.string(),
  driverName: z.string(),
  licenseNumber: z.string(),
  vehiclePlate: z.string(),
  year: z.number(),
  month: z.number(),
  monthLabel: z.string(),
  completedTripsCount: z.number(),
  totalTripDurationMinutes: z.number(),
  avgTripDurationMinutes: z.number(),
  totalWaitingTimeMinutes: z.number(),
  totalUnloadingTimeMinutes: z.number(),
  avgUnloadingTimeMinutes: z.number(),
});
export type DriverMonthlyTripSummary = z.infer<typeof DriverMonthlyTripSummarySchema>;


export const CreateReachedLoadingSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  address: z.string().optional(),
  locationName: z.string().optional(),
  complaintId: z.string().optional(),
});
export type CreateReachedLoadingInput = z.infer<typeof CreateReachedLoadingSchema>;

export const CompleteLoadingSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  address: z.string().optional(),
});
export type CompleteLoadingInput = z.infer<typeof CompleteLoadingSchema>;

export const StartTripSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  address: z.string().optional(),
});
export type StartTripInput = z.infer<typeof StartTripSchema>;

export const CompleteTripSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  address: z.string().optional(),
});
export type CompleteTripInput = z.infer<typeof CompleteTripSchema>;

/** Driver taps "Unloading Done" at the destination — closes out the trip cycle. */
export const CompleteUnloadingSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  address: z.string().optional(),
});
export type CompleteUnloadingInput = z.infer<typeof CompleteUnloadingSchema>;
