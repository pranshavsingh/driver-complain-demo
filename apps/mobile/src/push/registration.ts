import { Platform } from 'react-native';
import * as api from '../api/endpoints';
import { getDeviceToken, onTokenRefresh, pushAvailable, requestPushPermission } from './messaging';

/**
 * Device-token lifecycle: get this phone's FCM token and tell the API about it, so a status
 * change can reach the driver when the app is closed.
 *
 * The token this device last registered is remembered here so logout can de-register it. That
 * matters on a shared or handed-back phone: without it, the next holder keeps receiving pushes
 * about the previous driver's complaints, which is a data leak, not just noise.
 */
let registeredToken: string | null = null;

export function getRegisteredToken(): string | null {
  return registeredToken;
}

async function sendToken(token: string): Promise<void> {
  await api.notifications.registerDevice({
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  });
  registeredToken = token;
}

/**
 * Ask for permission, then register the token. Best-effort: a driver who declines notifications
 * still has a fully working app, so nothing here is allowed to throw into the UI.
 *
 * Safe to call on every launch — the API upserts on the token.
 */
export async function registerThisDevice(): Promise<void> {
  if (!pushAvailable()) return;
  try {
    const granted = await requestPushPermission();
    if (!granted) return;
    const token = await getDeviceToken();
    if (!token || token === registeredToken) return;
    await sendToken(token);
  } catch (err) {
    console.warn('Could not register this device for push', err);
  }
}

/**
 * Re-register when FCM rotates the token. FCM does this on restore-from-backup, cache clear and
 * periodically; a rotation that is not reported leaves the driver silently un-notified, which is
 * indistinguishable from the app being broken.
 */
export function watchTokenRefresh(): () => void {
  return onTokenRefresh((token) => {
    void sendToken(token).catch((err: unknown) => {
      console.warn('Could not re-register a refreshed push token', err);
    });
  });
}

/** Drop this device's registration server-side. Called on logout, best-effort. */
export async function unregisterThisDevice(): Promise<void> {
  const token = registeredToken;
  if (!token) return;
  // Cleared first: even if the network call fails, this app instance must stop claiming the
  // registration is live, or the next login would skip re-registering it.
  registeredToken = null;
  try {
    await api.notifications.unregisterDevice(token);
  } catch (err) {
    // The token row is left behind on the server. It will be pruned the first time FCM reports
    // it as unregistered (see the API's DEAD_TOKEN_CODES handling).
    console.warn('Could not de-register this device for push', err);
  }
}
