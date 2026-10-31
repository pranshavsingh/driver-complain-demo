import type { ReactElement, ReactNode } from 'react';
import type { Role } from '@driver-complaint/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { canAccessPath } from '../../auth/permissions';

interface RoleGateProps {
  roles?: Role[];
  path?: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RoleGate({
  roles,
  path,
  fallback = null,
  children,
}: RoleGateProps): ReactElement | null {
  const { user } = useAuth();

  if (!user) return <>{fallback}</>;

  if (roles && !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  if (path && !canAccessPath(user, path)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
