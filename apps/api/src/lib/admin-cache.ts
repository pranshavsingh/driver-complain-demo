import { prisma } from './prisma';

interface CacheEntry {
  ids: string[];
  expiresAt: number;
}

let adminCache: CacheEntry | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Fetch active Admin and Super Admin user IDs with a 30-second in-memory TTL cache.
 * Eliminates redundant database reads across complaint events, notifications, and loading milestones.
 */
export async function getActiveAdminUserIds(): Promise<string[]> {
  const now = Date.now();
  if (adminCache && adminCache.expiresAt > now) {
    return adminCache.ids;
  }

  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      isActive: true,
    },
    select: { id: true },
  });

  const ids = admins.map((a) => a.id);
  adminCache = { ids, expiresAt: now + CACHE_TTL_MS };
  return ids;
}

/** Clear the admin user ID cache manually (e.g., when a user role or status changes). */
export function invalidateAdminUserCache(): void {
  adminCache = null;
}
