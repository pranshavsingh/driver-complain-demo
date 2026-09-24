import type { Request, Response } from 'express';
import { CreateOperatingSiteSchema, UpdateOperatingSiteSchema } from '@driver-complaint/shared-types';
import * as sitesService from './sites.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

export async function list(req: Request, res: Response): Promise<void> {
  const onlyActive = req.query.active === 'true';
  const result = await sitesService.list(onlyActive);
  sendSuccess(res, result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Site ID is required');
  const result = await sitesService.getById(id);
  sendSuccess(res, result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = CreateOperatingSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid site data', parsed.error.flatten());
  }
  const result = await sitesService.create(parsed.data);
  sendSuccess(res, result, 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Site ID is required');
  const parsed = UpdateOperatingSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid site data', parsed.error.flatten());
  }
  const result = await sitesService.update(id, parsed.data);
  sendSuccess(res, result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw ApiError.badRequest('Site ID is required');
  await sitesService.remove(id);
  res.status(204).send();
}
