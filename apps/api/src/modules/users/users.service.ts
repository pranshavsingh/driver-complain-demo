import type { UserPublic, AdminSummary, Role } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toUserPublic, toAdminSummary } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export async function getById(id: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found');
  return toUserPublic(user);
}

/**
 * Active admins, name-ordered — the dashboard's assignee/filter dropdown.
 *
 * Deactivated admins are excluded on purpose: `assign` rejects an inactive target, so
 * offering one would only produce a confusing 400. It also means a timeline entry authored
 * by a since-deactivated admin can't be resolved from this list — the timeline embeds its
 * own `author`, so it doesn't need to be.
 */
export async function listAdmins(): Promise<AdminSummary[]> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ADMIN_ROLES }, isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return admins.map(toAdminSummary);
}
