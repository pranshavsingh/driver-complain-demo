import { Platform } from 'react-native';
import { z } from 'zod';

const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().optional(),
});

const parsed = EnvSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});

export const DEFAULT_PROD_URL = 'https://driver-complain-demo.onrender.com';

function resolveApiUrl(): string {
  const envUrl = parsed.success ? parsed.data.EXPO_PUBLIC_API_URL?.trim() : undefined;

  // 1. Explicit EXPO_PUBLIC_API_URL override if provided
  if (envUrl && envUrl.length > 0) {
    if (Platform.OS === 'android' && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return envUrl.replace(/localhost|127\.0\.0\.1/, '10.0.2.2').replace(/\/+$/, '');
    }
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Default directly to deployed Render cloud backend
  return DEFAULT_PROD_URL;
}

/** API origin, trailing slashes stripped so string concatenation is always well-formed. */
export const apiUrl = resolveApiUrl();

/** Versioned REST base, e.g. https://driver-complain-demo.onrender.com/api/v1 */
export const apiBase = `${apiUrl}/api/v1`;
