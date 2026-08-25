import { z } from 'zod';

/**
 * Client configuration.
 *
 * Every EXPO_PUBLIC_ variable is inlined into the JavaScript bundle at build time and is
 * therefore PUBLIC — readable by anyone who unzips the APK. Nothing secret belongs here;
 * see .env.example.
 *
 * Validated at module load so a misconfigured build fails on the first screen with a clear
 * message, instead of firing requests at `undefined/api/v1` and showing a driver a spinner
 * that never ends.
 */
const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
});

// Read as a literal member expression: Metro only substitutes `process.env.EXPO_PUBLIC_X`
// when it appears exactly like this. Handing the whole `process.env` object to zod would
// parse an empty object in a release build.
const parsed = EnvSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});

if (!parsed.success) {
  throw new Error(`Invalid mobile environment:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
}

/** API origin, trailing slashes stripped so string concatenation is always well-formed. */
export const apiUrl = parsed.data.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');

/** Versioned REST base, e.g. http://192.168.1.20:4000/api/v1 */
export const apiBase = `${apiUrl}/api/v1`;
