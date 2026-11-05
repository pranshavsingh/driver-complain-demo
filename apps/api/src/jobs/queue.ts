import { createRequire } from 'node:module';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';

const require = createRequire(import.meta.url);

/** Queue names. */
export const QUEUES = {
  COMPLAINT_MEDIA: 'complaint-media',
  LOADING_PHOTO: 'loading-photo',
  TOKEN_CLEANUP: 'token-cleanup',
  SLA_ESCALATION: 'sla-escalation',
  OUTBOX_DISPATCH: 'outbox-dispatch',
  OUTBOX_DELIVERY: 'outbox-delivery',
} as const;

export interface GenericQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
  close(): Promise<void>;
  getJobCounts?(...types: string[]): Promise<Record<string, number>>;
}

const queues = new Map<string, GenericQueue>();

/** Access all currently registered queue instances for metrics collection. */
export function getRegisteredQueues(): Map<string, GenericQueue> {
  return queues;
}

/** Lazily create / reuse a named queue. Returns null when Redis is unavailable. */
export async function getQueue(name: string): Promise<GenericQueue | null> {
  if (!redis) return null;

  const existing = queues.get(name);
  if (existing) return existing;

  try {
    const { Queue } = require('bullmq');
    const q = new Queue(name, { connection: redis }) as GenericQueue;
    queues.set(name, q);
    return q;
  } catch {
    logger.info('bullmq not installed — job queue disabled (npm i bullmq)');
    return null;
  }
}

// ────────────────────────────── Job payloads ──────────────────────────────

export interface ComplaintMediaJob {
  complaintId: string;
  driverUserId: string;
  /** Base64-encoded file buffers keyed by attachment kind. */
  files: Record<string, { base64: string; originalName?: string }>;
  priority: string;
}

export interface LoadingPhotoJob {
  loadingRecordId: string;
  stage: 'reached' | 'completed' | 'trip-completed';
  fileBase64: string;
  folder: string;
}

// ────────────────────────────── Producer helpers ──────────────────────────

/**
 * Enqueue a complaint media processing job.
 * Jobs with priority === 'URGENT' are placed at the front of the queue (priority: 1).
 */
export async function enqueueComplaintMedia(data: ComplaintMediaJob): Promise<boolean> {
  const q = await getQueue(QUEUES.COMPLAINT_MEDIA);
  if (!q) {
    logger.info({ complaintId: data.complaintId }, 'Redis not available — falling back to inline media upload');
    return false;
  }

  // DSA: Priority Queue — lower priority number = higher priority in BullMQ.
  const priority = data.priority === 'URGENT' ? 1 : 10;

  await q.add('process-media', data, {
    priority,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100, // Keep last 100 completed jobs for debugging.
    removeOnFail: 500,     // Keep failed jobs for inspection.
  });

  logger.info({ complaintId: data.complaintId, priority }, 'Enqueued complaint media job');
  return true;
}

/** Enqueue a loading milestone photo upload. */
export async function enqueueLoadingPhoto(data: LoadingPhotoJob): Promise<boolean> {
  const q = await getQueue(QUEUES.LOADING_PHOTO);
  if (!q) return false;

  await q.add('process-photo', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  });

  logger.info({ loadingRecordId: data.loadingRecordId, stage: data.stage }, 'Enqueued loading photo job');
  return true;
}

/** Close all queue connections on graceful shutdown. */
export async function closeQueues(): Promise<void> {
  for (const [name, q] of queues.entries()) {
    try {
      await q.close();
    } catch (err) {
      logger.warn({ err, queue: name }, 'Error closing queue');
    }
  }
  queues.clear();
}
