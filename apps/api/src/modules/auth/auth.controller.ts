import type { Request, Response } from 'express';
import type { LoginRequest, RefreshRequest, LogoutRequest } from '@driver-complaint/shared-types';
import * as authService from './auth.service';
import { sendSuccess } from '../../lib/http';

function clientContext(req: Request) {
  return {
    userAgent: req.header('user-agent') ?? undefined,
    ipAddress: req.ip,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { employeeId, pin } = req.body as LoginRequest;
  const result = await authService.login(employeeId, pin, clientContext(req));
  sendSuccess(res, result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshRequest;
  const result = await authService.refresh(refreshToken, clientContext(req));
  sendSuccess(res, result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as LogoutRequest;
  await authService.logout(refreshToken);
  res.status(204).send();
}
