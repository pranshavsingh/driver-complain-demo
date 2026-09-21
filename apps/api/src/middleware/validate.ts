import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../errors/api-error';

type Part = 'body' | 'query' | 'params';

/**
 * Validate a request part against a zod schema. On success the parsed data replaces
 * the source — except `query`, which is a read-only getter in Express 5, so parsed
 * values are placed on `res.locals.query`. On failure the ZodError is forwarded to
 * the error handler (rendered as 400 VALIDATION_ERROR).
 */
export function validate(schema: ZodType, part: Part = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const source = part === 'query' ? req.query : part === 'params' ? req.params : req.body;
    const result = schema.safeParse(source);
    if (!result.success) {
      next(result.error);
      return;
    }
    if (part === 'query') {
      res.locals.query = result.data;
    } else {
      (req as unknown as Record<string, unknown>)[part] = result.data;
    }
    next();
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a route param is a well-formed UUID string.
 */
export function validateUuidParam(paramName = 'id') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const raw = req.params[paramName];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || typeof value !== 'string' || !UUID_REGEX.test(value)) {
      next(ApiError.badRequest(`Invalid ${paramName} parameter (must be a valid UUID)`));
      return;
    }
    next();
  };
}
