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
  if (normalizedPath === '/dashboard' || normalizedPath === '/' || normalizedPath.includes('/dashboard')) return true;
  if (normalizedPath.includes('/vehicles')) return true;
  if (normalizedPath.includes('/users')) {
    return (user.role as Role) === 'SUPER_ADMIN' || (user.role as Role) === 'ADMIN';
  }

  // Unassigned ADMIN or EXECUTIVE (has no category restriction)
  if (categories.length === 0) {
    if (normalizedPath.includes('/support') || normalizedPath.includes('/settings')) {
      return (user.role as Role) === 'SUPER_ADMIN';
    }
    return true;
  }

  // Domain-specific page rules based on assigned categories
  if (normalizedPath.includes('/complaints')) return true;

  if (normalizedPath.includes('/loading') || normalizedPath.includes('/trips')) {
    return categories.includes('LOADING') || categories.includes('UNLOADING');
  }

  if (normalizedPath.includes('/maintenance') || normalizedPath.includes('/fuel-logs')) {
    return (
      categories.includes('FUEL_DEF') ||
      categories.includes('TYRE_ISSUE') ||
      categories.includes('VEHICLE_MAINTENANCE')
    );
  }

  if (normalizedPath.includes('/spare-parts')) {
    return categories.includes('VEHICLE_MAINTENANCE');
  }

  if (normalizedPath.includes('/reports')) {
    return categories.includes('ACCOUNTS');
  }

  if (normalizedPath.includes('/support') || normalizedPath.includes('/settings')) {
    return (user.role as string) === 'SUPER_ADMIN';
  }

  return true;
}

export function canManageUsers(user: UserPublic | null): boolean {
  return user?.role === 'SUPER_ADMIN';
}

export function canManageVehicles(user: UserPublic | null): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
}

export function canResolveComplaints(user: UserPublic | null): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
}
