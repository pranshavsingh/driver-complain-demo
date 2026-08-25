import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Reuse a single PrismaClient across hot-reloads in dev; a fresh one per process
 * in production. Prevents connection-pool exhaustion under tsx --watch.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
