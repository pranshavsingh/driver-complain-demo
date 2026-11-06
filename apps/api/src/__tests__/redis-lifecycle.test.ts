import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  isRedisAvailable,
  closeRedis,
  defaultRedisOptions,
} from '../lib/redis';
import { EnvSchemaWithValidation } from '../config/env';
import { initRealtime, closeRealtime } from '../realtime/socket';
import { createServer } from 'node:http';
import { prisma } from '../lib/prisma';

describe('Milestone 2: Redis Connection Lifecycle & Readiness Health', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([1] as any);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await closeRealtime();
    await closeRedis();
  });

  it('exposes resilient default options for clustering and retry', () => {
    expect(defaultRedisOptions.maxRetriesPerRequest).toBeNull();
    expect(defaultRedisOptions.enableReadyCheck).toBe(true);
    expect(defaultRedisOptions.connectTimeout).toBe(5000);
    expect(typeof defaultRedisOptions.retryStrategy).toBe('function');
    if (typeof defaultRedisOptions.retryStrategy === 'function') {
      expect(defaultRedisOptions.retryStrategy(1)).toBe(100);
      expect(defaultRedisOptions.retryStrategy(50)).toBe(3000); // capped at 3000ms
    }
  });

  // TASK 1.1 — Development without REDIS_URL
  it('allows development without REDIS_URL and enables in-memory fallback', async () => {
    const devEnv = {
      NODE_ENV: 'development',
      PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      JWT_ACCESS_SECRET: 'super-secret-access-token-key-12345',
      REFRESH_TOKEN_SECRET: 'super-secret-refresh-token-key-12345',
    };

    const parsed = EnvSchemaWithValidation.safeParse(devEnv);
    expect(parsed.success).toBe(true);

    process.env.NODE_ENV = 'development';
    delete process.env.REDIS_URL;
    delete process.env.REQUIRE_REDIS_READY;

    const app = createApp();
    const res = await request(app).get('/health/readiness');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.database).toBe('CONNECTED');
    expect(res.body.redis).toBe('NOT_CONFIGURED');
  });

  // TASK 1.2 — Production without REDIS_URL
  it('fails validation and readiness when REDIS_URL is absent in production', async () => {
    const prodEnvWithoutRedis = {
      NODE_ENV: 'production',
      PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      JWT_ACCESS_SECRET: 'super-secret-access-token-key-12345',
      REFRESH_TOKEN_SECRET: 'super-secret-refresh-token-key-12345',
    };

    const parsed = EnvSchemaWithValidation.safeParse(prodEnvWithoutRedis);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error?.issues[0]?.message).toContain('REDIS_URL is mandatory in production');
    }

    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;

    // Readiness returns 503 NOT_READY in production when Redis is not configured
    const app = createApp();
    const res = await request(app).get('/health/readiness');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('NOT_READY');
    expect(res.body.redis).toBe('NOT_CONFIGURED');

    // Socket.IO rejects in-memory initialization in production
    const server = createServer();
    expect(() => initRealtime(server)).toThrow(/Socket\.IO Redis adapter cannot be initialized without Redis in production/);
  });

  // TASK 1.3 — Production with REDIS_URL configured
  it('reports READY and CONNECTED when REDIS_URL is configured and healthy in production', async () => {
    const prodEnvWithRedis = {
      NODE_ENV: 'production',
      PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      JWT_ACCESS_SECRET: 'super-secret-access-token-key-12345',
      REFRESH_TOKEN_SECRET: 'super-secret-refresh-token-key-12345',
      REDIS_URL: 'redis://localhost:6379',
    };

    const parsed = EnvSchemaWithValidation.safeParse(prodEnvWithRedis);
    expect(parsed.success).toBe(true);

    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const redisModule = await import('../lib/redis');
    const pingSpy = vi.spyOn(redisModule, 'pingRedis').mockResolvedValueOnce({
      status: 'CONNECTED',
      latencyMs: 1.5,
    });

    const app = createApp();
    const res = await request(app).get('/health/readiness');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.database).toBe('CONNECTED');
    expect(res.body.redis).toBe('CONNECTED');
    expect(res.body.redisLatencyMs).toBe(1.5);

    pingSpy.mockRestore();
  });

  // TASK 1.4 — Production with Redis unavailable
  it('reports 503 NOT_READY in production when Redis is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const redisModule = await import('../lib/redis');
    const pingSpy = vi.spyOn(redisModule, 'pingRedis').mockResolvedValueOnce({
      status: 'DISCONNECTED',
      error: 'ECONNREFUSED 127.0.0.1:6379',
    });

    const app = createApp();
    const res = await request(app).get('/health/readiness');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('NOT_READY');
    expect(res.body.database).toBe('CONNECTED');
    expect(res.body.redis).toBe('DISCONNECTED');
    expect(res.body.error).toContain('ECONNREFUSED');

    pingSpy.mockRestore();
  });

  // TASK 1.5 — Production after Redis recovers
  it('restores READY status automatically when Redis recovers from outage', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const redisModule = await import('../lib/redis');

    // 1. Initial Outage
    const outageSpy = vi.spyOn(redisModule, 'pingRedis').mockResolvedValueOnce({
      status: 'DISCONNECTED',
      error: 'Redis node unreachable',
    });

    const app = createApp();
    const outageRes = await request(app).get('/health/readiness');
    expect(outageRes.status).toBe(503);
    expect(outageRes.body.status).toBe('NOT_READY');
    expect(outageRes.body.redis).toBe('DISCONNECTED');
    outageSpy.mockRestore();

    // 2. Redis Recovers
    const recoverySpy = vi.spyOn(redisModule, 'pingRedis').mockResolvedValueOnce({
      status: 'CONNECTED',
      latencyMs: 2.1,
    });

    const recoveryRes = await request(app).get('/health/readiness');
    expect(recoveryRes.status).toBe(200);
    expect(recoveryRes.body.status).toBe('READY');
    expect(recoveryRes.body.database).toBe('CONNECTED');
    expect(recoveryRes.body.redis).toBe('CONNECTED');

    recoverySpy.mockRestore();
  });

  it('closes all tracked connections safely on closeRedis()', async () => {
    await expect(closeRedis()).resolves.not.toThrow();
    expect(isRedisAvailable()).toBe(false);
  });
});
