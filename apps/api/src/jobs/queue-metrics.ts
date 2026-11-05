/**
 * BullMQ Queue & Worker Observability Collector.
 *
 * Exposes:
 * - sse_connect_bullmq_queue_jobs (Gauge: waiting, active, delayed, failed, completed)
 * - sse_connect_bullmq_job_duration_seconds (Histogram: execution duration by queue and status)
 *
 * Queue Visibility Architecture:
 * - Queues are governed by a canonical allowlist (`QUEUES`).
 * - To ensure queues existing in Redis are immediately visible even before the first application
 *   enqueue event, `collectBullmqMetrics` checks and registers allowlisted queues via the
 *   internal singleton cache in `getQueue()`.
 * - This guarantees that singleton queue instances are reused without instantiating duplicates.
 * - Any arbitrary queue existing in Redis outside the application domain is strictly ignored
 *   to maintain bounded label cardinality and protect Prometheus.
 */
import { bullmqQueueJobs, bullmqJobDurationSeconds } from '../lib/metrics';
import { getRegisteredQueues, getQueue, QUEUES } from './queue';
import { isRedisAvailable } from '../lib/redis';
import { logger } from '../lib/logger';

export const ALLOWED_QUEUES = new Set<string>([
  QUEUES.COMPLAINT_MEDIA,
  QUEUES.LOADING_PHOTO,
  QUEUES.TOKEN_CLEANUP,
  QUEUES.SLA_ESCALATION,
  QUEUES.OUTBOX_DISPATCH,
  QUEUES.OUTBOX_DELIVERY,
]);

const instrumentedWorkers = new WeakSet<object>();

/**
 * Attaches metrics listeners to a BullMQ Worker instance.
 * Strictly idempotent: guarantees listeners are attached once only per worker instance.
 * Does not alter worker execution or error handling logic.
 */
export function instrumentWorker(worker: any, queueName: string): void {
  if (!worker || typeof worker.on !== 'function') return;
  if (!ALLOWED_QUEUES.has(queueName)) return;

  if (typeof worker === 'object') {
    if (instrumentedWorkers.has(worker)) {
      return;
    }
    instrumentedWorkers.add(worker);
  }

  worker.on('completed', (job: any) => {
    try {
      if (job && typeof job.processedOn === 'number') {
        const finishedOn = job.finishedOn || Date.now();
        const durationSec = Math.max(0, (finishedOn - job.processedOn) / 1000);
        bullmqJobDurationSeconds.observe({ queue: queueName, status: 'completed' }, durationSec);
      }
    } catch {
      // Safe non-blocking metrics observation
    }
  });

  worker.on('failed', (job: any) => {
    try {
      if (job && typeof job.processedOn === 'number') {
        const finishedOn = job.finishedOn || Date.now();
        const durationSec = Math.max(0, (finishedOn - job.processedOn) / 1000);
        bullmqJobDurationSeconds.observe({ queue: queueName, status: 'failed' }, durationSec);
      }
    } catch {
      // Safe non-blocking metrics observation
    }
  });
}

/**
 * Polls active BullMQ queues and updates job count gauges.
 * Ensures allowlisted queues in Redis are visible without creating duplicate instances.
 * Tolerates uninitialized queues and Redis connection issues.
 */
export async function collectBullmqMetrics(): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  const queueMap = new Map<string, any>();

  // 1. Ensure general allowlisted queues are registered (reuses singleton instances in queue.ts)
  const generalQueueNames = [
    QUEUES.COMPLAINT_MEDIA,
    QUEUES.LOADING_PHOTO,
    QUEUES.TOKEN_CLEANUP,
    QUEUES.SLA_ESCALATION,
  ];

  for (const name of generalQueueNames) {
    try {
      const q = await getQueue(name);
      if (q) queueMap.set(name, q);
    } catch {
      // Non-blocking
    }
  }

  // 2. Collect from already registered queues
  try {
    const registered = getRegisteredQueues();
    for (const [name, q] of registered.entries()) {
      if (ALLOWED_QUEUES.has(name)) {
        queueMap.set(name, q);
      }
    }
  } catch {
    // Non-blocking
  }

  // 3. Dynamically collect from outbox queues (avoids circular module dependencies)
  try {
    const { getOutboxQueues } = await import('../modules/outbox/outbox.worker');
    const { dispatchQueue, deliveryQueue } = getOutboxQueues();
    if (dispatchQueue) queueMap.set(QUEUES.OUTBOX_DISPATCH, dispatchQueue);
    if (deliveryQueue) queueMap.set(QUEUES.OUTBOX_DELIVERY, deliveryQueue);
  } catch {
    // Non-blocking
  }

  // 4. For each active queue instance, read job counts
  for (const [queueName, queue] of queueMap.entries()) {
    if (!queue || typeof queue.getJobCounts !== 'function') continue;

    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );

      bullmqQueueJobs.set({ queue: queueName, status: 'waiting' }, counts.waiting || 0);
      bullmqQueueJobs.set({ queue: queueName, status: 'active' }, counts.active || 0);
      bullmqQueueJobs.set({ queue: queueName, status: 'delayed' }, counts.delayed || 0);
      bullmqQueueJobs.set({ queue: queueName, status: 'failed' }, counts.failed || 0);
      bullmqQueueJobs.set({ queue: queueName, status: 'completed' }, counts.completed || 0);
    } catch (err) {
      logger.debug({ err, queueName }, 'Safe non-blocking error fetching queue counts');
    }
  }
}
