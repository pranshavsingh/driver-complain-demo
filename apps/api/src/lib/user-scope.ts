import { prisma } from './prisma';
import type { Role, ComplaintCategory } from '@driver-complaint/shared-types';

export interface UserScope {
  role: Role;
  /** null = sees all categories (e.g. SUPER_ADMIN) */
  categories: ComplaintCategory[] | null;
  /** null = sees all sites */
  site: string | null;
}

export async function resolveUserScope(userId: string, role: Role): Promise<UserScope> {
  if (role === 'SUPER_ADMIN') {
    return { role, categories: null, site: null };
  }

  if (role === 'ADMIN') {
    const assignments = await prisma.adminCategoryAssignment.findMany({
      where: { adminId: userId },
      select: { category: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { category: true, site: true },
    });

    const categoriesSet = new Set<ComplaintCategory>();
    if (user?.category) {
      categoriesSet.add(user.category as ComplaintCategory);
    }
    for (const a of assignments) {
      categoriesSet.add(a.category as ComplaintCategory);
    }

    return {
      role,
      // null means "no category restriction" — applies when an ADMIN has no
      // explicit category assignments. They still see complaints via direct
      // assignment and site-incharge relations (handled in buildWhere).
      categories: categoriesSet.size > 0 ? Array.from(categoriesSet) : null,
      site: user?.site ?? null,
    };
  }

  if (role === 'EXECUTIVE') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { category: true, site: true },
    });

    return {
      role,
      // An executive with no category set gets an empty array — they can still
      // see complaints explicitly assigned to them (handled in buildWhere).
      categories: user?.category ? [user.category as ComplaintCategory] : [],
      site: user?.site ?? null,
    };
  }

  return { role, categories: [], site: null };
}
