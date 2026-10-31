import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const register = new Registry();

// Collect Node.js process metrics (memory, event loop lag, CPU, handles)
collectDefaultMetrics({
  register,
  prefix: 'sse_connect_',
});

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

/**
 * Express middleware to track HTTP metrics per request.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics collection on health and metrics probes themselves to avoid polluting data
  if (req.path.startsWith('/health') || req.path === '/metrics') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds + nanoseconds / 1e9;
    const route = req.route?.path || req.path;
    const statusCode = res.statusCode.toString();

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      duration,
    );
  });

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

