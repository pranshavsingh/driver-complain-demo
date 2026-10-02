import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAdmin, isSuperAdmin, useAuth } from './AuthContext';
import { canAccessPath } from './permissions';

/**
 * Route guard for every authenticated screen.
 *
 * This is UX, not security. It decides what to RENDER, and anyone can defeat it with
 * devtools. The actual authority is the API: each endpoint behind this guard runs its own
 * `authenticate` + `requireRole` check, so a bypassed guard yields a dashboard full of 401s
 * and 403s rather than access to anything.
 */
export function RequireAdmin({ children }: { children: ReactNode }): ReactElement {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="page-message">Restoring your session…</div>;
  }

  if (status !== 'authenticated' || !isAdmin(user)) {
    // Remember where they were headed so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

/**
 * Route guard restricted exclusively to SUPER_ADMIN users (e.g., Users & Approvals page).
 */
export function RequireSuperAdmin({ children }: { children: ReactNode }): ReactElement {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <div className="page-message">Restoring your session…</div>;
  }

  if (status !== 'authenticated' || !isSuperAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Route guard restricted to ADMIN and SUPER_ADMIN users (blocks EXECUTIVE users from /settings & /support).
 */
export function RequireNonExecutive({ children }: { children: ReactNode }): ReactElement {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <div className="page-message">Restoring your session…</div>;
  }

  if (status !== 'authenticated' || !user || user.role === 'EXECUTIVE') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Route guard for category-restricted pages based on the user's assigned domain categories.
 */
export function RequirePageAccess({ path, children }: { path: string; children: ReactNode }): ReactElement {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <div className="page-message">Restoring your session…</div>;
  }

  if (status !== 'authenticated' || !canAccessPath(user, path)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

