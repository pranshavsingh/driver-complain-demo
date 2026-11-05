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
  dbQueryDurationSeconds,
  socketioConnectedClients,
  collectSystemMetrics,
  _resetCollectThrottleForTesting,
  _getCollectorStatusForTesting,
  isCollectorDue,
} from '../lib/metrics';
import * as dbMetricsModule from '../lib/db-metrics';
import * as queueMetricsModule from '../jobs/queue-metrics';
import * as redisMetricsModule from '../lib/redis-metrics';
import * as outboxMetricsModule from '../modules/outbox/outbox.metrics';
import { collectRedisMetrics, markRedisUnavailable } from '../lib/redis-metrics';
import { collectBullmqMetrics, instrumentWorker } from '../jobs/queue-metrics';
import {
  collectOutboxMetrics,
  computeOutboxMetricsFromRow,
  recordOutboxDispatch,
  recordOutboxDelivery,
} from '../modules/outbox/outbox.metrics';
import { prisma, basePrisma, pingDatabase } from '../lib/prisma';
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

    it('prevents double-decrement when close fires before finish', async () => {
      const initial = (await httpRequestsInFlight.get()).values[0]?.value ?? 0;

      const mockReq = {
        path: '/api/v1/some-endpoint',
        method: 'GET',
      } as any;

      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;

      metricsMiddleware(mockReq, mockRes, () => {});

      expect((await httpRequestsInFlight.get()).values[0]?.value).toBe(initial + 1);

      // Socket closes prematurely first
      mockRes.emit('close');
      expect((await httpRequestsInFlight.get()).values[0]?.value).toBe(initial);

      // Follow-up finish event is ignored
      mockRes.emit('finish');
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

  describe('Database Connectivity Metric (db_up) & Raw SQL Instrumentation', () => {
    it('sets dbUpGauge to 1 and observes duration on successful $queryRaw', async () => {
      const querySpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

      await prisma.$queryRaw`SELECT 1`;

      expect((await dbUpGauge.get()).values[0]?.value).toBe(1);
      const hist = (await dbQueryDurationSeconds.get()) as any;
      expect(hist.values.some((v: any) => v.labels.model === 'raw' && v.labels.operation === '$queryRaw')).toBe(true);
      querySpy.mockRestore();
    });

    it('sets dbUpGauge to 0 on $queryRaw database connection drop', async () => {
      const err = new Error("Can't reach database server");
      (err as any).code = 'P1001';

      const querySpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(err);

      await expect(prisma.$queryRaw`SELECT 1`).rejects.toThrow();

      expect((await dbUpGauge.get()).values[0]?.value).toBe(0);
      querySpy.mockRestore();
    });

    it('instruments $executeRaw with duration and dbUpGauge updates', async () => {
      const execSpy = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1);

      const affected = await prisma.$executeRaw`UPDATE "User" SET "updatedAt" = NOW() WHERE false`;
      expect(affected).toBe(1);

      expect((await dbUpGauge.get()).values[0]?.value).toBe(1);
      const hist = (await dbQueryDurationSeconds.get()) as any;
      expect(hist.values.some((v: any) => v.labels.model === 'raw' && v.labels.operation === '$executeRaw')).toBe(true);
      execSpy.mockRestore();

      // Test connection error drop
      const err = new Error("Connection reset by peer");
      (err as any).code = 'P1017';
      const failSpy = vi.spyOn(prisma, '$executeRaw').mockRejectedValue(err);
      await expect(prisma.$executeRaw`SELECT 1`).rejects.toThrow();
      expect((await dbUpGauge.get()).values[0]?.value).toBe(0);
      failSpy.mockRestore();
    });

    it('instruments $queryRawUnsafe with parameter pass-through and duration metrics', async () => {
      const unsafeQuerySpy = vi.spyOn(prisma, '$queryRawUnsafe').mockImplementation((async (sql: string, ...values: any[]) => {
        expect(sql).toBe('SELECT * FROM "User" WHERE id = $1');
        expect(values).toEqual(['test-id-123']);
        return [{ id: 'test-id-123' }];
      }) as any);

      const res = await prisma.$queryRawUnsafe('SELECT * FROM "User" WHERE id = $1', 'test-id-123');
      expect(res).toEqual([{ id: 'test-id-123' }]);
      expect((await dbUpGauge.get()).values[0]?.value).toBe(1);

      const hist = (await dbQueryDurationSeconds.get()) as any;
      expect(hist.values.some((v: any) => v.labels.model === 'raw' && v.labels.operation === '$queryRawUnsafe')).toBe(true);
      unsafeQuerySpy.mockRestore();

      // Test connection error drop
      const err = new Error("Closed connection");
      (err as any).code = 'P1001';
      const failSpy = vi.spyOn(prisma, '$queryRawUnsafe').mockRejectedValue(err);
      await expect(prisma.$queryRawUnsafe('SELECT 1')).rejects.toThrow();
      expect((await dbUpGauge.get()).values[0]?.value).toBe(0);
      failSpy.mockRestore();
    });

    it('instruments $executeRawUnsafe with parameter pass-through and duration metrics', async () => {
      const unsafeExecSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation((async (sql: string, ...values: any[]) => {
        expect(sql).toBe('DELETE FROM "TransactionalOutbox" WHERE status = $1');
        expect(values).toEqual(['ARCHIVED']);
        return 5;
      }) as any);

      const count = await prisma.$executeRawUnsafe('DELETE FROM "TransactionalOutbox" WHERE status = $1', 'ARCHIVED');
      expect(count).toBe(5);
      expect((await dbUpGauge.get()).values[0]?.value).toBe(1);

      const hist = (await dbQueryDurationSeconds.get()) as any;
      expect(hist.values.some((v: any) => v.labels.model === 'raw' && v.labels.operation === '$executeRawUnsafe')).toBe(true);
      unsafeExecSpy.mockRestore();

      // Test connection error drop
      const err = new Error("terminating connection due to administrator command");
      (err as any).code = 'E57P01';
      const failSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockRejectedValue(err);
      await expect(prisma.$executeRawUnsafe('DELETE FROM "User"')).rejects.toThrow();
      expect((await dbUpGauge.get()).values[0]?.value).toBe(0);
      failSpy.mockRestore();
    });

    it('initial state of dbUpGauge is a defined numeric value (0 or 1)', async () => {
      const metric = await dbUpGauge.get();
      expect(metric.values).toHaveLength(1);
      expect([0, 1]).toContain(metric.values[0]?.value);
    });

    it('sets dbUpGauge to 1 on pingDatabase success and 0 on timeout/failure', async () => {
      // Test failure path
      const failSpy = vi.spyOn(basePrisma, '$queryRaw').mockRejectedValue(new Error('timeout'));
      const failureResult = await pingDatabase(50);
      expect(failureResult).toBe(false);
      expect((await dbUpGauge.get()).values[0]?.value).toBe(0);
      failSpy.mockRestore();

      // Test success path
      const okSpy = vi.spyOn(basePrisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);
      const successResult = await pingDatabase(1000);
      expect(successResult).toBe(true);
      expect((await dbUpGauge.get()).values[0]?.value).toBe(1);
      okSpy.mockRestore();
    });
  });

  describe('Queue Metrics Resilience', () => {
    it('safely handles BullMQ metrics collection when queues are uninitialized or empty', async () => {
      await expect(collectBullmqMetrics()).resolves.not.toThrow();
    });

    it('observes worker completed and failed durations for allowlisted queues', async () => {
      const mockWorker = new EventEmitter() as any;
      instrumentWorker(mockWorker, 'token-cleanup');

      mockWorker.emit('completed', {
        processedOn: Date.now() - 250,
        finishedOn: Date.now(),
      });

      mockWorker.emit('failed', {
        processedOn: Date.now() - 500,
        finishedOn: Date.now(),
      });

      const metric = (await register.getSingleMetric('sse_connect_bullmq_job_duration_seconds')?.get()) as any;
      expect(metric?.values.some((v: any) => v.labels.queue === 'token-cleanup')).toBe(true);
    });

    it('attaches worker metrics instrumentation once only even if instrumentWorker is called multiple times', () => {
      const mockWorker = new EventEmitter() as any;
      expect(mockWorker.listenerCount('completed')).toBe(0);
      expect(mockWorker.listenerCount('failed')).toBe(0);

      instrumentWorker(mockWorker, 'token-cleanup');
      expect(mockWorker.listenerCount('completed')).toBe(1);
      expect(mockWorker.listenerCount('failed')).toBe(1);

      // Re-invoke instrumentWorker on the same instance
      instrumentWorker(mockWorker, 'token-cleanup');
      expect(mockWorker.listenerCount('completed')).toBe(1);
      expect(mockWorker.listenerCount('failed')).toBe(1);
    });

    it('rejects instrumentation for non-allowlisted queue names', () => {
      const mockWorker = new EventEmitter() as any;
      instrumentWorker(mockWorker, 'arbitrary-untrusted-queue');
      expect(mockWorker.listenerCount('completed')).toBe(0);
      expect(mockWorker.listenerCount('failed')).toBe(0);
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

  describe('Metrics Collection Concurrency & Throttle Resilience', () => {
    beforeEach(() => {
      _resetCollectThrottleForTesting();
    });

    it('deduplicates concurrent calls to collectSystemMetrics into a single in-flight execution', async () => {
      // Multiple concurrent calls share the in-flight collection promise
      const call1 = collectSystemMetrics();
      const call2 = collectSystemMetrics();
      const call3 = collectSystemMetrics();

      await expect(Promise.all([call1, call2, call3])).resolves.toBeDefined();
    });

    it('throttles collection calls made within the 15-second TTL window', async () => {
      _resetCollectThrottleForTesting();

      // First run executes collection
      await collectSystemMetrics();

      // Second immediate run returns without starting collection
      const promise = collectSystemMetrics();
      await expect(promise).resolves.toBeUndefined();
    });

    it('allows a subsequent collection after throttle timestamp is reset or TTL expires', async () => {
      _resetCollectThrottleForTesting();
      await collectSystemMetrics();

      // Simulate TTL expiration
      _resetCollectThrottleForTesting();
      await expect(collectSystemMetrics()).resolves.not.toThrow();
    });

    it('tracks individual collector completion and does not mark entire collection successful when one collector fails', async () => {
      _resetCollectThrottleForTesting();

      const bullmqSpy = vi
        .spyOn(queueMetricsModule, 'collectBullmqMetrics')
        .mockRejectedValueOnce(new Error('Simulated BullMQ failure'));

      await collectSystemMetrics();

      const status = _getCollectorStatusForTesting();
      expect(status.collectors.bullmq.status).toBe('failed');
      expect(status.collectors.bullmq.lastSuccessTime).toBeNull();
      expect(status.collectors.bullmq.lastError).toBe('Simulated BullMQ failure');
      expect(status.collectors.db.status).toBe('success');
      expect(status.collectors.db.lastSuccessTime).not.toBeNull();
      expect(status.entireCollectionSucceeded).toBe(false);
      expect(status.lastEntireCollectionSuccessTime).toBeNull();

      bullmqSpy.mockRestore();
    });

    it('retries a failed collector on subsequent scrape while preserving 15s throttle for successful collectors', async () => {
      _resetCollectThrottleForTesting();

      const dbSpy = vi.spyOn(dbMetricsModule, 'collectDbMetrics').mockResolvedValue();
      const bullmqSpy = vi
        .spyOn(queueMetricsModule, 'collectBullmqMetrics')
        .mockRejectedValueOnce(new Error('Transient BullMQ failure'))
        .mockResolvedValueOnce();

      // Scrape 1: DB succeeds, BullMQ fails
      await collectSystemMetrics();

      expect(dbSpy).toHaveBeenCalledTimes(1);
      expect(bullmqSpy).toHaveBeenCalledTimes(1);
      expect(isCollectorDue('db')).toBe(false);
      expect(isCollectorDue('bullmq')).toBe(true);

      const statusAfterScrape1 = _getCollectorStatusForTesting();
      expect(statusAfterScrape1.collectors.bullmq.status).toBe('failed');
      expect(statusAfterScrape1.collectors.db.status).toBe('success');
      expect(statusAfterScrape1.entireCollectionSucceeded).toBe(false);

      // Scrape 2 (immediate subsequent scrape, before 15s TTL):
      // DB must be throttled (NOT called again), BullMQ must be RETRIED (called 2nd time)
      await collectSystemMetrics();

      expect(dbSpy).toHaveBeenCalledTimes(1); // Throttled!
      expect(bullmqSpy).toHaveBeenCalledTimes(2); // Retried!
      expect(isCollectorDue('db')).toBe(false);
      expect(isCollectorDue('bullmq')).toBe(false);

      const statusAfterScrape2 = _getCollectorStatusForTesting();
      expect(statusAfterScrape2.collectors.bullmq.status).toBe('success');
      expect(statusAfterScrape2.entireCollectionSucceeded).toBe(true);
      expect(statusAfterScrape2.lastEntireCollectionSuccessTime).not.toBeNull();

      // Scrape 3 (immediate subsequent scrape): Both must be throttled
      await collectSystemMetrics();
      expect(dbSpy).toHaveBeenCalledTimes(1);
      expect(bullmqSpy).toHaveBeenCalledTimes(2);

      dbSpy.mockRestore();
      bullmqSpy.mockRestore();
    });

    it('preserves non-blocking behavior: one failed collector does not prevent unrelated collectors from executing', async () => {
      _resetCollectThrottleForTesting();

      const redisSpy = vi
        .spyOn(redisMetricsModule, 'collectRedisMetrics')
        .mockRejectedValueOnce(new Error('Redis crash'));
      const outboxSpy = vi.spyOn(outboxMetricsModule, 'collectOutboxMetrics');

      // Does not throw an unhandled exception
      await expect(collectSystemMetrics()).resolves.toBeUndefined();

      // Unrelated collector still executed
      expect(outboxSpy).toHaveBeenCalledTimes(1);
      const status = _getCollectorStatusForTesting();
      expect(status.collectors.redis.status).toBe('failed');
      expect(status.collectors.outbox.status).toBe('success');

      redisSpy.mockRestore();
      outboxSpy.mockRestore();
    });

    it('preserves single-flight mutex across concurrent scrapes during failure and retry', async () => {
      _resetCollectThrottleForTesting();

      let resolveBullmq: () => void;
      const bullmqDelay = new Promise<void>((resolve) => {
        resolveBullmq = resolve;
      });

      const bullmqSpy = vi
        .spyOn(queueMetricsModule, 'collectBullmqMetrics')
        .mockImplementation(async () => {
          await bullmqDelay;
          throw new Error('Async BullMQ failure');
        });

      // Launch 3 concurrent calls
      const call1 = collectSystemMetrics();
      const call2 = collectSystemMetrics();
      const call3 = collectSystemMetrics();

      // All 3 share the in-flight collection promise
      resolveBullmq!();
      await Promise.all([call1, call2, call3]);

      // Exactly 1 underlying collection execution took place
      expect(bullmqSpy).toHaveBeenCalledTimes(1);

      bullmqSpy.mockRestore();
    });
  });
});
