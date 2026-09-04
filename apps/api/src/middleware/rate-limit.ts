import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

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

