import type { Request, Response } from 'express';
import {
  CreateSparePartRequestSchema,
  IssueSparePartSchema,
  RejectSparePartRequestSchema,
  SparePartListQuerySchema,
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
} from '@driver-complaint/shared-types';
import * as sparePartsService from './spare-parts.service';
import * as warehousesService from './warehouses.service';
import { writeSparePartsXlsx, exportFilename, XLSX_CONTENT_TYPE } from './spare-parts.export';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';
import { logger } from '../../lib/logger';

function collectEvidence(files: Request['files']): sparePartsService.SparePartEvidence {
  if (!files || Array.isArray(files)) return {};
  const evidence: sparePartsService.SparePartEvidence = {};
  const photoFile = files.photo?.[0];
  if (photoFile) {
    evidence.photo = {
      buffer: photoFile.buffer,
      originalName: photoFile.originalname,
    };
  }
  const voiceFile = files.voice?.[0];
  if (voiceFile) {
    evidence.voice = {
      buffer: voiceFile.buffer,
      originalName: voiceFile.originalname,
    };
  }
  return evidence;
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = CreateSparePartRequestSchema.parse(req.body);
  const result = await sparePartsService.createRequest(
    req.user.id,
    input,
    collectEvidence(req.files),
  );
  sendSuccess(res, result, 201);
}

export async function listRequests(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const query = SparePartListQuerySchema.parse(req.query);
  const result = await sparePartsService.listRequests(
    { id: req.user.id, role: req.user.role },
    query,
  );
  sendSuccess(res, result);
}

export async function getOne(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await sparePartsService.getOne(
    { id: req.user.id, role: req.user.role },
    req.params.id,
  );
  sendSuccess(res, result);
}

export async function approveAndIssue(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = IssueSparePartSchema.parse(req.body);
  const result = await sparePartsService.approveAndIssueRequest(
    req.user.id,
    req.params.id,
    input,
  );
  sendSuccess(res, result);
}

export async function rejectRequest(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = RejectSparePartRequestSchema.parse(req.body);
  const result = await sparePartsService.rejectRequest(
    req.user.id,
    req.params.id,
    input,
  );
  sendSuccess(res, result);
}

export async function getStats(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const { startDate, endDate, vehicleId } = req.query as {
    startDate?: string;
    endDate?: string;
    vehicleId?: string;
  };
  const result = await sparePartsService.getStats({ startDate, endDate, vehicleId });
  sendSuccess(res, result);
}

export async function exportXlsx(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const query = SparePartListQuerySchema.parse(req.query);
  const batches = sparePartsService.iterateForExport(query);

  const first = await batches.next();

  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);

  async function* prepend(
    firstBatch: IteratorResult<any[]>,
    rest: AsyncGenerator<any[]>,
  ): AsyncGenerator<any[]> {
    if (!firstBatch.done) yield firstBatch.value;
    yield* rest;
  }

  try {
    await writeSparePartsXlsx(res, prepend(first, batches as any));
  } catch (err) {
    logger.error({ err }, 'Spare parts export failed mid-stream');
    res.destroy(err instanceof Error ? err : new Error('Export failed'));
  }
}

// Warehouse Handlers
export async function listWarehouses(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const includeInactive = req.query.includeInactive === 'true';
  const result = await warehousesService.listWarehouses(includeInactive);
  sendSuccess(res, result);
}

export async function createWarehouse(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = CreateWarehouseSchema.parse(req.body);
  const result = await warehousesService.createWarehouse(input);
  sendSuccess(res, result, 201);
}

export async function updateWarehouse(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = UpdateWarehouseSchema.parse(req.body);
  const result = await warehousesService.updateWarehouse(req.params.id, input);
  sendSuccess(res, result);
}

export async function deleteWarehouse(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  await warehousesService.deleteWarehouse(req.params.id);
  sendSuccess(res, { success: true });
}

