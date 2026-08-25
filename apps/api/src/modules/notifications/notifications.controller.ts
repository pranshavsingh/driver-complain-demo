import type { Request, Response } from 'express';
import type { RegisterDeviceToken, NotificationListQuery } from '@driver-complaint/shared-types';
import * as notificationsService from './notifications.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

export async function list(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const query = res.locals.query as NotificationListQuery;
  sendSuccess(res, await notificationsService.listForUser(req.user.id, query));
}

export async function registerDevice(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = req.body as RegisterDeviceToken;
  sendSuccess(res, await notificationsService.registerDevice(req.user.id, input), 201);
}

export async function unregisterDevice(
  req: Request<{ token: string }>,
  res: Response,
): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  // Express URL-decodes the segment; clients must encodeURIComponent the token.
  await notificationsService.unregisterDevice(req.user.id, req.params.token);
  res.status(204).send();
}

export async function markRead(req: Request<{ id: string }>, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  sendSuccess(res, await notificationsService.markRead(req.user.id, req.params.id));
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  sendSuccess(res, await notificationsService.markAllRead(req.user.id));
}
