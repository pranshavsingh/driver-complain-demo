import type { Request, Response } from 'express';
import {
  markReachedLoadingPoint,
  markLoadingCompleted,
  getActiveLoadingRecord,
  listLoadingRecords,
} from './loading.service';
import { CreateReachedLoadingSchema, CompleteLoadingSchema } from '@driver-complaint/shared-types';
import { ApiError } from '../../errors/api-error';

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

  res.status(201).json(record);
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

  res.json(record);
}

export async function handleGetActiveLoading(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  const record = await getActiveLoadingRecord(userId);
  res.json({ active: record });
}

export async function handleListLoadingRecords(req: Request, res: Response): Promise<void> {
  const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const records = await listLoadingRecords({ driverId, status, limit });
  res.json({ data: records });
}
