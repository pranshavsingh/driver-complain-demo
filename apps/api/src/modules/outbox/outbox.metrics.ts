/**
 * Transactional Outbox Observability Collector.
 *
 * Exposes:
 * - sse_connect_outbox_pending_events (Gauge: count of all pending outbox events)
 * - sse_connect_outbox_overdue_events (Gauge: count of overdue pending events eligible for dispatch)
 * - sse_connect_outbox_dispatch_lag_seconds (Gauge: dispatch age in seconds of oldest overdue pending event)
 * - sse_connect_outbox_dispatches_total (Counter: dispatch success/failure count)
 * - sse_connect_outbox_deliveries_total (Counter: consumer delivery success/failure/retry count)
 */
import { prisma } from '../../lib/prisma';
import {
  outboxPendingEvents,
  outboxOverdueEvents,
  outboxDispatchLagSeconds,
  outboxDispatchesTotal,
  outboxDeliveriesTotal,
} from '../../lib/metrics';

export interface OutboxLagQueryResult {
  pending_count?: number | bigint;
  overdue_count?: number | bigint;
  oldest_overdue?: Date | string | null;
}

/**
 * Pure calculation logic for outbox dispatch lag and counts.
 * Strictly guarantees that dispatch lag only measures overdue pending work,
 * returning 0 when only future-scheduled events exist or the table is empty.
 */
export function computeOutboxMetricsFromRow(
  row: OutboxLagQueryResult | undefined,
  nowMs = Date.now(),
): { pendingCount: number; overdueCount: number; lagSeconds: number } {
  if (!row) {
    return { pendingCount: 0, overdueCount: 0, lagSeconds: 0 };
  }

  const pendingCount = Number(row.pending_count) || 0;
  const overdueCount = Number(row.overdue_count) || 0;

  if (row.oldest_overdue && overdueCount > 0) {
    const oldestMs = new Date(row.oldest_overdue).getTime();
    const lagSeconds = Math.max(0, (nowMs - oldestMs) / 1000);
    return { pendingCount, overdueCount, lagSeconds };
  }

  return { pendingCount, overdueCount, lagSeconds: 0 };
}

/**
 * Polls the TransactionalOutbox table for pending and overdue counts and the oldest overdue scheduledAt.
 * Queries with `WHERE status = 'PENDING'` leverage the composite index `TransactionalOutbox_status_scheduledAt_idx`
 * on (status, scheduledAt). Because all evaluated expressions reference only status and scheduledAt, PostgreSQL
 * can satisfy the query via an Index-Only Scan without reading the main table heap when pages are marked visible.
 * Note: Query duration scales with the number of pending rows; the outbox table is continuously purged and archived
 * by the background dispatcher and watchdog scheduler to maintain low pending-set cardinality.
 */
export async function collectOutboxMetrics(): Promise<void> {
  const result = await prisma.$queryRaw<Array<OutboxLagQueryResult>>`
    SELECT 
      count(*)::int as pending_count,
      count(CASE WHEN "scheduledAt" <= NOW() THEN 1 END)::int as overdue_count,
      MIN(CASE WHEN "scheduledAt" <= NOW() THEN "scheduledAt" END) as oldest_overdue
    FROM "TransactionalOutbox"
    WHERE status = 'PENDING'
  `;

  const metrics = computeOutboxMetricsFromRow(result?.[0]);
  outboxPendingEvents.set(metrics.pendingCount);
  outboxOverdueEvents.set(metrics.overdueCount);
  outboxDispatchLagSeconds.set(metrics.lagSeconds);
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
