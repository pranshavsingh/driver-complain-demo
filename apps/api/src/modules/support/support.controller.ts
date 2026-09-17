import type { Request, Response } from 'express';
import {
  SendSupportMessageSchema,
  SupportMessageListQuerySchema,
} from '@driver-complaint/shared-types';
import * as supportService from './support.service';
import { ApiError } from '../../errors/api-error';
import { sendSuccess } from '../../lib/http';

export async function getConversations(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const conversations = await supportService.getConversations(req.user.id, req.user.role);
  sendSuccess(res, conversations);
}

export async function getMessages(
  req: Request<{ otherUserId: string }>,
  res: Response,
): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const query = SupportMessageListQuerySchema.parse(req.query);
  const result = await supportService.getMessages(
    req.user.id,
    req.params.otherUserId,
    query,
  );
  sendSuccess(res, result);
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const input = SendSupportMessageSchema.parse(req.body);
  const message = await supportService.sendMessage(
    req.user.id,
    input,
    req.file,
  );
  sendSuccess(res, message, 201);
}

export async function markConversationRead(
  req: Request<{ otherUserId: string }>,
  res: Response,
): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await supportService.markConversationRead(
    req.user.id,
    req.params.otherUserId,
  );
  sendSuccess(res, result);
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await supportService.getUnreadCount(req.user.id);
  sendSuccess(res, result);
}

export async function getDefaultAdmin(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await supportService.getDefaultSupportAdmin();
  sendSuccess(res, result);
}


