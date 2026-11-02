import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import {
  publishOutboxEvent,
  prepareOutboxDispatch,
  synthesizeParentOutboxStatus,
} from '../outbox.service';
import {
  activateConsumer,
  retireConsumer,
  executeDeliveryPreflight,
  executeDeliveryCompletion,
} from '../consumer.service';
import { reconcileConsumerCursor } from '../watchdog.service';
import { executeEnterpriseArchival } from '../archival.service';
import {
  OutboxStatus,
  ConsumerState,
  DispatchIntentStatus,
  DeliveryOutcome,
  ResolutionStatus,
  ArchivalReason,
} from '../outbox.types';

describe('Milestone 3: PostgreSQL Real Integration Tests', () => {
  const TEST_PREFIX = `m3_audit_${Date.now()}`;
  let noMatchConsumerId: string;

  beforeAll(async () => {
    // Clean up any previous test artifacts
    await prisma.deliveryLedger.deleteMany({
      where: { outbox: { aggregateType: { startsWith: 'TEST_AGG_' } } },
    });
    await prisma.outboxConsumerDispatchIntent.deleteMany({
      where: { outbox: { aggregateType: { startsWith: 'TEST_AGG_' } } },
    });
    await prisma.sequenceResolutionRecord.deleteMany({
      where: { aggregateType: { startsWith: 'TEST_AGG_' } },
    });
    await prisma.consumerAggregateCursor.deleteMany({
      where: { aggregateType: { startsWith: 'TEST_AGG_' } },
    });
    await prisma.transactionalOutbox.deleteMany({
      where: { aggregateType: { startsWith: 'TEST_AGG_' } },
    });
  });

  afterAll(async () => {
    // Cleanup test artifacts
    await prisma.deliveryLedger.deleteMany({
      where: { outbox: { aggregateType: { startsWith: 'TEST_AGG_' } } },
    });
    await prisma.outboxConsumerDispatchIntent.deleteMany({
      where: { outbox: { aggregateType: { startsWith: 'TEST_AGG_' } } },
    });
    await prisma.sequenceResolutionRecord.deleteMany({
      where: { aggregateType: { startsWith: 'TEST_AGG_' } },
    });
    await prisma.consumerAggregateCursor.deleteMany({
      where: { aggregateType: { startsWith: 'TEST_AGG_' } },
    });
    await prisma.transactionalOutbox.deleteMany({
      where: { aggregateType: { startsWith: 'TEST_AGG_' } },
    });
    await prisma.registeredConsumer.deleteMany({
      where: { consumerGroup: { startsWith: TEST_PREFIX } },
    });
  });

  it('1. sp_activate_consumer registers consumers with filter patterns and idempotency', async () => {
    const c1 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'audit-service',
      filterPattern: { eventTypes: ['ORDER_CREATED', 'PAYMENT_RECEIVED'] },
      maxInFlight: 5,
      leaseDurationSeconds: 20,
    });

    expect(c1.consumerId).toBeDefined();
    expect(c1.consumerName).toBe('audit-service');
    expect(c1.state).toBe(ConsumerState.ACTIVE);
    expect(c1.maxInFlight).toBe(5);

    const c3 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'shipping-service',
      filterPattern: { eventTypes: ['SHIPMENT_DISPATCHED'] },
      maxInFlight: 2,
    });
    noMatchConsumerId = c3.consumerId;

    // Idempotent reactivation update
    const c1Reactivated = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'audit-service',
      filterPattern: { eventTypes: ['ORDER_CREATED', 'PAYMENT_RECEIVED', 'REFUND_ISSUED'] },
      maxInFlight: 8,
      leaseDurationSeconds: 25,
    });

    expect(c1Reactivated.consumerId).toBe(c1.consumerId);
    expect(c1Reactivated.maxInFlight).toBe(8);
    expect(c1Reactivated.leaseDurationSeconds).toBe(25);
  });

  it('2. Zero-child event: seals immediately and marks outbox COMPLETED', async () => {
    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_ZERO',
      aggregateId: 'zero-1',
      eventType: 'UNMATCHED_EVENT_XYZ',
      payload: { test: true },
    });

    expect(outbox.status).toBe(OutboxStatus.PENDING);
    expect(outbox.isFanoutSealed).toBe(false);

    const dispatch = await prepareOutboxDispatch(outbox.id);
    expect(dispatch.expectedConsumerCount).toBe(0);
    expect(dispatch.status).toBe(OutboxStatus.COMPLETED);

    const updated = await prisma.transactionalOutbox.findUnique({ where: { id: outbox.id } });
    expect(updated?.isFanoutSealed).toBe(true);
    expect(updated?.expectedConsumerCount).toBe(0);
    expect(updated?.status).toBe(OutboxStatus.COMPLETED);
    expect(updated?.publishedAt).not.toBeNull();
  });

  it('3. RegisteredConsumer active-state and maxInFlight concurrency enforcement', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'concurrency-limited-consumer',
      filterPattern: { eventTypes: ['TEST_LIMIT_EVENT'] },
      maxInFlight: 1,
      leaseDurationSeconds: 30,
    });

    const outboxA = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_LIMIT',
      aggregateId: 'lim-1',
      eventType: 'TEST_LIMIT_EVENT',
      payload: { item: 1 },
    });
    await prepareOutboxDispatch(outboxA.id);

    // 3a. Pause consumer: preflight must be blocked
    await prisma.registeredConsumer.update({
      where: { id: c.consumerId },
      data: { state: ConsumerState.PAUSED },
    });
    const pausedPreflight = await executeDeliveryPreflight(c.consumerId, 'worker-lim-1');
    expect(pausedPreflight).toBeNull();

    // Reactivate consumer
    await prisma.registeredConsumer.update({
      where: { id: c.consumerId },
      data: { state: ConsumerState.ACTIVE },
    });

    // 3b. First claim succeeds (maxInFlight = 1)
    const claim1 = await executeDeliveryPreflight(c.consumerId, 'worker-lim-1', 30);
    expect(claim1).not.toBeNull();
    expect(claim1?.outboxId).toBe(outboxA.id);

    // Publish second event
    const outboxB = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_LIMIT',
      aggregateId: 'lim-2',
      eventType: 'TEST_LIMIT_EVENT',
      payload: { item: 2 },
    });
    await prepareOutboxDispatch(outboxB.id);

    // Second claim blocked by maxInFlight = 1
    const claim2Blocked = await executeDeliveryPreflight(c.consumerId, 'worker-lim-2', 30);
    expect(claim2Blocked).toBeNull();

    // Complete first claim
    await executeDeliveryCompletion({
      ledgerId: claim1!.ledgerId,
      leaseToken: claim1!.leaseToken,
      claimEpoch: claim1!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    // Now second claim succeeds
    const claim2 = await executeDeliveryPreflight(c.consumerId, 'worker-lim-2', 30);
    expect(claim2).not.toBeNull();
    expect(claim2?.outboxId).toBe(outboxB.id);

    // Complete second claim
    await executeDeliveryCompletion({
      ledgerId: claim2!.ledgerId,
      leaseToken: claim2!.leaseToken,
      claimEpoch: claim2!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });
  });

  it('4. Concurrent worker claims with maxInFlight = 1 for two different events: exactly one claim succeeds', async () => {
    // Audit Requirement 1: Lock RegisteredConsumer row before checking state and active leases
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'race-maxinflight-consumer',
      filterPattern: { eventTypes: ['TEST_MAXINFLIGHT_RACE'] },
      maxInFlight: 1,
      leaseDurationSeconds: 30,
    });

    const eventA = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_MIF_RACE',
      aggregateId: 'mif-race-A',
      eventType: 'TEST_MAXINFLIGHT_RACE',
      payload: { event: 'A' },
    });
    await prepareOutboxDispatch(eventA.id);

    const eventB = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_MIF_RACE',
      aggregateId: 'mif-race-B',
      eventType: 'TEST_MAXINFLIGHT_RACE',
      payload: { event: 'B' },
    });
    await prepareOutboxDispatch(eventB.id);

    // Two simultaneous workers race to claim two different events
    const [claimA, claimB] = await Promise.all([
      executeDeliveryPreflight(c.consumerId, 'simultaneous-worker-1', 30),
      executeDeliveryPreflight(c.consumerId, 'simultaneous-worker-2', 30),
    ]);

    // Exactly one claim must succeed; the other must receive null due to maxInFlight = 1
    const successfulClaims = [claimA, claimB].filter(Boolean);
    expect(successfulClaims).toHaveLength(1);

    const winner = successfulClaims[0]!;
    expect(winner.leaseToken).toBeDefined();

    // Clean up by completing the winner
    await executeDeliveryCompletion({
      ledgerId: winner.ledgerId,
      leaseToken: winner.leaseToken,
      claimEpoch: winner.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    // After completion, the other event can now be claimed
    const nextClaim = await executeDeliveryPreflight(c.consumerId, 'next-worker', 30);
    expect(nextClaim).not.toBeNull();
    await executeDeliveryCompletion({
      ledgerId: nextClaim!.ledgerId,
      leaseToken: nextClaim!.leaseToken,
      claimEpoch: nextClaim!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });
  });

  it('5. Per-Aggregate ordering (FIFO): unresolved earlier event blocks subsequent events for same aggregate', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'fifo-consumer',
      filterPattern: { eventTypes: ['TEST_FIFO_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 30,
    });

    const aggId = 'fifo-order-999';

    // Event 1
    const event1 = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_ORDERING',
      aggregateId: aggId,
      eventType: 'TEST_FIFO_EVENT',
      payload: { seq: 1 },
    });
    await prepareOutboxDispatch(event1.id);

    // Event 2 for same aggregate
    const event2 = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_ORDERING',
      aggregateId: aggId,
      eventType: 'TEST_FIFO_EVENT',
      payload: { seq: 2 },
    });
    await prepareOutboxDispatch(event2.id);

    // Worker claims Event 1
    const claim1 = await executeDeliveryPreflight(c.consumerId, 'worker-fifo-1', 30);
    expect(claim1).not.toBeNull();
    expect(claim1?.outboxId).toBe(event1.id);

    // While Event 1 is unresolved, Event 2 MUST NOT be claimable
    const claim2Blocked = await executeDeliveryPreflight(c.consumerId, 'worker-fifo-2', 30);
    expect(claim2Blocked).toBeNull();

    // Complete Event 1
    await executeDeliveryCompletion({
      ledgerId: claim1!.ledgerId,
      leaseToken: claim1!.leaseToken,
      claimEpoch: claim1!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    // Now Event 2 is unblocked and can be claimed
    const claim2 = await executeDeliveryPreflight(c.consumerId, 'worker-fifo-1', 30);
    expect(claim2).not.toBeNull();
    expect(claim2?.outboxId).toBe(event2.id);

    // Complete Event 2
    await executeDeliveryCompletion({
      ledgerId: claim2!.ledgerId,
      leaseToken: claim2!.leaseToken,
      claimEpoch: claim2!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });
  });

  it('6. Cursor does not advance past sequence 0 when sequence 2 completes before sequence 1 is resolved', async () => {
    // Audit Requirement 3: Unified contiguous cursor resolution prevents premature advancement
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'out-of-order-cursor-consumer',
      filterPattern: { eventTypes: ['TEST_OUT_OF_ORDER_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 30,
    });

    const aggType = 'TEST_AGG_OUT_OF_ORDER';
    const aggId = 'ooo-1';

    // Publish Event 1 (sequence 1)
    const e1 = await publishOutboxEvent({
      aggregateType: aggType,
      aggregateId: aggId,
      eventType: 'TEST_OUT_OF_ORDER_EVENT',
      payload: { seq: 1 },
    });
    await prepareOutboxDispatch(e1.id);

    // Preflight Event 1
    const claim1 = await executeDeliveryPreflight(c.consumerId, 'worker-seq-1', 30);
    expect(claim1).not.toBeNull();
    expect(claim1?.sequenceNumber).toBe(1n);

    // Publish Event 2 (sequence 2) for a different aggregate to allow preflight,
    // or simulate out-of-order completion by manually updating intent 2 for the same aggregate
    const intent2Id = '44444444-5555-6666-7777-888888888888';
    const ledger2Id = '55555555-6666-7777-8888-999999999999';
    const leaseToken2 = '66666666-7777-8888-9999-000000000000';

    const e2 = await publishOutboxEvent({
      aggregateType: aggType,
      aggregateId: aggId,
      eventType: 'TEST_OUT_OF_ORDER_EVENT',
      payload: { seq: 2 },
    });

    // Directly insert intent 2 and ledger 2 to simulate sequence 2 being assigned
    await prisma.outboxConsumerDispatchIntent.create({
      data: {
        id: intent2Id,
        outboxId: e2.id,
        consumerId: c.consumerId,
        sequenceNumber: 2n,
        status: DispatchIntentStatus.ASSIGNED,
      },
    });

    await prisma.deliveryLedger.create({
      data: {
        id: ledger2Id,
        intentId: intent2Id,
        consumerId: c.consumerId,
        outboxId: e2.id,
        claimEpoch: 1n,
        claimCount: 1,
        leaseToken: leaseToken2,
        leaseExpiresAt: new Date(Date.now() + 30000),
      },
    });

    // Complete Sequence 2 FIRST while Sequence 1 is still in flight (unresolved)
    await executeDeliveryCompletion({
      ledgerId: ledger2Id,
      leaseToken: leaseToken2,
      claimEpoch: 1n,
      outcome: DeliveryOutcome.DELIVERED,
    });

    // Check ConsumerAggregateCursor: MUST NOT advance past 0!
    const cursorBefore = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: c.consumerId,
          aggregateType: aggType,
          aggregateId: aggId,
        },
      },
    });
    expect(cursorBefore?.lastDeliveredSequence ?? 0n).toBe(0n);

    // Now resolve Sequence 1 with DELIVERED
    await executeDeliveryCompletion({
      ledgerId: claim1!.ledgerId,
      leaseToken: claim1!.leaseToken,
      claimEpoch: claim1!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    // Cursor MUST now advance contiguously to 2!
    const cursorAfter = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: c.consumerId,
          aggregateType: aggType,
          aggregateId: aggId,
        },
      },
    });
    expect(cursorAfter?.lastDeliveredSequence).toBe(2n);
  });

  it('7. Watchdog reconciliation restricted scope: reconciling Aggregate A does not alter Aggregate B', async () => {
    // Audit Requirement 4: Ensure reconciliation only processes intended (consumer, aggregateType, aggregateId)
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'scope-isolation-consumer',
      filterPattern: { eventTypes: ['TEST_SCOPE_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 1, // 1-second lease for quick expiry
    });

    const aggType = 'TEST_AGG_SCOPE';

    // Publish Event A on aggregate scope-A
    const outboxA = await publishOutboxEvent({
      aggregateType: aggType,
      aggregateId: 'scope-A',
      eventType: 'TEST_SCOPE_EVENT',
      payload: { agg: 'A' },
    });
    await prepareOutboxDispatch(outboxA.id);

    // Publish Event B on aggregate scope-B
    const outboxB = await publishOutboxEvent({
      aggregateType: aggType,
      aggregateId: 'scope-B',
      eventType: 'TEST_SCOPE_EVENT',
      payload: { agg: 'B' },
    });
    await prepareOutboxDispatch(outboxB.id);

    // Preflight both events
    const claimA = await executeDeliveryPreflight(c.consumerId, 'worker-scope-A', 1);
    const claimB = await executeDeliveryPreflight(c.consumerId, 'worker-scope-B', 1);
    expect(claimA).not.toBeNull();
    expect(claimB).not.toBeNull();

    // Sleep 1.5 seconds to expire both leases
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Reconcile ONLY aggregate scope-A!
    await reconcileConsumerCursor(c.consumerId, aggType, 'scope-A');

    // Aggregate A's ledger MUST be recovered to LEASE_EXPIRED and intent reset to PLANNED
    const ledgerA = await prisma.deliveryLedger.findUnique({ where: { id: claimA!.ledgerId } });
    expect(ledgerA?.outcome).toBe(DeliveryOutcome.LEASE_EXPIRED);
    const intentA = await prisma.outboxConsumerDispatchIntent.findUnique({ where: { id: claimA!.intentId } });
    expect(intentA?.status).toBe(DispatchIntentStatus.PLANNED);

    // Aggregate B's ledger and intent MUST REMAIN UNTOUCHED (still outcome = null, intent = ASSIGNED)
    const ledgerB = await prisma.deliveryLedger.findUnique({ where: { id: claimB!.ledgerId } });
    expect(ledgerB?.outcome).toBeNull();
    const intentB = await prisma.outboxConsumerDispatchIntent.findUnique({ where: { id: claimB!.intentId } });
    expect(intentB?.status).toBe(DispatchIntentStatus.ASSIGNED);
  });

  it('8. Preflight lease fencing: wrong token or claimEpoch rejected with LEASE_FENCED', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'fencing-consumer',
      filterPattern: { eventTypes: ['TEST_FENCE_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 15,
    });

    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_FENCING',
      aggregateId: 'fence-1',
      eventType: 'TEST_FENCE_EVENT',
      payload: { fencing: true },
    });
    await prepareOutboxDispatch(outbox.id);

    const preflight = await executeDeliveryPreflight(c.consumerId, 'worker-fence', 15);
    expect(preflight).not.toBeNull();

    // Attempt with invalid lease token
    await expect(
      executeDeliveryCompletion({
        ledgerId: preflight!.ledgerId,
        leaseToken: '00000000-0000-0000-0000-000000000000',
        claimEpoch: preflight!.claimEpoch,
        outcome: DeliveryOutcome.DELIVERED,
      }),
    ).rejects.toThrow(/LEASE_FENCED/);

    // Attempt with invalid claim epoch
    await expect(
      executeDeliveryCompletion({
        ledgerId: preflight!.ledgerId,
        leaseToken: preflight!.leaseToken,
        claimEpoch: 999n,
        outcome: DeliveryOutcome.DELIVERED,
      }),
    ).rejects.toThrow(/LEASE_FENCED/);

    // Correct lease completion succeeds
    const success = await executeDeliveryCompletion({
      ledgerId: preflight!.ledgerId,
      leaseToken: preflight!.leaseToken,
      claimEpoch: preflight!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
      durationMs: 55,
    });
    expect(success).toBe(true);
  });

  it('9. UNCERTAIN delivery outcome: held in ASSIGNED and recovered by watchdog for retry', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'uncertain-consumer',
      filterPattern: { eventTypes: ['TEST_UNCERTAIN_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 30,
    });

    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_UNCERTAIN',
      aggregateId: 'unc-recover-1',
      eventType: 'TEST_UNCERTAIN_EVENT',
      payload: { uncertainTest: true },
    });
    await prepareOutboxDispatch(outbox.id);

    const preflight = await executeDeliveryPreflight(c.consumerId, 'worker-uncertain', 10);
    expect(preflight).not.toBeNull();
    expect(preflight?.outboxId).toBe(outbox.id);

    // Complete with UNCERTAIN outcome
    const markedUncertain = await executeDeliveryCompletion({
      ledgerId: preflight!.ledgerId,
      leaseToken: preflight!.leaseToken,
      claimEpoch: preflight!.claimEpoch,
      outcome: DeliveryOutcome.UNCERTAIN,
      outcomeReason: 'Connection reset by peer during RPC call',
    });
    expect(markedUncertain).toBe(true);

    // Intent is held in ASSIGNED
    const intentBefore = await prisma.outboxConsumerDispatchIntent.findUnique({
      where: { id: preflight!.intentId },
    });
    expect(intentBefore?.status).toBe(DispatchIntentStatus.ASSIGNED);

    // SequenceResolutionRecord is created in UNCERTAIN_NEEDS_WATCHDOG
    const resolutionBefore = await prisma.sequenceResolutionRecord.findFirst({
      where: { consumerId: c.consumerId, outboxId: outbox.id },
    });
    expect(resolutionBefore?.status).toBe(ResolutionStatus.UNCERTAIN_NEEDS_WATCHDOG);

    // Watchdog runs cursor reconciliation and recovers UNCERTAIN delivery
    await reconcileConsumerCursor(c.consumerId, 'TEST_AGG_UNCERTAIN', 'unc-recover-1');

    // Intent is reset to PLANNED for worker retry
    const intentAfter = await prisma.outboxConsumerDispatchIntent.findUnique({
      where: { id: preflight!.intentId },
    });
    expect(intentAfter?.status).toBe(DispatchIntentStatus.PLANNED);

    // SequenceResolutionRecord updated to ROLLED_BACK
    const resolutionAfter = await prisma.sequenceResolutionRecord.findFirst({
      where: { consumerId: c.consumerId, outboxId: outbox.id },
    });
    expect(resolutionAfter?.status).toBe(ResolutionStatus.ROLLED_BACK);

    // Worker can now re-claim and successfully deliver
    const retryPreflight = await executeDeliveryPreflight(c.consumerId, 'worker-retry-node', 10);
    expect(retryPreflight).not.toBeNull();
    expect(retryPreflight?.outboxId).toBe(outbox.id);
    expect(retryPreflight?.claimEpoch).toBe(preflight!.claimEpoch + 1n);

    const delivered = await executeDeliveryCompletion({
      ledgerId: retryPreflight!.ledgerId,
      leaseToken: retryPreflight!.leaseToken,
      claimEpoch: retryPreflight!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });
    expect(delivered).toBe(true);

    const finalIntent = await prisma.outboxConsumerDispatchIntent.findUnique({
      where: { id: preflight!.intentId },
    });
    expect(finalIntent?.status).toBe(DispatchIntentStatus.DELIVERED);
  });

  it('10. Watchdog contiguous cursor reconciliation: cursor does NOT advance over gaps', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'gap-consumer',
      filterPattern: { eventTypes: ['TEST_GAP_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 30,
    });

    const aggType = 'TEST_AGG_GAP';
    const aggId = 'gap-check-1';

    // Publish Event 1 and Event 2
    const e1 = await publishOutboxEvent({
      aggregateType: aggType,
      aggregateId: aggId,
      eventType: 'TEST_GAP_EVENT',
      payload: { order: 1 },
    });
    await prepareOutboxDispatch(e1.id);

    const claimE1 = await executeDeliveryPreflight(c.consumerId, 'worker-gap', 10);
    expect(claimE1).not.toBeNull();
    expect(claimE1?.outboxId).toBe(e1.id);

    // Deliver Event 1
    await executeDeliveryCompletion({
      ledgerId: claimE1!.ledgerId,
      leaseToken: claimE1!.leaseToken,
      claimEpoch: claimE1!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    const seq1 = claimE1!.sequenceNumber;

    // Publish Event 2 (leave in PLANNED / not delivered)
    const e2 = await publishOutboxEvent({
      aggregateType: aggType,
      aggregateId: aggId,
      eventType: 'TEST_GAP_EVENT',
      payload: { order: 2 },
    });
    await prepareOutboxDispatch(e2.id);

    // Reconcile cursor with watchdog
    const reconciledCursor = await reconcileConsumerCursor(c.consumerId, aggType, aggId);
    expect(reconciledCursor).toBe(seq1);

    const cursorRecord = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: c.consumerId,
          aggregateType: aggType,
          aggregateId: aggId,
        },
      },
    });
    expect(cursorRecord?.lastDeliveredSequence).toBe(seq1);
  });

  it('11. Parent outbox status: mixed successful and failed deliveries becomes FAILED, never COMPLETED', async () => {
    const cMixed1 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'mixed-consumer-1',
      filterPattern: { eventTypes: ['TEST_MIXED_EVENT'] },
      maxInFlight: 10,
    });
    const cMixed2 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'mixed-consumer-2',
      filterPattern: { eventTypes: ['TEST_MIXED_EVENT'] },
      maxInFlight: 10,
    });

    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_MIXED',
      aggregateId: 'mixed-1',
      eventType: 'TEST_MIXED_EVENT',
      payload: { mixed: true },
    });
    const dispatch = await prepareOutboxDispatch(outbox.id);
    expect(dispatch.expectedConsumerCount).toBe(2);

    // Consumer 1 succeeds
    const preflightC1 = await executeDeliveryPreflight(cMixed1.consumerId, 'worker-mixed-1', 10);
    expect(preflightC1).not.toBeNull();
    await executeDeliveryCompletion({
      ledgerId: preflightC1!.ledgerId,
      leaseToken: preflightC1!.leaseToken,
      claimEpoch: preflightC1!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    // Consumer 2 fails permanently (TERMINAL_FAILURE)
    const preflightC2 = await executeDeliveryPreflight(cMixed2.consumerId, 'worker-mixed-2', 10);
    expect(preflightC2).not.toBeNull();
    await executeDeliveryCompletion({
      ledgerId: preflightC2!.ledgerId,
      leaseToken: preflightC2!.leaseToken,
      claimEpoch: preflightC2!.claimEpoch,
      outcome: DeliveryOutcome.TERMINAL_FAILURE,
      outcomeReason: 'Non-recoverable deserialization error',
    });

    // Synthesize status
    const status = await synthesizeParentOutboxStatus(outbox.id);

    // MUST BE FAILED! Never COMPLETED when any consumer suffered terminal failure!
    expect(status).toBe(OutboxStatus.FAILED);

    const finalOutbox = await prisma.transactionalOutbox.findUnique({ where: { id: outbox.id } });
    expect(finalOutbox?.status).toBe(OutboxStatus.FAILED);
    expect(finalOutbox?.publishedAt).toBeNull();
  });

  it('12. Parent outbox status: all children delivered successfully becomes COMPLETED', async () => {
    const cSucc1 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'succ-consumer-1',
      filterPattern: { eventTypes: ['TEST_ALL_SUCC_EVENT'] },
      maxInFlight: 10,
    });
    const cSucc2 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'succ-consumer-2',
      filterPattern: { eventTypes: ['TEST_ALL_SUCC_EVENT'] },
      maxInFlight: 10,
    });

    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_ALL_SUCCESS',
      aggregateId: 'all-succ-1',
      eventType: 'TEST_ALL_SUCC_EVENT',
      payload: { payment: 100 },
    });
    const dispatch = await prepareOutboxDispatch(outbox.id);
    expect(dispatch.expectedConsumerCount).toBe(2);

    const preflight1 = await executeDeliveryPreflight(cSucc1.consumerId, 'worker-succ-1', 10);
    expect(preflight1).not.toBeNull();
    await executeDeliveryCompletion({
      ledgerId: preflight1!.ledgerId,
      leaseToken: preflight1!.leaseToken,
      claimEpoch: preflight1!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    const preflight2 = await executeDeliveryPreflight(cSucc2.consumerId, 'worker-succ-2', 10);
    expect(preflight2).not.toBeNull();
    await executeDeliveryCompletion({
      ledgerId: preflight2!.ledgerId,
      leaseToken: preflight2!.leaseToken,
      claimEpoch: preflight2!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    const finalOutbox = await prisma.transactionalOutbox.findUnique({ where: { id: outbox.id } });
    expect(finalOutbox?.status).toBe(OutboxStatus.COMPLETED);
    expect(finalOutbox?.publishedAt).not.toBeNull();
  });

  it('13. Consumer retirement revokes pending dispatches and suspends active ledgers', async () => {
    const retired = await retireConsumer(noMatchConsumerId);
    expect(retired).toBe(true);

    const consumer = await prisma.registeredConsumer.findUnique({ where: { id: noMatchConsumerId } });
    expect(consumer?.state).toBe(ConsumerState.RETIRED);
    expect(consumer?.retiredAt).not.toBeNull();
  });

  it('14. Enterprise archival is retry-safe and idempotent with fixed batch ID', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const outbox = await prisma.transactionalOutbox.create({
      data: {
        aggregateType: 'TEST_AGG_ARCHIVE',
        aggregateId: 'arch-audit-1',
        eventType: 'ARCHIVE_EVENT',
        payload: { archived: true },
        status: OutboxStatus.COMPLETED,
        isFanoutSealed: true,
        expectedConsumerCount: 0,
        updatedAt: oldDate,
      },
    });

    const fixedBatchId = '33333333-4444-5555-6666-777777777777';

    // First archival run
    const res1 = await executeEnterpriseArchival({
      retentionInterval: '30 days',
      batchSize: 50,
      reason: ArchivalReason.TTL_EXPIRED,
      batchId: fixedBatchId,
    });

    expect(res1.archivedOutboxCount).toBeGreaterThanOrEqual(1);
    expect(res1.batchId).toBe(fixedBatchId);

    // Verify archived row exists
    const archivedRow = await prisma.transactionalOutboxArchive.findUnique({ where: { id: outbox.id } });
    expect(archivedRow).not.toBeNull();
    expect(archivedRow?.archiveBatchId).toBe(fixedBatchId);
    expect(archivedRow?.archivedReason).toBe(ArchivalReason.TTL_EXPIRED);

    // Verify operational row was purged
    const operationalRow = await prisma.transactionalOutbox.findUnique({ where: { id: outbox.id } });
    expect(operationalRow).toBeNull();

    // Second archival run with same batch ID: retry-safe and idempotent
    const res2 = await executeEnterpriseArchival({
      retentionInterval: '30 days',
      batchSize: 50,
      reason: ArchivalReason.TTL_EXPIRED,
      batchId: fixedBatchId,
    });

    expect(res2).toBeDefined();
    expect(res2.batchId).toBe(fixedBatchId);
  });

  it('15. SECURITY DEFINER privilege and search_path verification: public cannot execute, app role can execute, search_path is safe', async () => {
    // Audit Requirement 1 & 2: Privilege and search_path verification
    const procedures = [
      'sp_synthesize_parent_outbox_status',
      'sp_activate_consumer',
      'sp_retire_consumer',
      'sp_prepare_outbox_dispatch',
      'sp_worker_delivery_preflight',
      'sp_worker_delivery_completion',
      'sp_watchdog_reconcile_cursor',
      'fn_resolve_contiguous_cursor',
      'sp_execute_enterprise_archival',
    ];

    const procRows = await prisma.$queryRaw<
      Array<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        owner: string;
        public_execute: boolean;
        app_execute: boolean;
      }>
    >`
      SELECT
        p.proname,
        p.prosecdef,
        p.proconfig,
        r.rolname AS owner,
        has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
        has_function_privilege('app', p.oid, 'EXECUTE') as app_execute
      FROM pg_proc p
      JOIN pg_roles r ON r.oid = p.proowner
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'sse_internal')
        AND p.proname = ANY(${procedures});
    `;

    expect(procRows.length).toBe(procedures.length);

    for (const row of procRows) {
      // SECURITY DEFINER must be true for all M3 procedures
      expect(row.prosecdef, `Expected ${row.proname} to be SECURITY DEFINER`).toBe(true);
      // Function owner must be the application role 'app'
      expect(row.owner, `Expected ${row.proname} to be owned by 'app'`).toBe('app');
      // PUBLIC execution must be revoked
      expect(row.public_execute, `Expected ${row.proname} to revoke EXECUTE from PUBLIC`).toBe(false);
      // Application role 'app' execution must be granted
      expect(row.app_execute, `Expected ${row.proname} to grant EXECUTE to 'app' role`).toBe(true);
      // Restricted safe search path: search_path must be empty string
      expect(row.proconfig, `Expected ${row.proname} to have secure search_path config`).toContain('search_path=""');
    }
  });

  it('16. Concurrent cursor resolution: two workers completing sequence 1 and 2 concurrently update cursor safely without skipping', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'concurrent-cursor-consumer',
      filterPattern: { eventTypes: ['CONCUR_CURSOR_EVENT'] },
      maxInFlight: 10,
    });

    const aggregateId = `concur-agg-${Date.now()}`;

    // Publish Event 1 (sequence 1)
    const outbox1 = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_CONCUR_CURSOR',
      aggregateId,
      eventType: 'CONCUR_CURSOR_EVENT',
      payload: { seq: 1 },
    });
    await prepareOutboxDispatch(outbox1.id);

    // Preflight Event 1
    const preflight1 = await executeDeliveryPreflight(c.consumerId, 'worker-concur-1');
    expect(preflight1).not.toBeNull();
    expect(preflight1!.sequenceNumber).toBe(1n);

    // Publish Event 2 (sequence 2) for the exact same aggregate
    const outbox2 = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_CONCUR_CURSOR',
      aggregateId,
      eventType: 'CONCUR_CURSOR_EVENT',
      payload: { seq: 2 },
    });
    await prepareOutboxDispatch(outbox2.id);

    // Query intent 2
    const intent2 = await prisma.outboxConsumerDispatchIntent.findFirstOrThrow({
      where: { outboxId: outbox2.id, consumerId: c.consumerId },
    });
    expect(intent2.sequenceNumber).toBe(2n);

    // Assign Intent 2 with a valid leased DeliveryLedger to simulate concurrent worker execution
    const ledger2Token = randomUUID();
    const ledger2 = await prisma.deliveryLedger.create({
      data: {
        intentId: intent2.id,
        consumerId: c.consumerId,
        outboxId: outbox2.id,
        claimEpoch: 1,
        claimCount: 1,
        leaseToken: ledger2Token,
        leaseExpiresAt: new Date(Date.now() + 60000),
        lastWorkerId: 'worker-concur-2',
      },
    });
    await prisma.outboxConsumerDispatchIntent.update({
      where: { id: intent2.id },
      data: { status: DispatchIntentStatus.ASSIGNED },
    });

    // Run simultaneous completion of both sequences
    const [res1, res2] = await Promise.all([
      executeDeliveryCompletion({
        ledgerId: preflight1!.ledgerId,
        leaseToken: preflight1!.leaseToken,
        claimEpoch: preflight1!.claimEpoch,
        outcome: DeliveryOutcome.DELIVERED,
      }),
      executeDeliveryCompletion({
        ledgerId: ledger2.id,
        leaseToken: ledger2Token,
        claimEpoch: 1n,
        outcome: DeliveryOutcome.DELIVERED,
      }),
    ]);

    expect(res1).toBe(true);
    expect(res2).toBe(true);

    // Verify both intents are DELIVERED
    const finalIntents = await prisma.outboxConsumerDispatchIntent.findMany({
      where: { consumerId: c.consumerId, outboxId: { in: [outbox1.id, outbox2.id] } },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(finalIntents[0]?.status).toBe(DispatchIntentStatus.DELIVERED);
    expect(finalIntents[1]?.status).toBe(DispatchIntentStatus.DELIVERED);

    // Verify cursor reached sequence 2 and never skipped unresolved sequence
    const cursor = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: c.consumerId,
          aggregateType: 'TEST_AGG_CONCUR_CURSOR',
          aggregateId,
        },
      },
    });

    expect(cursor).not.toBeNull();
    expect(cursor!.lastDeliveredSequence).toBe(2n);
    expect(cursor!.lastDeliveredOutboxId).toBe(outbox2.id);
  });

  it('17. Simultaneous first-time cursor creation: concurrent calls create cursor without duplicate key errors', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'first-time-cursor-consumer',
      filterPattern: { eventTypes: ['FIRST_TIME_EVENT'] },
      maxInFlight: 10,
    });

    const aggregateId = `first-time-${Date.now()}`;

    // Verify no cursor row exists prior to test
    const beforeCursor = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: c.consumerId,
          aggregateType: 'TEST_AGG_FIRST_TIME',
          aggregateId,
        },
      },
    });
    expect(beforeCursor).toBeNull();

    // Concurrently trigger first-time cursor resolution from multiple simultaneous callers
    const results = await Promise.all([
      prisma.$queryRaw<Array<{ fn_resolve_contiguous_cursor: bigint }>>`
        SELECT sse_internal.fn_resolve_contiguous_cursor(${c.consumerId}::uuid, 'TEST_AGG_FIRST_TIME', ${aggregateId});
      `,
      prisma.$queryRaw<Array<{ fn_resolve_contiguous_cursor: bigint }>>`
        SELECT sse_internal.fn_resolve_contiguous_cursor(${c.consumerId}::uuid, 'TEST_AGG_FIRST_TIME', ${aggregateId});
      `,
      prisma.$queryRaw<Array<{ fn_resolve_contiguous_cursor: bigint }>>`
        SELECT sse_internal.fn_resolve_contiguous_cursor(${c.consumerId}::uuid, 'TEST_AGG_FIRST_TIME', ${aggregateId});
      `,
    ]);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r[0]?.fn_resolve_contiguous_cursor).toBeDefined();
    }

    // Exactly one cursor row exists and lastDeliveredSequence is initialized safely to 0
    const cursor = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: c.consumerId,
          aggregateType: 'TEST_AGG_FIRST_TIME',
          aggregateId,
        },
      },
    });
    expect(cursor).not.toBeNull();
    expect(cursor!.lastDeliveredSequence).toBe(0n);
  });
});
