import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { tryAdvisoryXactLock } from '../lib/advisory-lock';

describe('Milestone 2: Distributed Scheduler Advisory Locking', () => {
  it('acquires transaction-scoped lock and automatically releases upon transaction commit', async () => {
    const lockId = 1001099; // Isolated test lock ID

    // Transaction 1 acquires the lock and commits
    const tx1Result = await prisma.$transaction(
      async (tx) => {
        return tryAdvisoryXactLock(tx, lockId);
      },
      { maxWait: 10000, timeout: 10000 },
    );
    expect(tx1Result).toBe(true);

    // Transaction 2 immediately acquires the same lock (proving it was released when tx1 committed)
    const tx2Result = await prisma.$transaction(
      async (tx) => {
        return tryAdvisoryXactLock(tx, lockId);
      },
      { maxWait: 10000, timeout: 10000 },
    );
    expect(tx2Result).toBe(true);
  }, 25000);

  it('provides mutual exclusion and non-blocking skip while a transaction is active', async () => {
    const lockId = 1001098; // Isolated test lock ID

    let tx1Acquired = false;
    let releaseTx1: () => void = () => {};
    const tx1HoldPromise = new Promise<void>((resolve) => {
      releaseTx1 = resolve;
    });

    // Start tx1 in background
    const tx1Promise = prisma.$transaction(
      async (tx1) => {
        const acquired = await tryAdvisoryXactLock(tx1, lockId);
        tx1Acquired = acquired;
        // Wait until signaled to commit
        await tx1HoldPromise;
        return acquired;
      },
      { maxWait: 10000, timeout: 15000 },
    );

    // Wait until tx1 has acquired the lock
    for (let i = 0; i < 50; i++) {
      if (tx1Acquired) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(tx1Acquired).toBe(true);

    // While tx1 is holding the lock, tx2 attempts to acquire it
    let tx2Result: boolean | null = null;
    try {
      tx2Result = await prisma.$transaction(
        async (tx2) => {
          return tryAdvisoryXactLock(tx2, lockId);
        },
        { maxWait: 10000, timeout: 10000 },
      );
    } finally {
      // Release tx1
      releaseTx1();
    }

    const tx1Result = await tx1Promise;

    expect(tx1Result).toBe(true);
    // tx2 did NOT block — it returned false immediately!
    expect(tx2Result).toBe(false);

    // Now that tx1 committed, tx3 can acquire it again
    const tx3Result = await prisma.$transaction(
      async (tx3) => {
        return tryAdvisoryXactLock(tx3, lockId);
      },
      { maxWait: 10000, timeout: 10000 },
    );
    expect(tx3Result).toBe(true);
  }, 30000);

  it('supports multiple independent advisory locks simultaneously', async () => {
    const result = await prisma.$transaction(
      async (tx) => {
        const lock1 = await tryAdvisoryXactLock(tx, 1001096);
        const lock2 = await tryAdvisoryXactLock(tx, 1001097);
        return { lock1, lock2 };
      },
      { maxWait: 10000, timeout: 10000 },
    );

    expect(result.lock1).toBe(true);
    expect(result.lock2).toBe(true);
  }, 20000);
});
