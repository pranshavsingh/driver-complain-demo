import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from '../errors/api-error';
import { logger } from '../lib/logger';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Terminal error handler. Renders the typed `{ success: false, error: { code, message,
 * details, requestId } }` envelope from shared-types. Must keep the 4-arg signature so
 * Express treats it as an error handler. `_next` is intentionally unused.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // pino-http types req.id as ReqId (string | number | object); ours is always the
  // string correlation id set by the request-id middleware. Coerce defensively.
  const requestId = req.id == null ? undefined : String(req.id);

  if (err instanceof ZodError) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: z.flattenError(err),
        requestId,
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof ApiError) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error({ err, requestId }, 'Unhandled error');
  const body: ErrorBody = {
    success: false,
    error: {
      code: 'INTERNAL',
      message: 'Internal server error',
      requestId,
    },
  };
  res.status(500).json(body);
}
