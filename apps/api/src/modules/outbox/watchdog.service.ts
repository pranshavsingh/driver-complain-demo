import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { synthesizeParentOutboxStatus } from './outbox.service';
import { ConsumerState } from './outbox.types';

let watchdogInterval: NodeJS.Timeout | null = null;
let isSweeping = false;

/**
 * Reconciles cursor and recovers expired leases for a given consumer and aggregate.
 */
export async function reconcileConsumerCursor(
  consumerId: string,
  aggregateType: string,
  aggregateId: string,
): Promise<bigint> {
  const rows = await prisma.$queryRaw<Array<{ sp_watchdog_reconcile_cursor: bigint }>>`
    SELECT sp_watchdog_reconcile_cursor(
      ${consumerId}::uuid,
      ${aggregateType},
      ${aggregateId}
    );
  `;
  return BigInt(rows[0]?.sp_watchdog_reconcile_cursor ?? 0);
}

/**
 * Sweeps all active consumers to reconcile cursors, recover expired leases, and synthesize outbox statuses.
 */
export async function sweepWatchdog(): Promise<{ reconciledCount: number }> {
  if (isSweeping) return { reconciledCount: 0 };
  isSweeping = true;

  try {
    const activeConsumers = await prisma.registeredConsumer.findMany({
      where: { state: ConsumerState.ACTIVE },
      select: { id: true, consumerName: true },
    });

    let reconciledCount = 0;

    for (const consumer of activeConsumers) {
      // Find all distinct aggregates for this consumer with assigned or delivered intents
      const aggregates = await prisma.outboxConsumerDispatchIntent.findMany({
        where: { consumerId: consumer.id },
        select: {
          outbox: {
            select: { aggregateType: true, aggregateId: true, id: true },
          },
        },
        distinct: ['outboxId'],
        take: 100,
      });

      const uniqueAggs = new Map<string, { type: string; id: string }>();
      const outboxIds = new Set<string>();

      for (const item of aggregates) {
        const key = `${item.outbox.aggregateType}:${item.outbox.aggregateId}`;
        uniqueAggs.set(key, { type: item.outbox.aggregateType, id: item.outbox.aggregateId });
        outboxIds.add(item.outbox.id);
      }

      for (const agg of uniqueAggs.values()) {
        try {
          await reconcileConsumerCursor(consumer.id, agg.type, agg.id);
          reconciledCount++;
        } catch (err) {
          logger.error({ err, consumerId: consumer.id, agg }, 'Watchdog cursor reconciliation failed');
        }
      }

      for (const outboxId of outboxIds) {
        try {
          await synthesizeParentOutboxStatus(outboxId);
        } catch (err) {
          logger.error({ err, outboxId }, 'Watchdog outbox synthesis failed');
        }
      }
    }

    return { reconciledCount };
  } finally {
    isSweeping = false;
  }
}

/**
 * Starts periodic watchdog scheduler.
 */
export function startWatchdogScheduler(intervalMs = 15000): void {
  if (watchdogInterval) return;
  logger.info({ intervalMs }, 'Starting outbox watchdog scheduler');

  watchdogInterval = setInterval(() => {
    void sweepWatchdog().catch((err: unknown) => {
      logger.error({ err }, 'Error in outbox watchdog interval');
    });
  }, intervalMs);
}

/**
 * Stops periodic watchdog scheduler.
 */
export function stopWatchdogScheduler(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    logger.info('Stopped outbox watchdog scheduler');
  }
}
