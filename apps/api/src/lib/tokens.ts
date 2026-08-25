import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env';

/** Opaque refresh token — 256 bits of entropy, URL-safe. Returned to the client once. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Persist only the HMAC of the token, never the token itself. An attacker with read
 * access to the DB cannot mint a usable refresh token without REFRESH_TOKEN_SECRET.
 */
export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.REFRESH_TOKEN_SECRET).update(token).digest('hex');
}
