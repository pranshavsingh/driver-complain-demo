import * as Sentry from '@sentry/node';
import { env } from '../config/env';

/** Sentry is only active when a DSN is configured — dev stays quiet by default. */
export const sentryEnabled = Boolean(env.SENTRY_DSN);

/**
 * Initialise Sentry. Must run before any instrumented module (http/express) loads,
 * so it is invoked from `src/instrument.ts` via `node --import`.
 */
export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    enabled: sentryEnabled,
  });
}

export { Sentry };
