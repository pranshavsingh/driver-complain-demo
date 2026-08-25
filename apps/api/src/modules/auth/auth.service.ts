import { randomUUID } from 'node:crypto';
import type { LoginResponse, RefreshResponse, UserPublic } from '@driver-complaint/shared-types';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { verifyPin } from '../../lib/password';
import { signAccessToken, accessTokenTtlSeconds, parseDurationToSeconds } from '../../lib/jwt';
import { generateRefreshToken, hashRefreshToken } from '../../lib/tokens';
import { toUserPublic } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';
import { env } from '../../config/env';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface ClientContext {
  userAgent?: string;
  ipAddress?: string;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + parseDurationToSeconds(env.REFRESH_TOKEN_TTL) * 1000);
}

/** Mint an access token + a fresh refresh token row within an existing family. */
async function issueTokenPair(
  user: Pick<User, 'id' | 'role' | 'employeeId'>,
  familyId: string,
  ctx: ClientContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    employeeId: user.employeeId,
  });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiry(),
      userAgent: ctx.userAgent ?? null,
      ipAddress: ctx.ipAddress ?? null,
    },
  });
  return { accessToken, refreshToken, expiresIn: accessTokenTtlSeconds() };
}

export async function login(
  employeeId: string,
  pin: string,
  ctx: ClientContext,
): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({ where: { employeeId } });
  // Uniform message on the not-found and bad-PIN paths to avoid user enumeration.
  if (!user) throw ApiError.unauthorized('Invalid credentials');
  if (!user.isActive) throw ApiError.forbidden('Account is disabled');
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw ApiError.tooManyRequests('Account temporarily locked due to failed attempts');
  }

  const ok = await verifyPin(pin, user.pinHash);
  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : user.lockedUntil,
      },
    });
    throw ApiError.unauthorized('Invalid credentials');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const tokens = await issueTokenPair(user, randomUUID(), ctx);
  const publicUser: UserPublic = toUserPublic(user);
  return { ...tokens, user: publicUser };
}

export async function refresh(
  presentedToken: string,
  ctx: ClientContext,
): Promise<RefreshResponse> {
  const tokenHash = hashRefreshToken(presentedToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) throw ApiError.unauthorized('Invalid refresh token');

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  // Reuse detection: a token that was already rotated/revoked is being replayed.
  // Assume compromise and nuke the entire family, forcing a fresh login.
  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
    });
    throw ApiError.unauthorized('Refresh token reuse detected');
  }

  if (!existing.user.isActive) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'ADMIN_REVOKED' },
    });
    throw ApiError.forbidden('Account is disabled');
  }

  // Rotate: issue a new token in the same family and mark the old one replaced.
  const accessToken = await signAccessToken({
    sub: existing.user.id,
    role: existing.user.role,
    employeeId: existing.user.employeeId,
  });
  const newRefreshToken = generateRefreshToken();

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        familyId: existing.familyId,
        tokenHash: hashRefreshToken(newRefreshToken),
        expiresAt: refreshExpiry(),
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED', replacedById: created.id },
    });
  });

  return { accessToken, refreshToken: newRefreshToken, expiresIn: accessTokenTtlSeconds() };
}

export async function logout(presentedToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(presentedToken);
  // Idempotent: revoke if present and still active; silently succeed otherwise.
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
  });
}
