import { createRequire } from 'node:module';
import { logger } from './logger';

const require = createRequire(import.meta.url);

export interface RedisLike {
  on(event: string, fn: (...args: unknown[]) => void): void;
  duplicate(): RedisLike;
  quit(): Promise<void>;
  [key: string]: unknown;
}

let redis: RedisLike | null = null;
let redisAvailable = false;

const REDIS_URL = process.env.REDIS_URL?.trim();

if (REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ.
      enableReadyCheck: true,
      lazyConnect: false,
    }) as RedisLike;

    redis.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis connected');
    });

    redis.on('error', (err: unknown) => {
      redisAvailable = false;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, 'Redis connection error — falling back to in-memory');
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
export function duplicateRedis(): RedisLike | null {
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
