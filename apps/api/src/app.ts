import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { pingRedis } from './lib/redis';
import { Sentry } from './lib/sentry';
import { register, metricsMiddleware, verifyMetricsAuth, collectSystemMetrics, dbUpGauge } from './lib/metrics';
import { requestId } from './middleware/request-id';
import { apiRateLimiter } from './middleware/rate-limit';
import { notFound } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';
import { apiRouter } from './routes';

/**
 * Build the Express app without binding a port — importable by tests (supertest)
 * and by the server entrypoint alike.
 */
export function createApp(): Express {
  const app = express();

  // Behind a single reverse proxy in staging/prod; makes req.ip trustworthy.
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      // Reuse the correlation id assigned by requestId.
      genReqId: (req) => (req as { id?: string }).id ?? '',
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        // Reflect the exact requesting origin so credentials: true is always valid
        return callback(null, origin);
      },
      credentials: true,
      exposedHeaders: [
        'Content-Disposition',
        'X-Total-Count',
        'X-Page',
        'X-Page-Size',
        'X-Total-Pages',
        'X-Has-Next-Page',
        'X-Has-Prev-Page',
      ],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(metricsMiddleware);

  // Backward-compatible shallow health check
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Kubernetes Liveness probe: Shallow process check to detect deadlocks
  app.get('/health/liveness', (_req, res) => {
    res.json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Kubernetes Readiness probe: Deep dependency check (PostgreSQL connectivity + Redis reachability)
  app.get('/health/readiness', async (_req, res) => {
    try {
      // 1. Bounded query to verify PostgreSQL connection pool health
      await prisma.$queryRaw`SELECT 1`;
      dbUpGauge.set(1);

      // 2. Verify Redis reachability when configured or required in production
      const redisHealth = await pingRedis();
      const isProd = process.env.NODE_ENV === 'production';
      const requireRedis = process.env.REQUIRE_REDIS_READY === 'true' || isProd;
      const isRedisOk = redisHealth.status === 'CONNECTED' || (!requireRedis && redisHealth.status === 'NOT_CONFIGURED');

      if (requireRedis && redisHealth.status !== 'CONNECTED') {
        res.status(503).json({
          status: 'NOT_READY',
          database: 'CONNECTED',
          redis: redisHealth.status,
          error: redisHealth.error || (redisHealth.status === 'NOT_CONFIGURED' ? 'REDIS_URL not configured in production' : 'Redis unreachable'),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        status: isRedisOk ? 'READY' : 'DEGRADED',
        database: 'CONNECTED',
        redis: redisHealth.status,
        ...(redisHealth.latencyMs !== undefined ? { redisLatencyMs: redisHealth.latencyMs } : {}),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      dbUpGauge.set(0);
      const message = err instanceof Error ? err.message : 'Database check failed';
      logger.error({ err }, 'Readiness probe failed');
      res.status(503).json({
        status: 'NOT_READY',
        database: 'DISCONNECTED',
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Prometheus Metrics scrape endpoint (protected)
  app.get('/metrics', verifyMetricsAuth, async (_req, res) => {
    try {
      await collectSystemMetrics();
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  });

  app.use('/api/v1', apiRateLimiter, apiRouter);

  app.use(notFound);

  // Sentry's error handler must sit after routes and before ours (no-op without a DSN).
  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
