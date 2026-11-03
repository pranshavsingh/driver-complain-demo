import type { Request, Response } from 'express';
import * as driversService from './drivers.service';
import { sendSuccess } from '../../lib/http';
import { setPaginationHeaders } from '../../lib/pagination';

export async function list(req: Request, res: Response): Promise<void> {
  const result = await driversService.list(req.query as any);
  setPaginationHeaders(res, result.meta);
  if (req.query.paginate === 'true') {
    sendSuccess(res, { data: result.data, pagination: result.meta });
  } else {
    sendSuccess(res, result.data);
  }
}
