import { PermissionsAndroid, Platform } from 'react-native';

/**
 * FCM push, gated so the app runs with no Firebase project at all.
 *
 * Same shape as the API's FCM/Cloudinary/Sentry gating: the feature is optional, its absence
 * is logged, and nothing else changes. Here the gate has to be a runtime one — the JS package
 * is always in the bundle, but the NATIVE module only exists in a build made with the
 * @react-native-firebase config plugins enabled (see app.config.ts), and touching a missing
 * native module throws.
 *
 * Every entry point below is therefore safe to call unconditionally. With push unavailable
 * they return null / no-op unsubscribers, and the driver still files complaints and reads
 * statuses by opening the app — push is a convenience, never the only channel. The durable
 * `Notification` rows on the server are the record of truth.
 *
 * NOT handled here: background/quit-state display. The API sends a `notification` block in
 * every push, so Android and iOS render those themselves without JS running. Only data-only
 * messages would need setBackgroundMessageHandler, and this app sends none.
 */

/** Type-only import: erased at build time, so it cannot pull the native module in. */
type MessagingApi = typeof import('@react-native-firebase/messaging');
type MessagingInstance = ReturnType<MessagingApi['getMessaging']>;

/** What this app cares about in a push. FCM data values are always strings. */
export interface PushMessage {
  title: string | null;
  body: string | null;
  complaintId: string | null;
}

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let api: MessagingApi | null | undefined;
let instance: MessagingInstance | null | undefined;

function loadApi(): MessagingApi | null {
  if (api !== undefined) return api;
  try {
    // A require, not an import: a static import runs at bundle-evaluation time, and in a build
    // without the Firebase native module that throw happens before any screen mounts and takes
    // the whole app down. Inside a try/catch it degrades to "push is off" instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = require('@react-native-firebase/messaging') as MessagingApi;
  } catch (err) {
    console.warn('Push is unavailable: @react-native-firebase/messaging did not load', err);
    api = null;
  }
  return api;
}

/**
 * The messaging instance, or null when this build has no Firebase.
 *
 * getMessaging() is what actually throws when google-services.json was not compiled in — the
 * require above can succeed and this still fail, so both are guarded.
 */
function getInstance(): MessagingInstance | null {
  if (instance !== undefined) return instance;
  const loaded = loadApi();
  if (!loaded) {
    instance = null;
    return null;
  }
  try {
    instance = loaded.getMessaging();
  } catch (err) {
    console.warn('Push is unavailable: no Firebase app is configured in this build', err);
    instance = null;
  }
  return instance;
}

/** Whether this build can do push at all. Screens use it to avoid promising what they cannot do. */
export function pushAvailable(): boolean {
  return getInstance() !== null;
}

/**
 * Ask for notification permission.
 *
 * Android 13+ needs the POST_NOTIFICATIONS runtime permission and RNFirebase's
 * requestPermission() is a no-op that reports AUTHORIZED there, so the platforms are handled
 * separately. On older Android the permission is granted at install time.
 */
export async function requestPushPermission(): Promise<boolean> {
  const messaging = getInstance();
  if (!messaging) return false;

  if (Platform.OS === 'android') {
    if (Platform.Version < 33) return true;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Notification permission request failed', err);
      return false;
    }
  }

  const loaded = loadApi();
  if (!loaded) return false;
  try {
    // Deprecated upstream in favour of expo-notifications / react-native-permissions, but it
    // is the only iOS path that does not add another dependency. Revisit if iOS ships.
    const status = await loaded.requestPermission(messaging);
    return (
      status === loaded.AuthorizationStatus.AUTHORIZED ||
      status === loaded.AuthorizationStatus.PROVISIONAL
    );
  } catch (err) {
    console.warn('Notification permission request failed', err);
    return false;
  }
}

/** This device's FCM registration token, or null if push is off or permission was refused. */
export async function getDeviceToken(): Promise<string | null> {
  const messaging = getInstance();
  const loaded = loadApi();
  if (!messaging || !loaded) return null;
  try {
    return await loaded.getToken(messaging);
  } catch (err) {
    // A device with no Play Services, or an offline first launch. Not fatal.
    console.warn('Could not get an FCM token', err);
    return null;
  }
}

/**
 * FCM rotates tokens (app restore, cache clear, ~monthly). A rotated token that is not
 * re-registered means the driver silently stops receiving updates, which looks exactly like
 * "the app is broken" — so the caller re-registers with the API on every rotation.
 */
export function onTokenRefresh(listener: (token: string) => void): () => void {
  const messaging = getInstance();
  const loaded = loadApi();
  if (!messaging || !loaded) return () => undefined;
  try {
    return loaded.onTokenRefresh(messaging, listener);
  } catch (err) {
    console.warn('Could not subscribe to FCM token refresh', err);
    return () => undefined;
  }
}

function toPushMessage(raw: {
  notification?: { title?: string; body?: string } | undefined;
  data?: Record<string, unknown> | undefined;
}): PushMessage {
  const complaintId = raw.data?.complaintId;
  return {
    title: raw.notification?.title ?? null,
    body: raw.notification?.body ?? null,
    complaintId: typeof complaintId === 'string' ? complaintId : null,
  };
}

/**
 * Messages that arrive while the app is open.
 *
 * Neither platform draws a notification for a foreground push, so if the UI ignores this the
 * driver sees nothing at all while staring at the app. The caller shows an in-app banner.
 */
export function onForegroundMessage(listener: (message: PushMessage) => void): () => void {
  const messaging = getInstance();
  const loaded = loadApi();
  if (!messaging || !loaded) return () => undefined;
  try {
    return loaded.onMessage(messaging, (raw) => {
      listener(toPushMessage(raw));
    });
  } catch (err) {
    console.warn('Could not subscribe to foreground messages', err);
    return () => undefined;
  }
}

/** A notification tapped while the app was backgrounded. */
export function onNotificationTap(listener: (message: PushMessage) => void): () => void {
  const messaging = getInstance();
  const loaded = loadApi();
  if (!messaging || !loaded) return () => undefined;
  try {
    return loaded.onNotificationOpenedApp(messaging, (raw) => {
      listener(toPushMessage(raw));
    });
  } catch (err) {
    console.warn('Could not subscribe to notification taps', err);
    return () => undefined;
  }
}

/**
 * The notification that launched the app from a fully-quit state, if any. Read once at
 * startup — calling it later returns the same message and would re-navigate unexpectedly.
 */
export async function getLaunchNotification(): Promise<PushMessage | null> {
  const messaging = getInstance();
  const loaded = loadApi();
  if (!messaging || !loaded) return null;
  try {
    const raw = await loaded.getInitialNotification(messaging);
    return raw ? toPushMessage(raw) : null;
  } catch (err) {
    console.warn('Could not read the launch notification', err);
    return null;
  }
}
