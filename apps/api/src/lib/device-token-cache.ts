import { prisma } from './prisma';
import { logger } from './logger';

/**
 * In-memory TTL cache for FCM device tokens, keyed by userId.
 *
 * DSA: Hash Map with per-entry expiry — O(1) get, O(n) batch populate.
 * Reduces device-token DB lookups from "once per notification event" to
 * "once per minute per user."
 */

interface TokenEntry {
  tokens: string[];
  expiresAt: number;
}

const cache = new Map<string, TokenEntry>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Resolve device tokens for the given user IDs, serving from cache where
 * possible and batch-fetching uncached users in a single query.
 */
export async function getCachedDeviceTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const now = Date.now();
  const uncached: string[] = [];
  const result: string[] = [];

  for (const id of userIds) {
    const entry = cache.get(id);
    if (entry && entry.expiresAt > now) {
      result.push(...entry.tokens);
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    try {
      const rows = await prisma.deviceToken.findMany({
        where: { userId: { in: uncached } },
        select: { userId: true, token: true },
      });

      // Group by userId with a Map — O(n).
      const grouped = new Map<string, string[]>();
      for (const r of rows) {
        const list = grouped.get(r.userId) ?? [];
        list.push(r.token);
        grouped.set(r.userId, list);
      }

      // Cache each user's tokens (including users with zero tokens, to avoid re-querying).
      for (const uid of uncached) {
        const tokens = grouped.get(uid) ?? [];
        cache.set(uid, { tokens, expiresAt: now + CACHE_TTL_MS });
        result.push(...tokens);
      }
    } catch (err) {
      logger.warn({ err }, 'Device-token cache fetch failed, falling back to uncached');
    }
  }

  return result;
}

/** Invalidate cache for a specific user (e.g. after token registration/removal). */
export function invalidateDeviceTokenCache(userId: string): void {
  cache.delete(userId);
}

/** Invalidate all cached tokens. */
export function clearDeviceTokenCache(): void {
  cache.clear();
}
