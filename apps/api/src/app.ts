import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from './config/env';
import { logger } from './lib/logger';
import { Sentry } from './lib/sentry';
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
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/v1', apiRateLimiter, apiRouter);

  app.use(notFound);

  // Sentry's error handler must sit after routes and before ours (no-op without a DSN).
  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
