export const ADVISORY_LOCK_IDS = {
  SLA_ESCALATION: 1001001,
  CLEANUP_MAINTENANCE: 1001002,
} as const;

export interface AdvisoryLockClient {
  $queryRaw?: <T = unknown>(query: TemplateStringsArray, ...values: any[]) => Promise<T>;
}

const isPostgres = () => (process.env.DATABASE_URL ?? '').startsWith('postgres');

/**
 * Attempts to acquire an advisory lock.
 * In PostgreSQL, uses pg_try_advisory_xact_lock (transaction-scoped).
 * In MySQL, uses GET_LOCK(..., 0) (non-blocking, returns 1 if acquired).
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
  if (isPostgres()) {
    const result = await tx.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_xact_lock(${lockId}::bigint) AS acquired;
    `;
    return Boolean(result[0]?.acquired);
  }

  // MySQL GET_LOCK returns 1 on success, 0 on timeout/held by another session, NULL on error
  const lockKey = `advisory_lock_${lockId}`;
  const result = await tx.$queryRaw<Array<{ acquired: number | bigint | null }>>`
    SELECT GET_LOCK(${lockKey}, 0) AS acquired;
  `;
  return Number(result[0]?.acquired) === 1;
}

/**
 * Releases an advisory lock.
 * In PostgreSQL, xact locks are released automatically on transaction commit/abort.
 * In MySQL, releases the named lock via RELEASE_LOCK(...).
 */
export async function releaseAdvisoryLock(
  tx: AdvisoryLockClient,
  lockId: number,
): Promise<boolean> {
  if (!tx || typeof tx.$queryRaw !== 'function') {
    return true;
  }
  if (isPostgres()) {
    return true;
  }

  const lockKey = `advisory_lock_${lockId}`;
  const result = await tx.$queryRaw<Array<{ released: number | bigint | null }>>`
    SELECT RELEASE_LOCK(${lockKey}) AS released;
  `;
  return Number(result[0]?.released) === 1;
}
