import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from './logger';

export const register = new Registry();

// Collect Node.js process metrics (memory, event loop lag, CPU, handles)
collectDefaultMetrics({
  register,
  prefix: 'sse_connect_',
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'sse_connect_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'sse_connect_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestsInFlight = new Gauge({
  name: 'sse_connect_http_requests_in_flight',
  help: 'Number of in-flight HTTP requests currently being processed',
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// Redis Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const redisUpGauge = new Gauge({
  name: 'sse_connect_redis_up',
  help: 'Redis connectivity state: 1 for connected and healthy, 0 otherwise',
  registers: [register],
});
redisUpGauge.set(0);

export const redisPingLatencySeconds = new Gauge({
  name: 'sse_connect_redis_ping_latency_seconds',
  help: 'Latency of Redis ping probe in seconds',
  registers: [register],
});

export const redisConnectedClients = new Gauge({
  name: 'sse_connect_redis_connected_clients',
  help: 'Number of connected clients on the Redis instance',
  registers: [register],
});

export const redisUsedMemoryBytes = new Gauge({
  name: 'sse_connect_redis_used_memory_bytes',
  help: 'Total memory allocated by Redis in bytes',
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ Queue and Worker Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const bullmqQueueJobs = new Gauge({
  name: 'sse_connect_bullmq_queue_jobs',
  help: 'Number of BullMQ jobs in each state per queue',
  labelNames: ['queue', 'status'],
  registers: [register],
});

export const bullmqJobDurationSeconds = new Histogram({
  name: 'sse_connect_bullmq_job_duration_seconds',
  help: 'Duration of BullMQ job execution in seconds',
  labelNames: ['queue', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// Database & Prisma Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const dbUpGauge = new Gauge({
  name: 'sse_connect_db_up',
  help: 'Database connectivity state: 1 for reachable, 0 otherwise',
  registers: [register],
});
dbUpGauge.set(0);

export const dbQueryDurationSeconds = new Histogram({
  name: 'sse_connect_db_query_duration_seconds',
  help: 'Duration of Prisma database queries in seconds',
  labelNames: ['model', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const socketioConnectedClients = new Gauge({
  name: 'sse_connect_socketio_connected_clients',
  help: 'Number of currently connected Socket.IO client connections',
  registers: [register],
});

export const socketioConnectionsTotal = new Counter({
  name: 'sse_connect_socketio_connections_total',
  help: 'Total count of accepted Socket.IO connections',
  registers: [register],
});

export const socketioDisconnectionsTotal = new Counter({
  name: 'sse_connect_socketio_disconnections_total',
  help: 'Total count of Socket.IO disconnections by reason',
  labelNames: ['reason'],
  registers: [register],
});

export const socketioRoomsCount = new Gauge({
  name: 'sse_connect_socketio_rooms_count',
  help: 'Total number of active Socket.IO rooms',
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// Transactional Outbox Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const outboxPendingEvents = new Gauge({
  name: 'sse_connect_outbox_pending_events',
  help: 'Total number of pending events in the transactional outbox (including future scheduled)',
  registers: [register],
});

export const outboxOverdueEvents = new Gauge({
  name: 'sse_connect_outbox_overdue_events',
  help: 'Number of overdue pending events in the transactional outbox eligible for immediate dispatch',
  registers: [register],
});

export const outboxDispatchLagSeconds = new Gauge({
  name: 'sse_connect_outbox_dispatch_lag_seconds',
  help: 'Age in seconds of the oldest overdue pending transactional outbox event (0 if none overdue)',
  registers: [register],
});

export const outboxDispatchesTotal = new Counter({
  name: 'sse_connect_outbox_dispatches_total',
  help: 'Total transactional outbox dispatch operations',
  labelNames: ['status'],
  registers: [register],
});

export const outboxDeliveriesTotal = new Counter({
  name: 'sse_connect_outbox_deliveries_total',
  help: 'Total transactional outbox consumer delivery attempts',
  labelNames: ['status'],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// Label Normalization & Route Sanitization
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export function normalizeMethod(method?: string): string {
  if (!method) return 'UNKNOWN';
  const upper = method.toUpperCase();
  return ALLOWED_METHODS.has(upper) ? upper : 'OTHER';
}

export function normalizeStatusCode(statusCode?: number | string): string {
  const code = typeof statusCode === 'number' ? statusCode : parseInt(String(statusCode), 10);
  if (!Number.isNaN(code) && code >= 100 && code < 600) {
    return code.toString();
  }
  return 'UNKNOWN';
}

const KNOWN_DISCONNECT_REASONS = new Set([
  'server_shutting_down',
  'client_namespace_disconnect',
  'server_namespace_disconnect',
  'ping_timeout',
  'transport_close',
  'transport_error',
  'parse_error',
]);

export function normalizeDisconnectReason(reason?: string): string {
  if (!reason) return 'unknown';
  const normalized = reason.toLowerCase().replace(/[\s-]+/g, '_');
  return KNOWN_DISCONNECT_REASONS.has(normalized) ? normalized : 'other';
}

/**
 * Returns a strictly bounded route label.
 * If Express matched a registered route, returns the route template (e.g. `/api/v1/complaints/:id`).
 * If unmatched, returns 'UNMATCHED_ROUTE'.
 * Never exposes raw URLs, UUIDs, user IDs, query strings, filenames or arbitrary path segments.
 */
export function getRouteLabel(req: Request): string {
  if (req.route && typeof req.route.path === 'string') {
    const basePath = req.baseUrl || '';
    const routePath = req.route.path;
    const combined = `${basePath}${routePath}`.replace(/\/+$/, '') || '/';

    // Guardrail: if any raw UUID or long integer leaked through, reject to UNMATCHED_ROUTE
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(combined)) {
      return 'UNMATCHED_ROUTE';
    }
    return combined;
  }

  return 'UNMATCHED_ROUTE';
}

/**
 * Express middleware to track HTTP metrics per request.
 * Strictly guarantees that every in-flight increment receives exactly one decrement,
 * whether the response completes normally or the client connection closes prematurely.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics collection on health and metrics probes themselves to avoid polluting data
  if (req.path.startsWith('/health') || req.path === '/metrics') {
    return next();
  }

  httpRequestsInFlight.inc();
  const start = process.hrtime();
  let completed = false;

  const onComplete = () => {
    if (completed) return;
    completed = true;
    httpRequestsInFlight.dec();

    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds + nanoseconds / 1e9;
    const route = getRouteLabel(req);
    const method = normalizeMethod(req.method);
    const statusCode = normalizeStatusCode(res.statusCode);

    httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    httpRequestDurationSeconds.observe(
      {
        method,
        route,
        status_code: statusCode,
      },
      duration,
    );
  };

  res.once('finish', onComplete);
  res.once('close', onComplete);

  next();
}

/**
 * Security guard for /metrics endpoint.
 * Requires strictly header Authorization: Bearer <METRICS_AUTH_TOKEN>.
 * Query string tokens are rejected to prevent leakage in proxy/access logs.
 * In production when METRICS_AUTH_TOKEN is unset, the endpoint returns 403 Forbidden.
 */
export function verifyMetricsAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredToken = process.env.METRICS_AUTH_TOKEN;

  // If a metrics auth token is configured, enforce strict Bearer token matching
  if (configuredToken) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (bearerToken && bearerToken === configuredToken) {
      return next();
    }

    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized access to metrics: valid Bearer token required' },
    });
    return;
  }

  // In production without a token, always block external access
  if (env.NODE_ENV === 'production') {
    const ip = req.ip || req.socket.remoteAddress;
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Metrics endpoint is protected. Configure METRICS_AUTH_TOKEN.' },
      });
      return;
    }
  }

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// System Metrics Lazy Scraper
// Individual collectors are throttled with a 15-second TTL cache to prevent
// database or Redis thrashing while allowing failed collectors to retry on the
// very next scrape.
// Protected with single-flight mutex to prevent duplicate concurrent collections.
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_SYSTEM_COLLECTORS = ['db', 'redis', 'bullmq', 'socketio', 'outbox'] as const;
export type SystemCollectorName = (typeof ALL_SYSTEM_COLLECTORS)[number];

export interface CollectorStatus {
  lastSuccessTime: number | null;
  lastFailureTime: number | null;
  lastError: string | null;
  status: 'idle' | 'success' | 'failed';
}

const collectorStatus: Record<SystemCollectorName, CollectorStatus> = {
  db: { lastSuccessTime: null, lastFailureTime: null, lastError: null, status: 'idle' },
  redis: { lastSuccessTime: null, lastFailureTime: null, lastError: null, status: 'idle' },
  bullmq: { lastSuccessTime: null, lastFailureTime: null, lastError: null, status: 'idle' },
  socketio: { lastSuccessTime: null, lastFailureTime: null, lastError: null, status: 'idle' },
  outbox: { lastSuccessTime: null, lastFailureTime: null, lastError: null, status: 'idle' },
};

let entireCollectionSucceeded = false;
let lastEntireCollectionSuccessTime: number | null = null;
let inFlightCollectPromise: Promise<void> | null = null;
export const COLLECT_TTL_MS = 15000;

/**
 * Checks whether a specific collector is due to run (either never succeeded, failed on last attempt,
 * or 15 seconds have elapsed since its last success).
 */
export function isCollectorDue(name: SystemCollectorName, now: number = Date.now()): boolean {
  const lastSuccess = collectorStatus[name].lastSuccessTime;
  if (lastSuccess === null) {
    return true;
  }
  return now - lastSuccess >= COLLECT_TTL_MS;
}

/**
 * Helper to run a collector with safety and status tracking.
 */
async function runCollector(name: SystemCollectorName, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    collectorStatus[name].lastSuccessTime = Date.now();
    collectorStatus[name].lastError = null;
    collectorStatus[name].status = 'success';
    return true;
  } catch (err) {
    collectorStatus[name].lastFailureTime = Date.now();
    collectorStatus[name].lastError = err instanceof Error ? err.message : String(err);
    collectorStatus[name].status = 'failed';
    // Clear lastSuccessTime so this collector is immediately eligible for retry on the next scrape
    collectorStatus[name].lastSuccessTime = null;
    logger.debug({ err, collector: name }, `Safe non-blocking error collecting ${name} metrics`);
    return false;
  }
}

/**
 * Resets collector throttle timestamp and statuses for deterministic unit testing.
 */
export function _resetCollectThrottleForTesting(): void {
  for (const name of ALL_SYSTEM_COLLECTORS) {
    collectorStatus[name] = {
      lastSuccessTime: null,
      lastFailureTime: null,
      lastError: null,
      status: 'idle',
    };
  }
  entireCollectionSucceeded = false;
  lastEntireCollectionSuccessTime = null;
  inFlightCollectPromise = null;
}

/**
 * Returns current internal status of system collectors for test verification.
 */
export function _getCollectorStatusForTesting() {
  return {
    collectors: {
      db: { ...collectorStatus.db },
      redis: { ...collectorStatus.redis },
      bullmq: { ...collectorStatus.bullmq },
      socketio: { ...collectorStatus.socketio },
      outbox: { ...collectorStatus.outbox },
    },
    entireCollectionSucceeded,
    lastEntireCollectionSuccessTime,
    isInFlight: inFlightCollectPromise !== null,
  };
}

export async function collectSystemMetrics(): Promise<void> {
  // 1. If a collection is actively executing, share the existing promise (single-flight mutex)
  if (inFlightCollectPromise) {
    return inFlightCollectPromise;
  }

  // 2. Determine which collectors need to run (due for execution or retry)
  const now = Date.now();
  const collectorsToRun = ALL_SYSTEM_COLLECTORS.filter((name) => isCollectorDue(name, now));

  // If all collectors have completed successfully within the last 15 seconds, skip collection
  if (collectorsToRun.length === 0) {
    return;
  }

  inFlightCollectPromise = (async () => {
    let anyCollectorFailed = false;

    // 1. Database Connectivity Metric (cached 15s TTL, non-blocking)
    if (collectorsToRun.includes('db')) {
      const ok = await runCollector('db', async () => {
        const { collectDbMetrics } = await import('./db-metrics');
        await collectDbMetrics();
      });
      if (!ok) anyCollectorFailed = true;
    }

    // 2. Redis Metrics (cached 15s TTL, non-blocking)
    if (collectorsToRun.includes('redis')) {
      const ok = await runCollector('redis', async () => {
        const { collectRedisMetrics } = await import('./redis-metrics');
        await collectRedisMetrics();
      });
      if (!ok) anyCollectorFailed = true;
    }

    // 3. BullMQ Queue Metrics (cached 15s TTL, non-blocking)
    if (collectorsToRun.includes('bullmq')) {
      const ok = await runCollector('bullmq', async () => {
        const { collectBullmqMetrics } = await import('../jobs/queue-metrics');
        await collectBullmqMetrics();
      });
      if (!ok) anyCollectorFailed = true;
    }

    // 4. Socket.IO Metrics (cached 15s TTL, non-blocking)
    if (collectorsToRun.includes('socketio')) {
      const ok = await runCollector('socketio', async () => {
        const { getIo } = await import('../realtime/socket');
        const io = getIo();
        if (io && io.sockets && io.sockets.adapter && io.sockets.adapter.rooms) {
          socketioRoomsCount.set(io.sockets.adapter.rooms.size);
        }
      });
      if (!ok) anyCollectorFailed = true;
    }

    // 5. Outbox Metrics (cached 15s TTL, non-blocking)
    if (collectorsToRun.includes('outbox')) {
      const ok = await runCollector('outbox', async () => {
        const { collectOutboxMetrics } = await import('../modules/outbox/outbox.metrics');
        await collectOutboxMetrics();
      });
      if (!ok) anyCollectorFailed = true;
    }

    // Mark entire collection as successful only when no collector failed and all collectors have valid success timestamps
    if (
      !anyCollectorFailed &&
      ALL_SYSTEM_COLLECTORS.every(
        (name) => collectorStatus[name].status === 'success' && collectorStatus[name].lastSuccessTime !== null,
      )
    ) {
      entireCollectionSucceeded = true;
      lastEntireCollectionSuccessTime = Date.now();
    } else {
      entireCollectionSucceeded = false;
    }
  })()
    .catch((unexpectedErr) => {
      entireCollectionSucceeded = false;
      logger.error({ err: unexpectedErr }, 'Unexpected error in collectSystemMetrics');
    })
    .finally(() => {
      inFlightCollectPromise = null;
    });

  return inFlightCollectPromise;
}
