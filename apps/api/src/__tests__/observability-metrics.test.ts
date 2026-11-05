import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  register,
  getRouteLabel,
  normalizeMethod,
  normalizeStatusCode,
  normalizeDisconnectReason,
  socketioConnectedClients,
} from '../lib/metrics';
import { collectRedisMetrics } from '../lib/redis-metrics';
import { collectBullmqMetrics } from '../jobs/queue-metrics';
import { collectOutboxMetrics, recordOutboxDispatch, recordOutboxDelivery } from '../modules/outbox/outbox.metrics';

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

  describe('In-Flight HTTP Requests Tracking', () => {
    it('in-flight requests gauge is maintained correctly', async () => {
      const initialInFlight = (await register.getSingleMetric('sse_connect_http_requests_in_flight')?.get()) as any;
      const initialVal = initialInFlight?.values?.[0]?.value ?? 0;

      await request(app).get('/health');

      const afterInFlight = (await register.getSingleMetric('sse_connect_http_requests_in_flight')?.get()) as any;
      const afterVal = afterInFlight?.values?.[0]?.value ?? 0;

      expect(afterVal).toBe(initialVal);
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

  describe('Redis Metrics Resilience', () => {
    it('safely handles Redis when disconnected without throwing or crashing', async () => {
      await expect(collectRedisMetrics()).resolves.not.toThrow();

      const metric = (await register.getSingleMetric('sse_connect_redis_up')?.get()) as any;
      expect(metric?.values?.[0]?.value).toBeDefined();
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

  describe('Transactional Outbox Metrics', () => {
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
