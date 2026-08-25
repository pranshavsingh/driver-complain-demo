import { z } from 'zod';

/**
 * Browser-side configuration.
 *
 * Every VITE_ variable is inlined into the JavaScript bundle at build time and is therefore
 * PUBLIC. Nothing secret belongs here — see .env.example.
 *
 * Validated at module load so a misconfigured deploy fails immediately and visibly, rather
 * than producing `fetch('undefined/api/v1/complaints')` on the first click.
 */
const EnvSchema = z.object({
  VITE_API_URL: z.url().default('http://localhost:4000'),
});

const parsed = EnvSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid admin-web environment:\n${parsed.error.issues.map((i) => i.message).join('\n')}`);
}

/** API origin, trailing slashes stripped so string concatenation is always well-formed. */
export const apiUrl = parsed.data.VITE_API_URL.replace(/\/+$/, '');

/** Versioned REST base, e.g. http://localhost:4000/api/v1 */
export const apiBase = `${apiUrl}/api/v1`;
