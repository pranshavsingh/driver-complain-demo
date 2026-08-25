/**
 * Sentry bootstrap — loaded via `node --import ./src/instrument.ts` BEFORE the app,
 * so the OpenTelemetry auto-instrumentation can patch http/express as they load.
 */
import { initSentry } from './lib/sentry';

initSentry();
