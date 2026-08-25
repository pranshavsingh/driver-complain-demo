import type { AuthTokens } from '@driver-complaint/shared-types';

/**
 * Token storage for the dashboard session.
 *
 * The ACCESS token is kept in memory only. A page reload drops it, which is harmless because
 * the refresh token mints a new one.
 *
 * The REFRESH token is kept in localStorage. This is a deliberate, documented tradeoff:
 * it survives a reload (otherwise an admin re-enters their PIN every time they hit F5), but
 * it is readable by any JavaScript running on this origin, so a successful XSS yields a
 * long-lived session. Accepted for the MVP.
 *
 * The real fix is for the API to set an httpOnly, Secure, SameSite=Strict refresh cookie,
 * which JavaScript cannot read at all. That needs API-side cookie parsing plus CSRF
 * protection, so it is tracked as follow-up work rather than half-implemented here.
 */
const REFRESH_KEY = 'dc.refreshToken';

let accessToken: string | null = null;

type Listener = () => void;
const sessionEndedListeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    // Storage can throw in private-browsing modes or when disabled by policy. Degrading to
    // a memory-only session is better than a dashboard that refuses to load at all.
    return null;
  }
}

export function setTokens(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  try {
    window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  } catch {
    // See getRefreshToken: memory-only session, cleared on reload.
  }
}

export function clearTokens(): void {
  accessToken = null;
  try {
    window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Subscribe to "the session is over" — the refresh token is missing, expired, or was
 * rejected. AuthProvider uses this to drop back to the login screen from anywhere, including
 * from inside a fetch that failed three components deep.
 */
export function onSessionEnded(listener: Listener): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/** Clear the session and tell the UI. Idempotent — safe to call from several failure paths. */
export function notifySessionEnded(): void {
  clearTokens();
  for (const listener of sessionEndedListeners) listener();
}
