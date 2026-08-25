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
import type { UserPublic } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { onSessionEnded, restoreTokens, setTokens } from '../api/tokens';
import { refreshSession } from '../api/client';
import { unregisterThisDevice } from '../push/registration';

/** Whether this user may use the driver app at all. */
export function isDriver(user: UserPublic | null): boolean {
  return user !== null && user.role === 'DRIVER';
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
  // in the keychain mints a new one — this is what stops a driver re-entering their PIN every
  // morning. `me()` then confirms the account is still valid: a driver who left the company
  // overnight must not get a working app from a stored token.
  useEffect(() => {
    let active = true;

    const restore = async (): Promise<void> => {
      const hasStoredSession = await restoreTokens();
      if (!hasStoredSession) {
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
        setStatus(isDriver(me) ? 'authenticated' : 'anonymous');
      } catch {
        // Offline on launch ends up here too. Showing the login screen is the honest outcome:
        // there is no cached complaint data to show, so pretending to be signed in would only
        // produce a home screen full of errors. Offline support is not in this MVP.
        if (active) setStatus('anonymous');
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, []);

  // Any request that ends the session (refresh token rejected, account deactivated) unwinds the
  // UI to the login screen from wherever it happened.
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
    await setTokens(result);

    if (!isDriver(result.user)) {
      // The credentials are valid, but this app is not theirs. Drop the tokens immediately
      // rather than leaving a live admin session sitting on a phone in a vehicle.
      await api.auth.logout();
      throw new Error('This app is for drivers. Administrators use the web dashboard.');
    }

    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // De-register the push token BEFORE revoking the session — the DELETE needs a valid access
    // token. Both calls are best-effort and neither can trap the driver in a session.
    await unregisterThisDevice();
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
