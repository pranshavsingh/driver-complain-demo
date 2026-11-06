/**
 * Redis observability collector.
 *
 * Exposes:
 * - sse_connect_redis_up (Gauge)
 * - sse_connect_redis_ping_latency_seconds (Gauge)
 * - sse_connect_redis_connected_clients (Gauge)
 * - sse_connect_redis_used_memory_bytes (Gauge)
 *
 * NOTE on unsupported metrics:
 * Redis per-command latency instrumentation across all arbitrary BullMQ and application
 * commands is not implemented. Monkey-patching ioredis internal command pipelines creates
 * measurable CPU overhead on hot event loops and can destabilize BullMQ's multi-key atomic
 * Lua scripts. Ping latency is used as the safe, standardized responsiveness measurement.
 */
import { getRedisClient, isRedisAvailable, pingRedis, getRedisStatus } from './redis';
import {
  redisUpGauge,
  redisPingLatencySeconds,
  redisConnectedClients,
  redisUsedMemoryBytes,
} from './metrics';
import { logger } from './logger';

export function markRedisUnavailable(): void {
  redisUpGauge.set(0);
  redisPingLatencySeconds.remove();
  redisConnectedClients.remove();
  redisUsedMemoryBytes.remove();
}

export async function collectRedisMetrics(): Promise<{ status: 'skipped'; reason: string } | void> {
  const client = getRedisClient();
  const available = isRedisAvailable();
  const redisStatus = getRedisStatus();

  // If Redis is explicitly unconfigured and not available, skip collection
  if (redisStatus === 'NOT_CONFIGURED' && !available) {
    markRedisUnavailable();
    return { status: 'skipped', reason: 'Redis not configured (optional dependency)' };
  }

  if (!client || !available) {
    markRedisUnavailable();
    throw new Error(`Redis unavailable (status: ${redisStatus})`);
  }

  try {
    // 1. Connectivity & Ping Latency Probe
    const pingResult = await pingRedis(1000);
    if (pingResult.status === 'CONNECTED' && pingResult.latencyMs !== undefined) {
      redisUpGauge.set(1);
      redisPingLatencySeconds.set(pingResult.latencyMs / 1000);
    } else {
      markRedisUnavailable();
      throw new Error(`Redis ping failed (status: ${pingResult.status})`);
    }

    // 2. Safe, section-scoped INFO queries (INFO clients, INFO memory)
    // Section-scoped INFO is computationally O(1) in Redis compared to full INFO.
    const [clientsInfo, memoryInfo] = await Promise.all([
      client.info('clients').catch(() => null),
      client.info('memory').catch(() => null),
    ]);

    if (clientsInfo) {
      const matchClients = clientsInfo.match(/connected_clients:(\d+)/);
      if (matchClients && matchClients[1]) {
        redisConnectedClients.set(parseInt(matchClients[1], 10));
      } else {
        redisConnectedClients.remove();
      }
    } else {
      redisConnectedClients.remove();
    }

    if (memoryInfo) {
      const matchMemory = memoryInfo.match(/used_memory:(\d+)/);
      if (matchMemory && matchMemory[1]) {
        redisUsedMemoryBytes.set(parseInt(matchMemory[1], 10));
      } else {
        redisUsedMemoryBytes.remove();
      }
    } else {
      redisUsedMemoryBytes.remove();
    }
  } catch (err) {
    markRedisUnavailable();
    logger.debug({ err }, 'Error collecting Redis metrics (handled safely)');
    throw err;
  }
}
