import type { Request, Response } from 'express';
import { CreateVehicleSchema, UpdateVehicleSchema } from '@driver-complaint/shared-types';
import * as vehiclesService from './vehicles.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';
import { setPaginationHeaders } from '../../lib/pagination';

/** Admin: vehicle fleet summary metrics. */
export async function summary(req: Request, res: Response): Promise<void> {
  const result = await vehiclesService.getSummary(req.user);
  sendSuccess(res, result);
}

/** Admin: lookup driver-to-vehicle assignments (bounded & scoped). */
export async function assignments(req: Request, res: Response): Promise<void> {
  const driverId = typeof req.query.driverId === 'string' && req.query.driverId.trim()
    ? req.query.driverId.trim()
    : undefined;

  const driverIds = typeof req.query.driverIds === 'string'
    ? req.query.driverIds.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  let limit: number | undefined = undefined;
  if (req.query.limit !== undefined) {
    if (typeof req.query.limit !== 'string' || !/^\d+$/.test(req.query.limit.trim())) {
      throw ApiError.badRequest('Query parameter "limit" must be a positive integer between 1 and 100');
    }
    const parsed = Number(req.query.limit.trim());
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw ApiError.badRequest('Query parameter "limit" must be a positive integer between 1 and 100');
    }
    limit = Math.min(parsed, 100);
  }

  const result = await vehiclesService.getAssignments({ driverId, driverIds, limit }, req.user);
  sendSuccess(res, result);
}

/** Admin: list all vehicles with search/filter. */
export async function list(req: Request, res: Response): Promise<void> {
  const result = await vehiclesService.list(req.query as any, req.user);
  setPaginationHeaders(res, result.meta);
  if (req.query.paginate === 'true') {
    sendSuccess(res, { data: result.data, pagination: result.meta });
  } else {
    sendSuccess(res, result.data);
  }
}

/** Driver: the vehicles assigned to me. */
export async function listMine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await vehiclesService.listForUser(req.user.id);
  sendSuccess(res, result);
}

/** Admin: get single vehicle by ID. */
export async function getById(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Vehicle ID is required');
  const result = await vehiclesService.getById(id, req.user);
  sendSuccess(res, result);
}

/** Admin: create a new vehicle entry. */
export async function create(req: Request, res: Response): Promise<void> {
  const parsed = CreateVehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const result = await vehiclesService.create(parsed.data);
  sendSuccess(res, result, 201);
}

/** Admin: update an existing vehicle entry. */
export async function update(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Vehicle ID is required');
  const parsed = UpdateVehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const result = await vehiclesService.update(id, parsed.data, req.user);
  sendSuccess(res, result);
}

/** Admin: delete a vehicle entry. */
export async function remove(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Vehicle ID is required');
  await vehiclesService.remove(id);
  res.status(204).send();
}
