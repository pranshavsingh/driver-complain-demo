import type { Request, Response } from 'express';
import {
  markReachedLoadingPoint,
  markLoadingCompleted,
  startTrip,
  completeTrip,
  getActiveLoadingRecord,
  listLoadingRecords,
} from './loading.service';
import {
  CreateReachedLoadingSchema,
  CompleteLoadingSchema,
  StartTripSchema,
  CompleteTripSchema,
} from '@driver-complaint/shared-types';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

export async function handleReachedLoadingPoint(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  if (!req.file) {
    throw ApiError.badRequest('Photo proof is required when marking reached loading point');
  }

  const parsed = CreateReachedLoadingSchema.parse(req.body);

  const record = await markReachedLoadingPoint({
    userId,
    fileBuffer: req.file.buffer,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    address: parsed.address,
    locationName: parsed.locationName,
    complaintId: parsed.complaintId,
  });

  sendSuccess(res, record, 201);
}

export async function handleCompleteLoading(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  if (!req.file) {
    throw ApiError.badRequest('Photo proof is required when marking loading completed');
  }

  const parsed = CompleteLoadingSchema.parse(req.body);
  const loadingId = typeof req.params.id === 'string' ? req.params.id : undefined;

  const record = await markLoadingCompleted({
    userId,
    loadingId,
    fileBuffer: req.file.buffer,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    address: parsed.address,
  });

  sendSuccess(res, record);
}

export async function handleStartTrip(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  const parsed = StartTripSchema.parse(req.body);
  const loadingId = typeof req.params.id === 'string' ? req.params.id : undefined;

  const record = await startTrip({
    userId,
    loadingId,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    address: parsed.address,
  });

  sendSuccess(res, record);
}

export async function handleCompleteTrip(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  if (!req.file) {
    throw ApiError.badRequest('Photo proof is required when completing trip');
  }

  const parsed = CompleteTripSchema.parse(req.body);
  const loadingId = typeof req.params.id === 'string' ? req.params.id : undefined;

  const record = await completeTrip({
    userId,
    loadingId,
    fileBuffer: req.file.buffer,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    address: parsed.address,
  });

  sendSuccess(res, record);
}

export async function handleGetActiveLoading(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  const record = await getActiveLoadingRecord(userId);
  sendSuccess(res, { active: record });
}

export async function handleListLoadingRecords(req: Request, res: Response): Promise<void> {
  const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const records = await listLoadingRecords({ driverId, status, limit });
  sendSuccess(res, { data: records });
}
