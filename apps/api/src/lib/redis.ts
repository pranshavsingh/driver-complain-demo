import { logger } from './logger';

/**
 * Optional Redis client. Falls back gracefully to no-op when REDIS_URL is not
 * configured — the app degrades to in-memory caches and rate limiters (which
 * is correct for a single-instance deployment).
 *
 * Once REDIS_URL is set, this module provides a shared ioredis instance used by:
 *   - Socket.IO Redis adapter (horizontal scaling)
 *   - BullMQ job queues (background processing)
 *   - Distributed rate limiting
 *   - Shared caches (admin IDs, device tokens)
 */

let redis: any = null;
let redisAvailable = false;

const REDIS_URL = process.env.REDIS_URL?.trim();

if (REDIS_URL) {
  try {
    // Dynamic import so the app still boots if ioredis is not installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ.
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redis.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis connected');
    });

    redis.on('error', (err: Error) => {
      redisAvailable = false;
      logger.warn({ err: err.message }, 'Redis connection error — falling back to in-memory');
    });

    redis.on('close', () => {
      redisAvailable = false;
    });
  } catch {
    logger.info('ioredis not installed — Redis features disabled (npm i ioredis)');
  }
} else {
  logger.info('REDIS_URL not set — Redis features disabled');
}

export { redis, redisAvailable };

/** Create a duplicate connection (required by Socket.IO adapter which needs sub + pub). */
export function duplicateRedis(): any {
  if (!redis) return null;
  return redis.duplicate();
}

/** Graceful shutdown. */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
    redisAvailable = false;
  }
}
