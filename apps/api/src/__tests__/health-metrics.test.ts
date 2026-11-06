import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';

describe('Health and Metrics Endpoints', () => {
  const app = createApp();

  beforeEach(() => {
    delete process.env.METRICS_AUTH_TOKEN;
  });

  describe('GET /health', () => {
    it('returns backward-compatible { ok: true }', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('GET /health/liveness', () => {
    it('returns UP status with uptime and timestamp', async () => {
      const res = await request(app).get('/health/liveness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  describe('GET /health/readiness', () => {
    it('returns READY and database CONNECTED when database responds', async () => {
      const querySpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([1] as any);
      const res = await request(app).get('/health/readiness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.database).toBe('CONNECTED');
      expect(typeof res.body.timestamp).toBe('string');
      querySpy.mockRestore();
    });

    it('returns 503 and NOT_READY when database query fails', async () => {
      const querySpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection lost'));
      const res = await request(app).get('/health/readiness');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('NOT_READY');
      expect(res.body.database).toBe('DISCONNECTED');
      expect(res.body.error).toContain('Connection lost');
      querySpy.mockRestore();
    });
  });

  describe('GET /metrics', () => {
    it('returns Prometheus metrics when token is not configured or in dev', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('sse_connect_');
    });

    it('enforces token authentication when METRICS_AUTH_TOKEN is configured', async () => {
      process.env.METRICS_AUTH_TOKEN = 'secret-test-token-123';

      // Unauthorized without token
      const unauthRes = await request(app).get('/metrics');
      expect(unauthRes.status).toBe(401);

      // Authorized with Bearer token
      const authRes = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer secret-test-token-123');
      expect(authRes.status).toBe(200);
      expect(authRes.text).toContain('sse_connect_');

      // Invalid token rejected
      const invalidRes = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer wrong-token');
      expect(invalidRes.status).toBe(401);

      // Query token is rejected (disallowed to prevent log leakage)
      const queryRes = await request(app).get('/metrics?token=secret-test-token-123');
      expect(queryRes.status).toBe(401);
      expect(queryRes.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

