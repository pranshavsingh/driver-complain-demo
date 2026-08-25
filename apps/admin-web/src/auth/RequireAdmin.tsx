import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAdmin, useAuth } from './AuthContext';

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
