import { createRequire } from 'node:module';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';

const require = createRequire(import.meta.url);

/** Queue names. */
export const QUEUES = {
  COMPLAINT_MEDIA: 'complaint-media',
  LOADING_PHOTO: 'loading-photo',
  TOKEN_CLEANUP: 'token-cleanup',
} as const;

export interface GenericQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
  close(): Promise<void>;
}

const queues = new Map<string, GenericQueue>();

/** Lazily create / reuse a named queue. Returns null when Redis is unavailable. */
async function getQueue(name: string): Promise<GenericQueue | null> {
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

// ────────────────────────────── Enqueue helpers ──────────────────────────────

/**
 * Enqueue a complaint media processing job.
 * @returns `true` if enqueued successfully; `false` if Redis is unavailable.
 */
export async function enqueueComplaintMedia(
  job: ComplaintMediaJob,
): Promise<boolean> {
  const q = await getQueue(QUEUES.COMPLAINT_MEDIA);
  if (!q) return false;

  const priorityWeight: Record<string, number> = {
    URGENT: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4,
  };

  await q.add('process', job, {
    priority: priorityWeight[job.priority] ?? 3,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });

  logger.info(
    { complaintId: job.complaintId, priority: job.priority },
    'Complaint media job enqueued',
  );
  return true;
}

/**
 * Enqueue a loading photo upload job.
 * @returns `true` if enqueued; `false` if Redis is unavailable.
 */
export async function enqueueLoadingPhoto(
  job: LoadingPhotoJob,
): Promise<boolean> {
  const q = await getQueue(QUEUES.LOADING_PHOTO);
  if (!q) return false;

  await q.add('upload', job, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return true;
}

/**
 * Schedule a one-off token cleanup job (called from the cleanup cron).
 */
export async function enqueueTokenCleanup(): Promise<boolean> {
  const q = await getQueue(QUEUES.TOKEN_CLEANUP);
  if (!q) return false;

  await q.add('cleanup', {}, { removeOnComplete: 5, removeOnFail: 10 });
  return true;
}

// ────────────────────────────── Shutdown ──────────────────────────────

export async function closeQueues(): Promise<void> {
  for (const q of queues.values()) {
    await q.close().catch(() => {});
  }
  queues.clear();
}
