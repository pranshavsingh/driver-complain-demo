import type { Request, Response } from 'express';
import { CreateVehicleSchema, UpdateVehicleSchema } from '@driver-complaint/shared-types';
import * as vehiclesService from './vehicles.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

/** Admin: list all vehicles with search/filter. */
export async function list(req: Request, res: Response): Promise<void> {
  const result = await vehiclesService.list(req.query as any);
  sendSuccess(res, result);
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
  const result = await vehiclesService.getById(id);
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
  const result = await vehiclesService.update(id, parsed.data);
  sendSuccess(res, result);
}

/** Admin: delete a vehicle entry. */
export async function remove(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Vehicle ID is required');
  await vehiclesService.remove(id);
  res.status(204).send();
}
