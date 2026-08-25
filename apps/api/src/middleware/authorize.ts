import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@driver-complaint/shared-types';
import { ApiError } from '../errors/api-error';

/**
 * Guard: require the authenticated user to hold one of the given roles.
 * No implicit hierarchy — SUPER_ADMIN must be listed explicitly where it applies.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden('Insufficient permissions');
    }
    next();
  };
}
