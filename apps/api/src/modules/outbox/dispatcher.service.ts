import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { prepareOutboxDispatch } from './outbox.service';
import { OutboxStatus } from './outbox.types';

let dispatcherInterval: NodeJS.Timeout | null = null;
let isDispatching = false;

/**
 * Sweeps pending outbox events and executes fan-out preparation.
 */
export async function dispatchPendingOutboxEvents(batchSize = 50): Promise<{
  dispatchedCount: number;
  intentsCreated: number;
}> {
  if (isDispatching) return { dispatchedCount: 0, intentsCreated: 0 };
  isDispatching = true;

  try {
    const pendingEvents = await prisma.transactionalOutbox.findMany({
      where: {
        status: OutboxStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: batchSize,
      select: { id: true },
    });

    let dispatchedCount = 0;
    let intentsCreated = 0;

    for (const evt of pendingEvents) {
      try {
        const res = await prepareOutboxDispatch(evt.id);
        dispatchedCount++;
        intentsCreated += res.intentsCreated;
      } catch (err) {
        logger.error({ err, outboxId: evt.id }, 'Failed to prepare outbox dispatch');
      }
    }

    return { dispatchedCount, intentsCreated };
  } finally {
    isDispatching = false;
  }
}

/**
 * Starts periodic outbox dispatcher scheduler.
 */
export function startDispatcherScheduler(intervalMs = 2000): void {
  if (dispatcherInterval) return;
  logger.info({ intervalMs }, 'Starting outbox dispatcher scheduler');

  dispatcherInterval = setInterval(() => {
    void dispatchPendingOutboxEvents().catch((err: unknown) => {
      logger.error({ err }, 'Error in outbox dispatcher interval');
    });
  }, intervalMs);
}

/**
 * Stops periodic outbox dispatcher scheduler.
 */
export function stopDispatcherScheduler(): void {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    dispatcherInterval = null;
    logger.info('Stopped outbox dispatcher scheduler');
  }
}
