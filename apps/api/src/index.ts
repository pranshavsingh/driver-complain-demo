import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { initRealtime, closeRealtime } from './realtime/socket';

// Socket.IO needs the raw HTTP server, so the app is wrapped here rather than in
// createApp() — tests import createApp() and must stay socket-free.
const server = createServer(createApp());
initRealtime(server);

server.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);
  // Drop websockets first; otherwise their open connections keep server.close() waiting.
  await closeRealtime().catch((err: unknown) => {
    logger.error({ err }, 'Failed to close realtime cleanly');
  });
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Hard cap in case connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
