import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@driver-complaint/shared-types';

/**
 * Token storage for the driver's session.
 *
 * The ACCESS token is kept in memory only. Killing the app drops it, which is harmless —
 * the refresh token mints a new one on the next launch.
 *
 * The REFRESH token goes to expo-secure-store: Android Keystore / iOS Keychain, encrypted at
 * rest and unreadable by other apps. This is the reason a driver logs in once and not every
 * morning, and it is a materially better place for it than the dashboard's localStorage.
 *
 * A phone is shared, lost and stolen far more often than a desk PC, so `clearSession()` on
 * logout removes the stored token rather than only forgetting it in memory.
 */
const REFRESH_KEY = 'dc.refreshToken';

let accessToken: string | null = null;
/**
 * Mirror of the stored refresh token. SecureStore is async, but the request path needs the
 * token synchronously when it decides whether a 401 is worth retrying — so it is read once
 * at startup (`restoreTokens`) and kept here afterwards.
 */
let refreshToken: string | null = null;

type Listener = () => void;
const sessionEndedListeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/**
 * Load the stored refresh token into memory. Call once, before anything else touches the API.
 * Returns whether there is a session worth trying to resume.
 */
export async function restoreTokens(): Promise<boolean> {
  try {
    refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    // Keystore/Keychain can fail on a device with a broken secure-hardware state, or after a
    // restore-from-backup. Treating that as "no session" costs one login; crashing on launch
    // would leave the driver with an app that never opens.
    refreshToken = null;
  }
  return refreshToken !== null;
}

export async function setTokens(tokens: AuthTokens): Promise<void> {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  try {
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  } catch {
    // Memory-only session: works until the app is killed, then the driver logs in again.
  }
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    // Nothing recoverable — the in-memory copies are already gone.
  }
}

/**
 * Subscribe to "the session is over" — the refresh token is missing, expired, or was
 * rejected. AuthProvider uses this to drop back to the login screen from anywhere, including
 * from inside a request that failed three components deep.
 */
export function onSessionEnded(listener: Listener): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/**
 * End the session and tell the UI. Idempotent — several failure paths call it.
 *
 * Synchronous on purpose: it is called from inside the fetch wrapper, which must not wait on
 * the Keystore to decide what to return. The in-memory tokens are dropped immediately, so no
 * further request can carry them; the stored copy is deleted in the background.
 */
export function notifySessionEnded(): void {
  accessToken = null;
  refreshToken = null;
  void SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {
    // See clearTokens.
  });
  for (const listener of sessionEndedListeners) listener();
}
