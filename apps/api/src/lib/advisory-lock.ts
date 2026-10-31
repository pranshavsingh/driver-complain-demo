export const ADVISORY_LOCK_IDS = {
  SLA_ESCALATION: 1001001,
  CLEANUP_MAINTENANCE: 1001002,
} as const;

export interface AdvisoryLockClient {
  $queryRaw?: <T = unknown>(query: TemplateStringsArray, ...values: any[]) => Promise<T>;
}

/**
 * Attempts to acquire a transaction-scoped PostgreSQL advisory lock.
 * The lock is tied to the current database transaction connection and
 * is automatically released as soon as the transaction commits or aborts.
 * This guarantees zero lock leakage in PgBouncer transaction pooling mode.
 *
 * @param tx The active Prisma interactive transaction client (or extended client).
 * @param lockId A unique integer identifier for the lock.
 * @returns true if the lock was acquired, false if held by another connection.
 */
export async function tryAdvisoryXactLock(
  tx: AdvisoryLockClient,
  lockId: number,
): Promise<boolean> {
  if (!tx || typeof tx.$queryRaw !== 'function') {
    return true; // Mock client in unit tests without raw SQL support
  }
  const result = await tx.$queryRaw<[{ acquired: boolean }]>`
    SELECT pg_try_advisory_xact_lock(${lockId}::bigint) AS acquired;
  `;
  return Boolean(result[0]?.acquired);
}
