import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  REFRESH_TOKEN_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  JWT_ISSUER: z.string().default('driver-complaint'),
  JWT_AUDIENCE: z.string().default('driver-complaint-api'),

  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('driver-complaint/local'),

  // Firebase Cloud Messaging — optional. Absent creds disable push (logged no-op),
  // so the app boots, tests, and runs green before a Firebase project exists.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  REDIS_URL: z.string().optional(),
  REQUIRE_REDIS_READY: z.string().optional(),
  METRICS_AUTH_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
});

export const EnvSchemaWithValidation = EnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && (!data.REDIS_URL || data.REDIS_URL.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'REDIS_URL is mandatory in production environment for horizontal clustering and Socket.IO cross-pod event propagation',
      path: ['REDIS_URL'],
    });
  }
});

const parsed = EnvSchemaWithValidation.safeParse(process.env);
if (!parsed.success) {
  console.error(`❌ Invalid environment variables:\n${parsed.error.issues.map((i) => i.message).join('\n')}`);
  throw new Error(`Invalid environment variables: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
}

export const env = parsed.data;
export type Env = typeof env;

/** CORS_ORIGINS is a comma-separated list; expose it parsed. */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
