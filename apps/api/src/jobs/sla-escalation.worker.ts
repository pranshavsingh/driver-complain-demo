/**
 * SLA Escalation Worker — periodically checks for SLA-breached complaints.
 *
 * If a Site In-charge / Executive has not resolved or acted on a complaint
 * after its Category SLA target time, notifies Category Admins and SuperAdmins.
 * Repeats every 24 hours while action remains pending.
 *
 * Runs as a repeatable BullMQ job or, when Redis is unavailable, as a
 * setInterval fallback within the API process.
 */
import { createRequire } from 'node:module';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { QUEUES } from './queue';
import { checkAndEscalateSlaBreaches } from '../modules/complaints/sla-escalation.service';

const require = createRequire(import.meta.url);

/** How often to check for SLA breached complaints (every 15 minutes). */
const SLA_CHECK_INTERVAL_MS = 15 * 60 * 1000;

let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function runSlaCheck(): Promise<void> {
  try {
    const res = await checkAndEscalateSlaBreaches();
    if (res.escalatedCount > 0) {
      logger.info(res, `SLA Escalation Worker: escalated ${res.escalatedCount} breached complaint(s)`);
    }
  } catch (err) {
    logger.error({ err }, 'SLA Escalation check failed');
  }
}

/** Start the SLA escalation scheduler — BullMQ repeatable job or setInterval fallback. */
export async function startSlaEscalationScheduler(): Promise<void> {
  if (redis) {
    try {
      const { Worker, Queue } = require('bullmq');

      const worker = new Worker(
        QUEUES.SLA_ESCALATION || 'sla-escalation',
        async () => {
          await runSlaCheck();
        },
        { connection: redis, concurrency: 1 },
      );

      worker.on('failed', (_job: unknown, err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, 'SLA Escalation job failed');
      });

      const q = new Queue(QUEUES.SLA_ESCALATION || 'sla-escalation', { connection: redis });
      await q.upsertJobScheduler(
        'sla-escalation-schedule',
        { every: SLA_CHECK_INTERVAL_MS },
        { name: 'sla-escalation' },
      );

      logger.info('SLA Escalation scheduler started (BullMQ repeatable, every 15m)');
    } catch {
      logger.info('bullmq not available for SLA escalation — falling back to setInterval');
    }
  }

  // Fallback: in-process interval
  fallbackTimer = setInterval(() => {
    void runSlaCheck();
  }, SLA_CHECK_INTERVAL_MS);
  fallbackTimer.unref();

  // Run once on startup to check any overdue complaints immediately
  void runSlaCheck();
  logger.info('SLA Escalation scheduler started (setInterval fallback, every 15m)');
}

export function stopSlaEscalationScheduler(): void {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}
