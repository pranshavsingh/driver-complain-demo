import type { Request, Response } from 'express';
import { CreateUserSchema, UpdateUserSchema } from '@driver-complaint/shared-types';
import * as usersService from './users.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const user = await usersService.getById(req.user.id);
  sendSuccess(res, user);
}

export async function listAdmins(_req: Request, res: Response): Promise<void> {
  const admins = await usersService.listAdmins();
  sendSuccess(res, admins);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid user details', parsed.error.flatten());
  }

  const result = await usersService.createUser(req.user, parsed.data);
  sendSuccess(res, result, 201);
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { role, approvalStatus, isActive, search } = req.query;
  const filters = {
    ...(typeof role === 'string' ? { role: role as any } : {}),
    ...(typeof approvalStatus === 'string' ? { approvalStatus: approvalStatus as any } : {}),
    ...(typeof isActive === 'string' ? { isActive: isActive === 'true' } : {}),
    ...(typeof search === 'string' ? { search } : {}),
  };

  const users = await usersService.listUsers(filters);
  sendSuccess(res, users);
}

export async function approveUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const user = await usersService.approveUser(id);
  sendSuccess(res, user);
}

export async function rejectUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const user = await usersService.rejectUser(id);
  sendSuccess(res, user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid update details', parsed.error.flatten());
  }

  const updated = await usersService.updateUser(id, parsed.data);
  sendSuccess(res, updated);
}
