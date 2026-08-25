import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

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
