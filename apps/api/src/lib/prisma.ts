import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';
import { dbUpGauge, dbQueryDurationSeconds } from './metrics';

/**
 * Reuse a single PrismaClient across hot-reloads in dev; a fresh one per process
 * in production. Prevents connection-pool exhaustion under tsx --watch.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

function isConnectionError(error: any): boolean {
  if (!error) return false;
  const errorCode = error?.code;
  const errorMessage = String(error?.message || '');
  const causeMessage = String(error?.cause || '');
  const name = String(error?.name || '');

  // Never retry transaction-scoped or constraint errors
  if (
    errorMessage.includes('Transaction') ||
    errorMessage.includes('transaction') ||
    errorCode === 'P2028' ||
    errorCode === 'P2002' ||
    errorCode === 'P2025'
  ) {
    return false;
  }

  return (
    errorCode === 'P1017' ||
    errorCode === 'P1001' ||
    errorCode === 'P2024' ||
    name === 'PrismaClientInitializationError' ||
    errorMessage.includes('E57P01') ||
    errorMessage.includes("Can't reach database server") ||
    errorMessage.includes('terminating connection') ||
    errorMessage.includes('Closed connection') ||
    errorMessage.includes('Connection reset') ||
    errorMessage.includes('socket hung up') ||
    causeMessage.includes('E57P01') ||
    causeMessage.includes('terminating connection')
  );
}

export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt < maxRetries && isConnectionError(error)) {
        logger.warn(
          { attempt, maxRetries, error: (error as Error).message },
          'PostgreSQL connection dropped or database warming up (P1001/E57P01). Reconnecting & retrying query...',
        );
        await basePrisma.$connect().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Fast, non-retrying connectivity probe for readiness checks and metric scrapers.
 * Guarantees a bounded execution time (default 1500ms) without triggering multi-attempt retry loops.
 */
export async function pingDatabase(timeoutMs = 1500): Promise<boolean> {
  try {
    const probePromise = basePrisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Database ping timed out after ${timeoutMs}ms`)), timeoutMs).unref(),
    );
    await Promise.race([probePromise, timeoutPromise]);
    dbUpGauge.set(1);
    return true;
  } catch (_err) {
    dbUpGauge.set(0);
    return false;
  }
}

/**
 * NOTE ON DATABASE OBSERVABILITY & POOL METRICS:
 * 1. Model queries ($allModels) only intercept high-level model operations.
 *    Raw operations ($queryRaw, $executeRaw) are instrumented via the client proxy below
 *    to ensure comprehensive coverage across both model and raw database traffic.
 * 2. Prisma Client executes queries using an internal compiled Rust query engine.
 *    The Rust engine does not export active/idle/waiting pool metrics to JavaScript
 *    runtime without previewFeatures metrics.
 * 3. In this production architecture, PgBouncer (infra/pgbouncer.ini) acts as the
 *    true transaction-pooling proxy. Standard production pool instrumentation
 *    is performed via pgbouncer_exporter scraping SHOW POOLS and SHOW STATS.
 */
const extendedPrisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        return withDbRetry(async () => {
          const start = process.hrtime();
          try {
            const res = await query(args);
            const [seconds, nanoseconds] = process.hrtime(start);
            dbQueryDurationSeconds.observe(
              { model: model || 'raw', operation: operation || 'unknown' },
              seconds + nanoseconds / 1e9,
            );
            dbUpGauge.set(1);
            return res;
          } catch (e: any) {
            const [seconds, nanoseconds] = process.hrtime(start);
            dbQueryDurationSeconds.observe(
              { model: model || 'raw', operation: operation || 'unknown' },
              seconds + nanoseconds / 1e9,
            );
            if (isConnectionError(e)) {
              dbUpGauge.set(0);
            }
            throw e;
          }
        });
      },
    },
  },
});

export type ExtendedPrismaClient = typeof extendedPrisma;

// Proxy extendedPrisma to wrap batch $transaction, $queryRaw, and $executeRaw with metrics and retry logic,
// while executing interactive transaction callbacks exactly once without callback retry replay.
export const prisma: ExtendedPrismaClient = new Proxy(extendedPrisma, {
  get(target, prop, receiver) {
    if (prop === '$transaction') {
      const origTransaction = typeof target.$transaction === 'function'
        ? target.$transaction
        : (basePrisma as any).$transaction;
      return async (...args: Parameters<typeof target.$transaction>) => {
        const firstArg = args[0];
        // Case A — Interactive transaction callback: execute directly without callback retry
        // to prevent duplicate side-effects (complaints, updates, notifications).
        if (typeof firstArg === 'function') {
          return Reflect.apply(origTransaction, target, args);
        }
        // Case B — Batch array or options transaction: safe to retry connection errors.
        return withDbRetry(async () => Reflect.apply(origTransaction, target, args));
      };
    }

    if (prop === '$queryRaw' || prop === '$executeRaw') {
      const orig = typeof (target as any)[prop] === 'function'
        ? (target as any)[prop]
        : (basePrisma as any)[prop];
      return async (...args: any[]) => {
        return withDbRetry(async () => {
          const start = process.hrtime();
          try {
            const res = await orig.apply(target, args);
            const [seconds, nanoseconds] = process.hrtime(start);
            dbQueryDurationSeconds.observe(
              { model: 'raw', operation: String(prop) },
              seconds + nanoseconds / 1e9,
            );
            dbUpGauge.set(1);
            return res;
          } catch (e: any) {
            const [seconds, nanoseconds] = process.hrtime(start);
            dbQueryDurationSeconds.observe(
              { model: 'raw', operation: String(prop) },
              seconds + nanoseconds / 1e9,
            );
            if (isConnectionError(e)) {
              dbUpGauge.set(0);
            }
            throw e;
          }
        });
      };
    }

    return Reflect.get(target, prop, receiver);
  },
}) as ExtendedPrismaClient;
