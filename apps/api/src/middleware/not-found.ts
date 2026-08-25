import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../errors/api-error';

/** Terminal 404 for unmatched routes — forwarded to the error handler. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
