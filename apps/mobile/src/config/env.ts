import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { z } from 'zod';

const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().optional(),
});

const parsed = EnvSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});

function resolveApiUrl(): string {
  const envUrl = parsed.success ? parsed.data.EXPO_PUBLIC_API_URL?.trim() : undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/+$/, '');
  }

  // Fallback for Expo development on device / emulator
  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
    if (hostUri) {
      const host = hostUri.split(':')[0];
      if (host) return `http://${host}:4000`;
    }

    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:4000';
    }
  }

  return 'http://localhost:4000';
}

/** API origin, trailing slashes stripped so string concatenation is always well-formed. */
export const apiUrl = resolveApiUrl();

/** Versioned REST base, e.g. http://192.168.1.27:4000/api/v1 */
export const apiBase = `${apiUrl}/api/v1`;

