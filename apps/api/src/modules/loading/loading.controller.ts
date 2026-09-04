import type { LoadingStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  markReachedLoadingPoint,
  markLoadingCompleted,
  startTrip,
  completeTrip,
  completeUnloading,
  getActiveLoadingRecord,
  listLoadingRecords,
  listTripRecords,
  iterateTripRecords,
  getDriverMonthlyTripSummaries,
  exportTripsToCsv,
} from './loading.service';
import {
  CreateReachedLoadingSchema,
  CompleteLoadingSchema,
  StartTripSchema,
  CompleteTripSchema,
  CompleteUnloadingSchema,
} from '@driver-complaint/shared-types';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';
import { exportTripFilename, writeTripsXlsx, XLSX_CONTENT_TYPE } from './loading.export';

function tripFilters(req: Request) {
  return {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    driverId: typeof req.query.driverId === 'string' ? req.query.driverId : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    from: typeof req.query.from === 'string' ? new Date(req.query.from) : undefined,
    to: typeof req.query.to === 'string' ? new Date(req.query.to) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
  };
}

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

/** Driver reached the unloading point — ends transit, starts the unloading clock. */
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

/** Driver finished unloading at the destination — closes out the trip cycle. */
export async function handleCompleteUnloading(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  if (!req.file) {
    throw ApiError.badRequest('Photo proof is required when marking unloading completed');
  }

  const parsed = CompleteUnloadingSchema.parse(req.body);
  const loadingId = typeof req.params.id === 'string' ? req.params.id : undefined;

  const record = await completeUnloading({
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

  const { active, stats } = await getActiveLoadingRecord(userId);
  sendSuccess(res, { active, stats });
}

export async function handleListLoadingRecords(req: Request, res: Response): Promise<void> {
  if (req.path === '/trips') {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 15));
    sendSuccess(res, await listTripRecords({ ...tripFilters(req), page, pageSize }));
    return;
  }

  const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
  const status = typeof req.query.status === 'string' ? (req.query.status as LoadingStatus) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const records = await listLoadingRecords({ driverId, status, limit });
  sendSuccess(res, { data: records });
}

export async function handleGetMonthlyTripSummaries(req: Request, res: Response): Promise<void> {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const month = req.query.month ? Number(req.query.month) : undefined;
  const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const summaries = await getDriverMonthlyTripSummaries({ year, month, driverId, search });
  sendSuccess(res, { data: summaries });
}

export async function handleExportTripsCsv(req: Request, res: Response): Promise<void> {
  const filters = tripFilters(req);
  const csv = await exportTripsToCsv(filters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trips-report-${Date.now()}.csv"`);
  res.send(csv);
}

export async function handleExportTrips(req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${exportTripFilename()}"`);
  await writeTripsXlsx(res, iterateTripRecords(tripFilters(req)));
}
