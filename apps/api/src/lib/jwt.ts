import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Role } from '@driver-complaint/shared-types';
import { env } from '../config/env';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  employeeId: string;
}

/** Parse a duration like "15m", "30d", "3600s", "2h" into seconds. */
export function parseDurationToSeconds(input: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid duration: ${input}`);
  const value = Number(m[1] ?? '0');
  const unit = m[2] ?? 's';
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 1);
}

export function accessTokenTtlSeconds(): number {
  return parseDurationToSeconds(env.ACCESS_TOKEN_TTL);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, employeeId: claims.employeeId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  return toClaims(payload);
}

function toClaims(payload: JWTPayload): AccessTokenClaims {
  const { sub, role, employeeId } = payload as JWTPayload & {
    role?: unknown;
    employeeId?: unknown;
  };
  if (typeof sub !== 'string' || typeof role !== 'string' || typeof employeeId !== 'string') {
    throw new Error('Malformed access token claims');
  }
  return { sub, role: role as Role, employeeId };
}
