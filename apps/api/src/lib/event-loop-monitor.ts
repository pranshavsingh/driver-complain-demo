import { monitorEventLoopDelay } from 'node:perf_hooks';
import { logger } from './logger';

/**
 * Event-loop lag monitor using Node.js built-in perf_hooks.
 *
 * Logs a warning when the event-loop delay exceeds a threshold, which is the
 * earliest sign that CPU-heavy work (bcrypt, JSON serialization, etc.) is
 * starving I/O callbacks.
 */

const WARN_THRESHOLD_MS = 100;
const LOG_INTERVAL_MS = 30_000; // report every 30 seconds

let histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
let logTimer: ReturnType<typeof setInterval> | null = null;

export function startEventLoopMonitor(): void {
  if (histogram) return; // already running

  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  logTimer = setInterval(() => {
    if (!histogram) return;

    const p50 = histogram.percentile(50) / 1e6; // ns → ms
    const p99 = histogram.percentile(99) / 1e6;
    const max = histogram.max / 1e6;

    if (p99 > WARN_THRESHOLD_MS) {
      logger.warn(
        { p50: p50.toFixed(1), p99: p99.toFixed(1), max: max.toFixed(1) },
        'Event-loop delay elevated (p99 > 100 ms) — Node.js may be CPU-bound',
      );
    } else {
      logger.debug(
        { p50: p50.toFixed(1), p99: p99.toFixed(1), max: max.toFixed(1) },
        'Event-loop delay',
      );
    }

    histogram.reset();
  }, LOG_INTERVAL_MS);

  logTimer.unref(); // Don't keep process alive.
  logger.info('Event-loop delay monitor started');
}

export function stopEventLoopMonitor(): void {
  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
}
