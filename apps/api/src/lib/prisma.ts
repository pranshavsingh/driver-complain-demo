import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';

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

export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
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
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw error;
    }
  }
}

const extendedPrisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return withDbRetry(() => query(args));
      },
    },
  },
});

// Proxy extendedPrisma to wrap $transaction automatically with retry logic as well
export const prisma: PrismaClient = new Proxy(extendedPrisma, {
  get(target, prop, receiver) {
    if (prop === '$transaction') {
      return async (...args: any[]) => {
        return withDbRetry(() => (target.$transaction as any)(...args));
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as unknown as PrismaClient;



