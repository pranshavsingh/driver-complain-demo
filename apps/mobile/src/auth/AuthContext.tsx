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
import {
  clearTokens,
  getCachedUser,
  onSessionEnded,
  restoreTokens,
  setCachedUser,
  setTokens,
} from '../api/tokens';
import { refreshSession } from '../api/client';
import { unregisterThisDevice } from '../push/registration';
import { syncService } from '../sync/syncService';

const ADMIN_ROLES: Role[] = ['EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'];

/** Whether this user may use the driver app screens. */
export function isDriver(user: UserPublic | null): boolean {
  return user !== null && user.role === 'DRIVER';
}

/** Whether this user is an admin or executive who can use the mobile admin portal. */
export function isAdmin(user: UserPublic | null): boolean {
  return user !== null && ADMIN_ROLES.includes(user.role);
}

export function isSuperAdmin(user: UserPublic | null): boolean {
  return user !== null && user.role === 'SUPER_ADMIN';
}

export function isExecutive(user: UserPublic | null): boolean {
  return user !== null && user.role === 'EXECUTIVE';
}

export function isAuthorizedUser(user: UserPublic | null): boolean {
  return user !== null && (user.role === 'DRIVER' || ADMIN_ROLES.includes(user.role));
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

  // Resume the session on launch. The access token died with the process, but the refresh token
  // in the keychain mints a new one. `me()` then confirms the account is still valid.
  useEffect(() => {
    syncService.init();
    let active = true;

    const restore = async (): Promise<void> => {
      const hasStoredSession = await restoreTokens();
      if (!hasStoredSession) {
        if (active) setStatus('anonymous');
        return;
      }
      const cached = await getCachedUser();
      const refreshed = await refreshSession();
      if (!refreshed) {
        if (cached && isAuthorizedUser(cached)) {
          if (!active) return;
          setUser(cached);
          setStatus('authenticated');
          syncService.setActiveUser(cached);
          return;
        }
        if (active) setStatus('anonymous');
        return;
      }
      try {
        const me = await api.users.me();
        if (!active) return;
        await setCachedUser(me);
        setUser(me);
        const authorized = isAuthorizedUser(me);
        setStatus(authorized ? 'authenticated' : 'anonymous');
        if (authorized) {
          syncService.setActiveUser(me);
        } else {
          syncService.setActiveUser(null);
        }
      } catch {
        if (cached && isAuthorizedUser(cached)) {
          if (!active) return;
          setUser(cached);
          setStatus('authenticated');
          syncService.setActiveUser(cached);
          return;
        }
        if (active) setStatus('anonymous');
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, []);

  // Any request that ends the session unwinds the UI to the login screen.
  useEffect(
    () =>
      onSessionEnded(() => {
        syncService.setActiveUser(null);
        setUser(null);
        setStatus('anonymous');
      }),
    [],
  );

  const login = useCallback(async (employeeId: string, pin: string): Promise<void> => {
    const result = await api.auth.login({ employeeId, pin });
    await setTokens(result);
    await setCachedUser(result.user);

    if (!isAuthorizedUser(result.user)) {
      await api.auth.logout();
      throw new Error('You do not have permission to access this application.');
    }

    setUser(result.user);
    syncService.setActiveUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    syncService.setActiveUser(null);
    // De-register the push token BEFORE revoking the session — the DELETE needs a valid access
    // token. Both calls are best-effort and neither can trap the driver in a session.
    await unregisterThisDevice();
    await api.auth.logout();
    await clearTokens();
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
