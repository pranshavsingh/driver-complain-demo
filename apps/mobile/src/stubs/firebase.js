/**
 * Stub for @react-native-firebase packages under Expo Go.
 *
 * RNFirebase packages require custom native C++/Java modules (RNFBAppModule)
 * that are absent in Expo Go. This stub allows the app to load cleanly under Expo Go
 * by returning no-op firebase/messaging methods.
 */
export function getMessaging() {
  return null;
}
export const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};
export async function requestPermission() {
  return AuthorizationStatus.DENIED;
}
export async function getToken() {
  return null;
}
export function onTokenRefresh() {
  return () => {};
}
export function onMessage() {
  return () => {};
}
export function onNotificationOpenedApp() {
  return () => {};
}
export async function getInitialNotification() {
  return null;
}

export default function firebase() {
  return {
    messaging: () => null,
  };
}
