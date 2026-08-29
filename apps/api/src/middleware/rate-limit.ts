import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { SlidingWindowRateLimiter } from '../lib/sliding-window';

/**
 * Login throttle — PINs are low-entropy, so cap attempts per IP + employeeId.
 * `validate: false` silences express-rate-limit v7's IPv6 keyGenerator check
 * (we key on employeeId, not raw IP).
 */
export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const body = req.body as { employeeId?: unknown } | undefined;
    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : 'unknown';
    return `${req.ip ?? 'noip'}:${employeeId}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many login attempts. Please try again later.',
        requestId: req.id == null ? undefined : String(req.id),
      },
    });
  },
});

/** Coarse global limiter for the whole API surface. */
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Sliding Window Rate Limiter Middleware (DSA: Sliding Window Log via binary search).
 * Prevents burst spikes at fixed window boundaries.
 */
const slidingLimiter = new SlidingWindowRateLimiter();

export function createSlidingRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip ?? 'ip'}:${req.path}`;
    if (!slidingLimiter.isAllowed(key, maxRequests, windowMs)) {
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit exceeded. Please slow down.',
          requestId: req.id == null ? undefined : String(req.id),
        },
      });
      return;
    }
    next();
  };
}

