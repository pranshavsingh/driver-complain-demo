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
import { redis, isRedisAvailable, pingRedis } from './redis';
import {
  redisUpGauge,
  redisPingLatencySeconds,
  redisConnectedClients,
  redisUsedMemoryBytes,
} from './metrics';
import { logger } from './logger';

export async function collectRedisMetrics(): Promise<void> {
  if (!redis || !isRedisAvailable()) {
    redisUpGauge.set(0);
    return;
  }

  try {
    // 1. Connectivity & Ping Latency Probe
    const pingResult = await pingRedis(1000);
    if (pingResult.status === 'CONNECTED' && pingResult.latencyMs !== undefined) {
      redisUpGauge.set(1);
      redisPingLatencySeconds.set(pingResult.latencyMs / 1000);
    } else {
      redisUpGauge.set(0);
      return;
    }

    // 2. Safe, section-scoped INFO queries (INFO clients, INFO memory)
    // Section-scoped INFO is computationally O(1) in Redis compared to full INFO.
    const [clientsInfo, memoryInfo] = await Promise.all([
      redis.info('clients').catch(() => null),
      redis.info('memory').catch(() => null),
    ]);

    if (clientsInfo) {
      const matchClients = clientsInfo.match(/connected_clients:(\d+)/);
      if (matchClients && matchClients[1]) {
        redisConnectedClients.set(parseInt(matchClients[1], 10));
      }
    }

    if (memoryInfo) {
      const matchMemory = memoryInfo.match(/used_memory:(\d+)/);
      if (matchMemory && matchMemory[1]) {
        redisUsedMemoryBytes.set(parseInt(matchMemory[1], 10));
      }
    }
  } catch (err) {
    redisUpGauge.set(0);
    logger.debug({ err }, 'Error collecting Redis metrics (handled safely)');
  }
}
