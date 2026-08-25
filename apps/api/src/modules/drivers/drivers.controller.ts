import type { Request, Response } from 'express';
import * as driversService from './drivers.service';
import { sendSuccess } from '../../lib/http';

export async function list(_req: Request, res: Response): Promise<void> {
  const result = await driversService.list();
  sendSuccess(res, result);
}
