import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { ApiError } from '../errors/api-error';

/**
 * Verify the Bearer access token and populate `req.user`. Stateless — a revoked user
 * keeps a valid token until it expires (≤ access TTL), which is acceptable for v1.
 * Async rejections are auto-forwarded to the error handler by Express 5.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();

  try {
    const claims = await verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, employeeId: claims.employeeId };
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  next();
}
