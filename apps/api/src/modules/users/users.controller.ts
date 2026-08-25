import type { Request, Response } from 'express';
import * as usersService from './users.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

/** Return the authenticated user's own profile. */
export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const user = await usersService.getById(req.user.id);
  sendSuccess(res, user);
}

/** Admin: the list of active admins, for assignee dropdowns. */
export async function listAdmins(_req: Request, res: Response): Promise<void> {
  const admins = await usersService.listAdmins();
  sendSuccess(res, admins);
}
