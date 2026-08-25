import type { Response } from 'express';

/**
 * Write the standard success envelope: `{ success: true, data }`. Every non-empty
 * 2xx response goes through here so the contract stays uniform across the API.
 * (204 No Content responses have no body and skip this.)
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}
