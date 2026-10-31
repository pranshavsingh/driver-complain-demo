import { Redis, type RedisOptions } from 'ioredis';
import { logger } from './logger';

export type RedisStatus =
  | 'HEALTHY'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'UNAVAILABLE'
  | 'DISCONNECTED'
  | 'NOT_CONFIGURED';

let redis: Redis | null = null;
let redisAvailable = false;
let currentStatus: RedisStatus = 'NOT_CONFIGURED';

const trackedClients = new Set<Redis>();

const REDIS_URL = process.env.REDIS_URL?.trim();

export const defaultRedisOptions: RedisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ & atomic operations
  enableReadyCheck: true,
  lazyConnect: false,
  connectTimeout: 5000,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  reconnectOnError(err) {
    if (err.message.includes('READONLY')) {
      return true; // Reconnect when master failover occurs
    }
    return false;
  },
};

export function createRedisClient(url?: string, options?: RedisOptions): Redis {
  const targetUrl = url || REDIS_URL;
  if (!targetUrl) {
    throw new Error('Redis URL is required to create a Redis client');
  }

  const client = new Redis(targetUrl, {
    ...defaultRedisOptions,
    ...options,
  });

  trackedClients.add(client);

  client.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, 'Redis client connection error');
  });

  client.on('close', () => {
    trackedClients.delete(client);
  });

  return client;
}

if (REDIS_URL) {
  try {
    currentStatus = 'CONNECTING';
    redis = new Redis(REDIS_URL, defaultRedisOptions);
    trackedClients.add(redis);

    redis.on('connect', () => {
      currentStatus = 'CONNECTING';
      logger.info('Redis socket connected');
    });

    redis.on('ready', () => {
      redisAvailable = true;
      currentStatus = 'HEALTHY';
      logger.info('Redis client ready');
    });

    redis.on('reconnecting', () => {
      redisAvailable = false;
      currentStatus = 'RECONNECTING';
      logger.warn('Redis client reconnecting');
    });

    redis.on('error', (err: unknown) => {
      redisAvailable = false;
      currentStatus = 'UNAVAILABLE';
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, 'Redis error encountered');
    });

    redis.on('close', () => {
      redisAvailable = false;
      if (currentStatus !== 'UNAVAILABLE') {
        currentStatus = 'DISCONNECTED';
      }
    });

    redis.on('end', () => {
      redisAvailable = false;
      currentStatus = 'DISCONNECTED';
      logger.info('Redis connection closed');
    });
  } catch (err) {
    currentStatus = 'UNAVAILABLE';
    logger.error({ err }, 'Failed to initialize Redis client');
  }
} else {
  if (process.env.NODE_ENV === 'production') {
    currentStatus = 'UNAVAILABLE';
    logger.error('REDIS_URL not configured in production environment');
  } else {
    currentStatus = 'NOT_CONFIGURED';
    logger.info('REDIS_URL not set — Redis features disabled (in-memory mode)');
  }
}

export { redis, redisAvailable };

export function getRedisStatus(): RedisStatus {
  return currentStatus;
}

export function isRedisAvailable(): boolean {
  return redisAvailable && currentStatus === 'HEALTHY';
}

/** Create a duplicate connection (required by Socket.IO adapter which needs sub + pub). */
export function duplicateRedis(): Redis | null {
  if (!redis) return null;
  try {
    const dup = redis.duplicate();
    trackedClients.add(dup);

    dup.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, 'Redis duplicate client error');
    });

    dup.on('close', () => {
      trackedClients.delete(dup);
    });

    return dup;
  } catch (err) {
    logger.error({ err }, 'Failed to duplicate Redis client');
    return null;
  }
}

/** Check Redis reachability with ping and timeout (for /health/readiness). */
export async function pingRedis(timeoutMs = 2000): Promise<{
  status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';
  latencyMs?: number;
  error?: string;
}> {
  if (!redis || currentStatus === 'NOT_CONFIGURED') {
    return { status: 'NOT_CONFIGURED' };
  }

  const start = Date.now();
  try {
    const pingPromise = redis.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Redis ping timed out after ${timeoutMs}ms`)), timeoutMs).unref(),
    );

    const pong = await Promise.race([pingPromise, timeoutPromise]);
    if (pong === 'PONG') {
      return { status: 'CONNECTED', latencyMs: Date.now() - start };
    }
    return { status: 'DISCONNECTED', error: `Unexpected ping response: ${pong}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'DISCONNECTED', error: msg };
  }
}

/** Graceful shutdown of all tracked Redis clients. */
export async function closeRedis(): Promise<void> {
  const clientsToClose = Array.from(trackedClients);
  trackedClients.clear();

  const closePromises = clientsToClose.map(async (client) => {
    try {
      if (client.status === 'ready' || client.status === 'connecting') {
        await client.quit();
      } else {
        client.disconnect();
      }
    } catch {
      client.disconnect();
    }
  });

  if (redis) {
    redis = null;
    redisAvailable = false;
    currentStatus = 'DISCONNECTED';
  }

  await Promise.allSettled(closePromises);
}
