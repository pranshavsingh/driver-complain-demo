import { prisma } from './prisma';

interface CacheEntry {
  ids: string[];
  expiresAt: number;
}

let adminCache: CacheEntry | null = null;
let inflight: Promise<string[]> | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/** Clear in-memory cache (useful for testing or explicit invalidation). */
export function invalidateAdminCache(): void {
  adminCache = null;
  inflight = null;
}

/**
 * Fetch active Admin and Super Admin user IDs with a 30-second in-memory TTL cache.
 * Eliminates redundant database reads across complaint events, notifications, and loading milestones.
 * Uses an in-flight Promise to deduplicate concurrent requests during cache miss.
 */
export async function getActiveAdminUserIds(): Promise<string[]> {
  const now = Date.now();
  if (adminCache && adminCache.expiresAt > now) {
    return adminCache.ids;
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          isActive: true,
        },
        select: { id: true },
      });

      const ids = admins.map((a) => a.id);
      adminCache = { ids, expiresAt: Date.now() + CACHE_TTL_MS };
      return ids;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
