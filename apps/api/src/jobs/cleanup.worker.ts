/**
 * Cleanup worker — handles periodic maintenance tasks:
 *   1. Prune expired / revoked refresh tokens
 *   2. Clear stale device tokens (older than 90 days without use)
 *
 * Runs as a repeatable BullMQ job or, when Redis is unavailable, as a
 * setInterval fallback within the API process.
 */
import { createRequire } from 'node:module';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { QUEUES } from './queue';

const require = createRequire(import.meta.url);

/** How often to run cleanup (every 6 hours). */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Delete revoked/expired tokens older than this. */
const TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Device tokens unused for this long are stale. */
const DEVICE_STALE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function runCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - TOKEN_RETENTION_MS);
  const deviceCutoff = new Date(Date.now() - DEVICE_STALE_MS);

  try {
    // 1. Prune expired refresh tokens.
    const { count: expiredCount } = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { revokedAt: { not: null, lt: cutoff } },
        ],
      },
    });

    // 2. Prune stale device tokens (unused for 90 days).
    const { count: deviceCount } = await prisma.deviceToken.deleteMany({
      where: { lastUsedAt: { lt: deviceCutoff } },
    });

    if (expiredCount > 0 || deviceCount > 0) {
      logger.info(
        { expiredTokens: expiredCount, staleDevices: deviceCount },
        'Cleanup: pruned expired tokens and stale devices',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Cleanup task failed');
  }
}

/** Start the cleanup scheduler — BullMQ repeatable job or setInterval fallback. */
export async function startCleanupScheduler(): Promise<void> {
  if (redis) {
    try {
      const { Worker, Queue } = require('bullmq');

      const worker = new Worker(
        QUEUES.TOKEN_CLEANUP,
        async () => {
          await runCleanup();
        },
        { connection: redis, concurrency: 1 },
      );

      worker.on('failed', (_job: unknown, err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, 'Cleanup job failed');
      });

      // Schedule a repeating job.
      const q = new Queue(QUEUES.TOKEN_CLEANUP, { connection: redis });
      await q.upsertJobScheduler(
        'cleanup-schedule',
        { every: CLEANUP_INTERVAL_MS },
        { name: 'cleanup' },
      );

      logger.info('Cleanup scheduler started (BullMQ repeatable, every 6h)');
      return;
    } catch {
      logger.info('bullmq not available for cleanup — falling back to setInterval');
    }
  }

  // Fallback: in-process interval.
  fallbackTimer = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);
  fallbackTimer.unref();

  // Run once on startup to clear any backlog.
  void runCleanup();
  logger.info('Cleanup scheduler started (setInterval fallback, every 6h)');
}

export function stopCleanupScheduler(): void {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}
