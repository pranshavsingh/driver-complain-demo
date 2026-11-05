/**
 * Transactional Outbox Observability Collector.
 *
 * Exposes:
 * - sse_connect_outbox_pending_events (Gauge: count of pending outbox events)
 * - sse_connect_outbox_dispatch_lag_seconds (Gauge: dispatch age in seconds of oldest pending event)
 * - sse_connect_outbox_dispatches_total (Counter: dispatch success/failure count)
 * - sse_connect_outbox_deliveries_total (Counter: consumer delivery success/failure/retry count)
 */
import { prisma } from '../../lib/prisma';
import {
  outboxPendingEvents,
  outboxDispatchLagSeconds,
  outboxDispatchesTotal,
  outboxDeliveriesTotal,
} from '../../lib/metrics';
import { logger } from '../../lib/logger';

/**
 * Polls the TransactionalOutbox table for pending count and oldest scheduledAt.
 * Uses the composite index on (status, scheduledAt) to ensure sub-millisecond execution.
 */
export async function collectOutboxMetrics(): Promise<void> {
  try {
    const result = await prisma.$queryRaw<Array<{ count: number | bigint; oldest: Date | null }>>`
      SELECT count(*)::int as count, MIN("scheduledAt") as oldest
      FROM "TransactionalOutbox"
      WHERE status = 'PENDING'
    `;

    if (result && result[0]) {
      const count = Number(result[0].count) || 0;
      outboxPendingEvents.set(count);

      if (count > 0 && result[0].oldest) {
        const oldestMs = new Date(result[0].oldest).getTime();
        const lagSeconds = Math.max(0, (Date.now() - oldestMs) / 1000);
        outboxDispatchLagSeconds.set(lagSeconds);
      } else {
        outboxDispatchLagSeconds.set(0);
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Safe non-blocking error collecting Outbox metrics');
  }
}

export function recordOutboxDispatch(status: 'success' | 'failure', count = 1): void {
  try {
    outboxDispatchesTotal.inc({ status }, count);
  } catch {
    // Non-blocking
  }
}

export function recordOutboxDelivery(status: 'success' | 'failure' | 'retry', count = 1): void {
  try {
    outboxDeliveriesTotal.inc({ status }, count);
  } catch {
    // Non-blocking
  }
}
