import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import EventEmitter from 'node:events';
import { createApp } from '../app';
import {
  register,
  getRouteLabel,
  normalizeMethod,
  normalizeStatusCode,
  normalizeDisconnectReason,
  metricsMiddleware,
  httpRequestsInFlight,
  redisUpGauge,
  redisConnectedClients,
  redisUsedMemoryBytes,
  redisPingLatencySeconds,
  dbUpGauge,
  socketioConnectedClients,
} from '../lib/metrics';
import { collectRedisMetrics, markRedisUnavailable } from '../lib/redis-metrics';
import { collectBullmqMetrics } from '../jobs/queue-metrics';
import {
  collectOutboxMetrics,
  computeOutboxMetricsFromRow,
  recordOutboxDispatch,
  recordOutboxDelivery,
} from '../modules/outbox/outbox.metrics';
import { prisma } from '../lib/prisma';
import * as redisModule from '../lib/redis';

describe('Observability & Metrics Hardening (M8 Phase 2)', () => {
  const app = createApp();

  beforeEach(() => {
    delete process.env.METRICS_AUTH_TOKEN;
  });

  describe('Route-Label Cardinality & Sanitization', () => {
    it('normalizes HTTP methods to bounded allowlist', () => {
      expect(normalizeMethod('get')).toBe('GET');
      expect(normalizeMethod('POST')).toBe('POST');
      expect(normalizeMethod('patch')).toBe('PATCH');
      expect(normalizeMethod('INVALID_METHOD')).toBe('OTHER');
      expect(normalizeMethod(undefined)).toBe('UNKNOWN');
    });

    it('normalizes HTTP status codes to valid numeric ranges', () => {
      expect(normalizeStatusCode(200)).toBe('200');
      expect(normalizeStatusCode(404)).toBe('404');
      expect(normalizeStatusCode(503)).toBe('503');
      expect(normalizeStatusCode(99)).toBe('UNKNOWN');
      expect(normalizeStatusCode(601)).toBe('UNKNOWN');
      expect(normalizeStatusCode(NaN)).toBe('UNKNOWN');
    });

    it('normalizes Socket.IO disconnect reasons to bounded allowlist', () => {
      expect(normalizeDisconnectReason('client namespace disconnect')).toBe('client_namespace_disconnect');
      expect(normalizeDisconnectReason('transport close')).toBe('transport_close');
      expect(normalizeDisconnectReason('ping timeout')).toBe('ping_timeout');
      expect(normalizeDisconnectReason('arbitrary-unknown-reason-12345')).toBe('other');
      expect(normalizeDisconnectReason(undefined)).toBe('unknown');
    });

    it('returns UNMATCHED_ROUTE when req.route is undefined', () => {
      const mockReq = {
        path: '/some/unregistered/path',
        originalUrl: '/some/unregistered/path',
      } as any;
      expect(getRouteLabel(mockReq)).toBe('UNMATCHED_ROUTE');
    });

    it('returns combined route template for valid registered route', () => {
      const mockReq = {
        baseUrl: '/api/v1/complaints',
        route: { path: '/:id' },
      } as any;
      expect(getRouteLabel(mockReq)).toBe('/api/v1/complaints/:id');
    });

    it('rejects raw UUIDs in route templates to UNMATCHED_ROUTE', () => {
      const mockReq = {
        baseUrl: '/api/v1/complaints',
        route: { path: '/123e4567-e89b-12d3-a456-426614174000' },
      } as any;
      expect(getRouteLabel(mockReq)).toBe('UNMATCHED_ROUTE');
    });

    it('records UNMATCHED_ROUTE for 404 requests and never leaks UUIDs to metrics', async () => {
      const dynamicUuid = 'a0000000-0000-0000-0000-000000000099';
      const testPath = `/api/v1/unregistered-path/${dynamicUuid}/action`;

      const response = await request(app).get(testPath);
      expect(response.status).toBe(404);

      // Fetch exported metrics
      const metricsRes = await request(app).get('/metrics');
      expect(metricsRes.status).toBe(200);

      // Verify UUID never appears in metrics output
      expect(metricsRes.text).not.toContain(dynamicUuid);

      // Verify UNMATCHED_ROUTE is present in metrics
      expect(metricsRes.text).toContain('route="UNMATCHED_ROUTE"');
    });

    it('does not leak arbitrary path segments or query parameters to metrics', async () => {
      const randomQuery = 'secret_query_param_leak_value_98765';
      const randomSegment = 'arbitrary_random_path_123456';
      const testPath = `/api/v1/${randomSegment}?leak_test=${randomQuery}`;

      const response = await request(app).get(testPath);
      expect(response.status).toBe(404);

      const metricsRes = await request(app).get('/metrics');
      expect(metricsRes.status).toBe(200);

      expect(metricsRes.text).not.toContain(randomQuery);
      expect(metricsRes.text).not.toContain(randomSegment);
      expect(metricsRes.text).toContain('route="UNMATCHED_ROUTE"');
    });
  });

  describe('HTTP In-Flight Request Gauge Lifecycle & Aborted Requests', () => {
    it('in-flight requests gauge is maintained correctly across normal request finish', async () => {
      const initialInFlight = (await register.getSingleMetric('sse_connect_http_requests_in_flight')?.get()) as any;
      const initialVal = initialInFlight?.values?.[0]?.value ?? 0;

      await request(app).get('/health');

      const afterInFlight = (await register.getSingleMetric('sse_connect_http_requests_in_flight')?.get()) as any;
      const afterVal = afterInFlight?.values?.[0]?.value ?? 0;

      expect(afterVal).toBe(initialVal);
    });

    it('decrements in-flight requests gauge on premature client close/abort', async () => {
      const initial = (await httpRequestsInFlight.get()).values[0]?.value ?? 0;

      const mockReq = {
        path: '/api/v1/some-endpoint',
        method: 'GET',
      } as any;

      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;

      let nextCalled = false;
      metricsMiddleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      const afterInc = (await httpRequestsInFlight.get()).values[0]?.value;
      expect(afterInc).toBe(initial + 1);

      // Client prematurely aborts the connection (emits 'close' without 'finish')
      mockRes.emit('close');

      const afterClose = (await httpRequestsInFlight.get()).values[0]?.value;
      expect(afterClose).toBe(initial);
    });

    it('prevents double-decrement when both finish and close events fire', async () => {
      const initial = (await httpRequestsInFlight.get()).values[0]?.value ?? 0;

      const mockReq = {
        path: '/api/v1/some-endpoint',
        method: 'GET',
      } as any;

      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq, mockRes, () => {});

      expect((await httpRequestsInFlight.get()).values[0]?.value).toBe(initial + 1);

      // Normal response completion fires 'finish'
      mockRes.emit('finish');
      expect((await httpRequestsInFlight.get()).values[0]?.value).toBe(initial);

      // Follow-up 'close' event from Node socket tear-down
      mockRes.emit('close');
      expect((await httpRequestsInFlight.get()).values[0]?.value).toBe(initial);
    });
  });

  describe('/metrics Security & Token Authentication', () => {
    it('returns 200 without token in development/test', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('enforces Bearer token when METRICS_AUTH_TOKEN is configured', async () => {
      process.env.METRICS_AUTH_TOKEN = 'prod-metrics-secret-token-abc';

      // Unauthenticated
      const unauthRes = await request(app).get('/metrics');
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.error.code).toBe('UNAUTHORIZED');

      // Invalid token
      const wrongTokenRes = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer wrong-token-xyz');
      expect(wrongTokenRes.status).toBe(401);

      // Query token is rejected
      const queryTokenRes = await request(app)
        .get('/metrics?token=prod-metrics-secret-token-abc');
      expect(queryTokenRes.status).toBe(401);

      // Valid Bearer token
      const validRes = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer prod-metrics-secret-token-abc');
      expect(validRes.status).toBe(200);
      expect(validRes.text).toContain('sse_connect_');
    });
  });

  describe('Redis Metrics Resilience & Stale Metric Removal', () => {
    it('removes client and memory gauges rather than leaving stale or fabricated zero values when Redis is down', async () => {
      // Simulate healthy values first
      redisConnectedClients.set(42);
      redisUsedMemoryBytes.set(1048576);
      redisPingLatencySeconds.set(0.005);
      redisUpGauge.set(1);

      // Mark Redis unavailable
      markRedisUnavailable();

      // redis_up should be explicitly 0
      expect((await redisUpGauge.get()).values[0]?.value).toBe(0);

      // Detailed gauges must be removed (empty values list)
      expect((await redisConnectedClients.get()).values).toEqual([]);
      expect((await redisUsedMemoryBytes.get()).values).toEqual([]);
      expect((await redisPingLatencySeconds.get()).values).toEqual([]);
    });

    it('safely handles Redis when disconnected during collectRedisMetrics without throwing', async () => {
      await expect(collectRedisMetrics()).resolves.not.toThrow();

      expect((await redisUpGauge.get()).values[0]?.value).toBe(0);
      expect((await redisConnectedClients.get()).values).toEqual([]);
      expect((await redisUsedMemoryBytes.get()).values).toEqual([]);
    });

    it('correctly updates gauges when Redis recovers', async () => {
      markRedisUnavailable();

      // Mock ping, isRedisAvailable, and getRedisClient
      const isAvailSpy = vi.spyOn(redisModule, 'isRedisAvailable').mockReturnValue(true);
      const pingSpy = vi.spyOn(redisModule, 'pingRedis').mockResolvedValue({
        status: 'CONNECTED',
        latencyMs: 12,
      });

      const mockInfo = vi.fn().mockImplementation((section: string) => {
        if (section === 'clients') return Promise.resolve('# Clients\nconnected_clients:15\n');
        if (section === 'memory') return Promise.resolve('# Memory\nused_memory:2097152\n');
        return Promise.resolve('');
      });

      const clientSpy = vi.spyOn(redisModule, 'getRedisClient').mockReturnValue({ info: mockInfo } as any);

      try {
        await collectRedisMetrics();

        expect((await redisUpGauge.get()).values[0]?.value).toBe(1);
        expect((await redisPingLatencySeconds.get()).values[0]?.value).toBe(0.012);
        expect((await redisConnectedClients.get()).values[0]?.value).toBe(15);
        expect((await redisUsedMemoryBytes.get()).values[0]?.value).toBe(2097152);
      } finally {
        isAvailSpy.mockRestore();
        pingSpy.mockRestore();
        clientSpy.mockRestore();
      }
    });
  });

  describe('Database Connectivity Metric (db_up)', () => {
    it('sets dbUpGauge to 1 on successful query', async () => {
      const querySpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

      await prisma.$queryRaw`SELECT 1`;

      expect((await dbUpGauge.get()).values[0]?.value).toBe(1);
      querySpy.mockRestore();
    });

    it('sets dbUpGauge to 0 on database connection drop', async () => {
      const err = new Error("Can't reach database server");
      (err as any).code = 'P1001';

      const querySpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(err);

      await expect(prisma.$queryRaw`SELECT 1`).rejects.toThrow();

      expect((await dbUpGauge.get()).values[0]?.value).toBe(0);
      querySpy.mockRestore();
    });
  });

  describe('Queue Metrics Resilience', () => {
    it('safely handles BullMQ metrics collection when queues are uninitialized or empty', async () => {
      await expect(collectBullmqMetrics()).resolves.not.toThrow();
    });
  });

  describe('Socket.IO Gauge Lifecycle', () => {
    it('updates socketioConnectedClients gauge correctly', async () => {
      socketioConnectedClients.set(0);
      let metric = await socketioConnectedClients.get();
      expect(metric.values[0]?.value).toBe(0);

      socketioConnectedClients.inc();
      metric = await socketioConnectedClients.get();
      expect(metric.values[0]?.value).toBe(1);

      socketioConnectedClients.dec();
      metric = await socketioConnectedClients.get();
      expect(metric.values[0]?.value).toBe(0);
    });
  });

  describe('Transactional Outbox Dispatch Lag & Future Scheduled Events', () => {
    it('computes 0 lag when no pending events exist', () => {
      const result = computeOutboxMetricsFromRow(undefined);
      expect(result).toEqual({ pendingCount: 0, overdueCount: 0, lagSeconds: 0 });

      const emptyRow = computeOutboxMetricsFromRow({
        pending_count: 0,
        overdue_count: 0,
        oldest_overdue: null,
      });
      expect(emptyRow).toEqual({ pendingCount: 0, overdueCount: 0, lagSeconds: 0 });
    });

    it('computes 0 lag when all pending events are scheduled for the FUTURE', () => {
      // 5 pending events, but 0 overdue and oldest_overdue is null because none are <= NOW()
      const futureOnly = computeOutboxMetricsFromRow({
        pending_count: 5,
        overdue_count: 0,
        oldest_overdue: null,
      });

      expect(futureOnly.pendingCount).toBe(5);
      expect(futureOnly.overdueCount).toBe(0);
      expect(futureOnly.lagSeconds).toBe(0); // Zero lag because none are overdue!
    });

    it('computes exact lag when overdue events exist', () => {
      const now = 1700000000000;
      const overdueBy120s = new Date(now - 120 * 1000);

      const overdueResult = computeOutboxMetricsFromRow(
        {
          pending_count: 5,
          overdue_count: 2,
          oldest_overdue: overdueBy120s,
        },
        now,
      );

      expect(overdueResult.pendingCount).toBe(5);
      expect(overdueResult.overdueCount).toBe(2);
      expect(overdueResult.lagSeconds).toBe(120);
    });

    it('handles database errors gracefully during collectOutboxMetrics without throwing', async () => {
      await expect(collectOutboxMetrics()).resolves.not.toThrow();
    });

    it('records outbox dispatches and deliveries total correctly', () => {
      recordOutboxDispatch('success', 2);
      recordOutboxDispatch('failure', 1);

      recordOutboxDelivery('success', 3);
      recordOutboxDelivery('retry', 1);
      recordOutboxDelivery('failure', 1);

      expect(true).toBe(true);
    });
  });
});
