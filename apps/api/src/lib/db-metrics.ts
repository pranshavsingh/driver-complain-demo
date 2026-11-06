/**
 * Database connectivity metrics collector.
 *
 * Exposes:
 * - sse_connect_db_up (Gauge)
 *
 * NOTE on Database pool metrics:
 * Prisma Client executes queries using an internal compiled Rust engine that does not
 * expose active/idle/waiting pool metrics to JS runtime.
 * PgBouncer (infra/pgbouncer.ini) acts as the transaction pooler; pool monitoring
 * in production is performed via pgbouncer_exporter scraping SHOW POOLS / SHOW STATS.
 */
import { pingDatabase } from './prisma';
import { logger } from './logger';

export async function collectDbMetrics(): Promise<void> {
  const isUp = await pingDatabase(1500);
  if (!isUp) {
    const errorMsg = 'Database connectivity check failed (database down or ping timed out)';
    logger.debug(errorMsg);
    throw new Error(errorMsg);
  }
}
