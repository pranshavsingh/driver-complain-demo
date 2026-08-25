import { pino } from 'pino';
import { env } from '../config/env';

/**
 * Base logger. JSON in all environments (pipe through `pino-pretty` in dev if desired).
 * Secrets are redacted defensively — PINs and auth headers must never reach logs.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'pin',
      '*.pin',
      'pinHash',
      '*.pinHash',
      'refreshToken',
      '*.refreshToken',
    ],
    remove: true,
  },
});
