import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ArchivalReason } from './outbox.types';

export interface ArchivalResult {
  archivedOutboxCount: number;
  archivedIntentCount: number;
  archivedLedgerCount: number;
  batchId: string;
}

/**
 * Executes enterprise archival via sse_internal.sp_execute_enterprise_archival.
 * Safely copies completed/failed records older than retention interval to archive tables
 * with retry-safe batch identification, verifies row counts, and purges operational tables.
 */
export async function executeEnterpriseArchival(options?: {
  retentionInterval?: string;
  batchSize?: number;
  reason?: ArchivalReason;
  batchId?: string;
}): Promise<ArchivalResult> {
  const interval = options?.retentionInterval ?? '30 days';
  const batchSize = options?.batchSize ?? 100;
  const reason = options?.reason ?? ArchivalReason.TTL_EXPIRED;
  const batchId = options?.batchId ?? null;

  logger.info({ interval, batchSize, reason, batchId }, 'Executing enterprise archival run');

  const rows = await prisma.$queryRaw<
    Array<{
      archived_outbox_count: number;
      archived_intent_count: number;
      archived_ledger_count: number;
      batch_id: string;
    }>
  >`
    SELECT * FROM sse_internal.sp_execute_enterprise_archival(
      ${interval}::interval,
      ${batchSize}::integer,
      ${reason}::"ArchivalReason",
      ${batchId}::uuid
    );
  `;

  const row = rows[0];
  if (!row) {
    return {
      archivedOutboxCount: 0,
      archivedIntentCount: 0,
      archivedLedgerCount: 0,
      batchId: batchId ?? '',
    };
  }

  const result: ArchivalResult = {
    archivedOutboxCount: row.archived_outbox_count,
    archivedIntentCount: row.archived_intent_count,
    archivedLedgerCount: row.archived_ledger_count,
    batchId: row.batch_id,
  };

  logger.info(result, 'Enterprise archival run complete');
  return result;
}
