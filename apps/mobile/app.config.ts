import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic layer over app.json.
 *
 * Everything static lives in app.json (so `expo install` and `expo prebuild` can keep editing
 * it). This file adds the one thing that cannot be static: the React Native Firebase config
 * plugins, which hard-fail a prebuild when the Google credential files are missing.
 *
 * The credentials are pointed at by env vars rather than assumed to be at a fixed path:
 *   GOOGLE_SERVICES_JSON=./google-services.json          (Android)
 *   GOOGLE_SERVICES_PLIST=./GoogleService-Info.plist     (iOS)
 *
 * That is the same convention EAS uses for file-type secrets (the secret is exposed to the
 * build as an env var holding a path), so local and cloud builds are configured identically.
 * With neither set, the Firebase plugins are left out and the app builds, bundles and runs
 * with push disabled — matching how the API treats FCM, Cloudinary and Sentry. See
 * src/push/messaging.ts for the runtime half of the same gate.
 *
 * These files are NOT secrets in the credential sense (they ship inside the app binary), but
 * they are project-specific and stay out of git — see .gitignore.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  // EXPO_PUBLIC_ variables are inlined into the JS bundle at build time, so a build started
  // without one produces an app that can never reach the API — and the driver finds out, not
  // us. Fail the EAS build here instead. Local `expo start` is exempt: src/config/env.ts
  // defaults to localhost, which is what a developer wants.
  if (process.env.EAS_BUILD === 'true' && !process.env.EXPO_PUBLIC_API_URL) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set for this EAS build. Set it as an EAS environment ' +
        'variable on the build profile (see README) — the app cannot reach the API without it.',
    );
  }

  const androidCredential = process.env.GOOGLE_SERVICES_JSON;
  const iosCredential = process.env.GOOGLE_SERVICES_PLIST;
  const pushConfigured = Boolean(androidCredential ?? iosCredential);

  // ConfigContext hands us app.json's `expo` object, but types it as possibly-incomplete
  // because a config file may also be the only source. name/slug are in app.json, so the
  // fallbacks below are for the type checker rather than a real code path.
  const base: ExpoConfig = {
    ...config,
    name: config.name ?? 'Driver Complaint',
    slug: config.slug ?? 'driver-complaint',
  };

  if (!pushConfigured) return base;

  return {
    ...base,
    android: {
      ...base.android,
      ...(androidCredential ? { googleServicesFile: androidCredential } : {}),
    },
    ios: {
      ...base.ios,
      ...(iosCredential ? { googleServicesFile: iosCredential } : {}),
    },
    plugins: [
      ...(base.plugins ?? []),
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
    ],
  };
};
