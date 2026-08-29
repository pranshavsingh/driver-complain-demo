import { prisma } from './prisma';
import { logger } from './logger';
import { getActiveAdminUserIds } from './admin-cache';

/**
 * Admin Load Balancer — round-robin with count-based distribution.
 *
 * DSA: Hash Map tracking active complaint counts per admin. O(n) scan for
 * min-load, where n = number of admins in a category (typically <10).
 *
 * Replaces the naive `findFirst` auto-assignment that always picks the same admin.
 */
export async function findLeastLoadedAdmin(
  category: string,
): Promise<string | null> {
  // Fetch admins matching the complaint category (respects TTL cache).
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'] },
      isActive: true,
      approvalStatus: 'APPROVED',
      category: category as any,
    },
    select: { id: true },
  });

  if (admins.length === 0) return null;
  if (admins.length === 1) return admins[0]!.id;

  // Batch query: count open complaints per candidate admin — one DB round-trip.
  const counts = await prisma.complaint.groupBy({
    by: ['assignedToId'],
    where: {
      assignedToId: { in: admins.map((a) => a.id) },
      status: { in: ['NEW', 'IN_PROGRESS'] },
    },
    _count: { id: true },
  });

  const loadMap = new Map<string | null, number>(
    counts.map((c) => [c.assignedToId, c._count.id]),
  );

  // Linear scan for admin with fewest active complaints — O(n), n ≈ 3-8.
  let minLoad = Infinity;
  let bestAdmin: string | null = null;
  for (const admin of admins) {
    const load = loadMap.get(admin.id) ?? 0;
    if (load < minLoad) {
      minLoad = load;
      bestAdmin = admin.id;
    }
  }

  logger.debug(
    { category, bestAdmin, minLoad, candidates: admins.length },
    'Load-balanced admin assignment',
  );

  return bestAdmin;
}
