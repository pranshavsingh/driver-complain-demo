/**
 * BullMQ Queue & Worker Observability Collector.
 *
 * Exposes:
 * - sse_connect_bullmq_queue_jobs (Gauge: waiting, active, delayed, failed, completed)
 * - sse_connect_bullmq_job_duration_seconds (Histogram: execution duration by queue and status)
 */
import { bullmqQueueJobs, bullmqJobDurationSeconds } from '../lib/metrics';
import { getRegisteredQueues, QUEUES } from './queue';
import { getOutboxQueues, OUTBOX_QUEUES } from '../modules/outbox/outbox.worker';
import { logger } from '../lib/logger';

export const ALLOWED_QUEUES = new Set<string>([
  QUEUES.COMPLAINT_MEDIA,
  QUEUES.LOADING_PHOTO,
  QUEUES.TOKEN_CLEANUP,
  QUEUES.SLA_ESCALATION,
  OUTBOX_QUEUES.DISPATCH,
  OUTBOX_QUEUES.DELIVERY,
]);

/**
 * Attaches metrics listeners to a BullMQ Worker instance.
 * Does not alter worker execution or error handling logic.
 */
export function instrumentWorker(worker: any, queueName: string): void {
  if (!worker || typeof worker.on !== 'function') return;
  if (!ALLOWED_QUEUES.has(queueName)) return;

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
 * Polls existing, active BullMQ queues and updates job count gauges.
 * Tolerates uninitialized queues and Redis connection issues.
 */
export async function collectBullmqMetrics(): Promise<void> {
  const queueMap = new Map<string, any>();

  // 1. Collect from registered general queues
  try {
    const generalQueues = getRegisteredQueues();
    for (const [name, q] of generalQueues.entries()) {
      if (ALLOWED_QUEUES.has(name)) {
        queueMap.set(name, q);
      }
    }
  } catch {
    // Non-blocking
  }

  // 2. Collect from outbox queues
  try {
    const { dispatchQueue, deliveryQueue } = getOutboxQueues();
    if (dispatchQueue) queueMap.set(OUTBOX_QUEUES.DISPATCH, dispatchQueue);
    if (deliveryQueue) queueMap.set(OUTBOX_QUEUES.DELIVERY, deliveryQueue);
  } catch {
    // Non-blocking
  }

  // 3. For each active queue instance, read job counts
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
