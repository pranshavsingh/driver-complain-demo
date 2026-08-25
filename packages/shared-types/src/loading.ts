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

  waitingTimeMinutes: z.number().nullable().optional(),
  formattedWaitingTime: z.string().nullable().optional(),
  status: LoadingStatusSchema,

  createdAt: z.string(),
  updatedAt: z.string(),

  driverName: z.string().optional(),
  vehiclePlate: z.string().optional(),
});
export type LoadingRecord = z.infer<typeof LoadingRecordSchema>;

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
