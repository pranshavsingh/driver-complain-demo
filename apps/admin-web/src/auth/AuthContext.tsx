import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Role, UserPublic } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { getRefreshToken, onSessionEnded, setTokens } from '../api/tokens';
import { refreshSession } from '../api/client';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

/** Whether this user may use the dashboard at all. */
export function isAdmin(user: UserPublic | null): boolean {
  return user !== null && ADMIN_ROLES.includes(user.role);
}

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: UserPublic | null;
  login: (employeeId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<UserPublic | null>(null);

  // Restore a session on first load: the access token was lost with the page, but the stored
  // refresh token can mint a new one. `me()` then confirms the account is still valid — an
  // admin deactivated overnight must not get a working dashboard from a cached token.
  useEffect(() => {
    let active = true;

    const restore = async (): Promise<void> => {
      if (!getRefreshToken()) {
        if (active) setStatus('anonymous');
        return;
      }
      const refreshed = await refreshSession();
      if (!refreshed) {
        if (active) setStatus('anonymous');
        return;
      }
      try {
        const me = await api.users.me();
        if (!active) return;
        setUser(me);
        setStatus(isAdmin(me) ? 'authenticated' : 'anonymous');
      } catch {
        if (active) setStatus('anonymous');
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, []);

  // Any request that ends the session (refresh token rejected, account deactivated) unwinds
  // the UI to the login screen from wherever it happened.
  useEffect(
    () =>
      onSessionEnded(() => {
        setUser(null);
        setStatus('anonymous');
      }),
    [],
  );

  const login = useCallback(async (employeeId: string, pin: string): Promise<void> => {
    const result = await api.auth.login({ employeeId, pin });
    setTokens(result);

    if (!isAdmin(result.user)) {
      // The credentials are valid, but this dashboard is not theirs. Drop the tokens straight
      // away instead of leaving a live driver session sitting in an admin browser.
      await api.auth.logout();
      throw new Error('This dashboard is for administrators. Drivers use the mobile app.');
    }

    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await api.auth.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
