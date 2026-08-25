import type { Request, Response } from 'express';
import * as vehiclesService from './vehicles.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

/** Admin: list all vehicles (filter dropdown). */
export async function list(_req: Request, res: Response): Promise<void> {
  const result = await vehiclesService.list();
  sendSuccess(res, result);
}

/** Driver: the vehicles assigned to me. */
export async function listMine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await vehiclesService.listForUser(req.user.id);
  sendSuccess(res, result);
}
