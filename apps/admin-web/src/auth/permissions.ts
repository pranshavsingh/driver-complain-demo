import type { UserPublic, ComplaintCategory, Role } from '@driver-complaint/shared-types';

export function getUserCategories(user: UserPublic | null): ComplaintCategory[] {
  if (!user) return [];
  const set = new Set<ComplaintCategory>();
  if (user.category) set.add(user.category);
  if (user.categories && Array.isArray(user.categories)) {
    user.categories.forEach((cat) => {
      if (cat) set.add(cat);
    });
  }
  return Array.from(set);
}

export function canAccessPath(user: UserPublic | null, path: string): boolean {
  if (!user) return false;
  if ((user.role as Role) === 'SUPER_ADMIN') return true;

  const categories = getUserCategories(user);
  const normalizedPath = (path || '').toLowerCase().split('?')[0]?.split('#')[0] || '';

  // Base pages accessible to all staff/admins
  if (normalizedPath === '/dashboard' || normalizedPath === '/') return true;
  if (normalizedPath.startsWith('/vehicles')) return true;
  if (normalizedPath.startsWith('/users')) return true;

  // Unassigned ADMIN or EXECUTIVE (has no category restriction)
  if (categories.length === 0) {
    if (normalizedPath.startsWith('/support')) return false;
    return true;
  }

  // Domain-specific page rules based on assigned categories
  if (normalizedPath.startsWith('/complaints')) return true;

  if (normalizedPath.startsWith('/loading') || normalizedPath.startsWith('/trips')) {
    return categories.includes('LOADING') || categories.includes('UNLOADING');
  }

  if (normalizedPath.startsWith('/maintenance') || normalizedPath.startsWith('/fuel-logs')) {
    return (
      categories.includes('FUEL_DEF') ||
      categories.includes('TYRE_ISSUE') ||
      categories.includes('VEHICLE_MAINTENANCE')
    );
  }

  if (normalizedPath.startsWith('/spare-parts')) {
    return categories.includes('VEHICLE_MAINTENANCE');
  }

  if (normalizedPath.startsWith('/reports')) {
    return categories.includes('ACCOUNTS');
  }

  if (normalizedPath.startsWith('/support') || normalizedPath.startsWith('/settings')) {
    return (user.role as string) === 'SUPER_ADMIN';
  }

  return true;
}
