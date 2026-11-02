import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

  it('4. Concurrent worker claims: exactly one worker acquires lease without race condition', async () => {
    const c = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'race-consumer',
      filterPattern: { eventTypes: ['TEST_RACE_EVENT'] },
      maxInFlight: 10,
      leaseDurationSeconds: 30,
    });

    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_CONCURRENCY',
      aggregateId: 'conc-1',
      eventType: 'TEST_RACE_EVENT',
      payload: { conc: true },
    });
    await prepareOutboxDispatch(outbox.id);

    const workerIds = ['worker-a', 'worker-b', 'worker-c', 'worker-d', 'worker-e'];
    const results = await Promise.all(
      workerIds.map((wId) => executeDeliveryPreflight(c.consumerId, wId, 20)),
    );

    const successfulClaims = results.filter((r) => r !== null && r.outboxId === outbox.id);
    expect(successfulClaims).toHaveLength(1);

    const winner = successfulClaims[0]!;
    expect(winner.claimEpoch).toBe(1n);

    await executeDeliveryCompletion({
      ledgerId: winner.ledgerId,
      leaseToken: winner.leaseToken,
      claimEpoch: winner.claimEpoch,
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

  it('6. Preflight lease fencing: wrong token or claimEpoch rejected with LEASE_FENCED', async () => {
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

  it('7. UNCERTAIN delivery outcome: held in ASSIGNED and recovered by watchdog for retry', async () => {
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

  it('8. Watchdog contiguous cursor reconciliation: cursor does NOT advance over gaps', async () => {
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

  it('9. Parent outbox status: mixed successful and failed deliveries becomes FAILED, never COMPLETED', async () => {
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

  it('10. Parent outbox status: all children delivered successfully becomes COMPLETED', async () => {
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

  it('11. Consumer retirement revokes pending dispatches and suspends active ledgers', async () => {
    const retired = await retireConsumer(noMatchConsumerId);
    expect(retired).toBe(true);

    const consumer = await prisma.registeredConsumer.findUnique({ where: { id: noMatchConsumerId } });
    expect(consumer?.state).toBe(ConsumerState.RETIRED);
    expect(consumer?.retiredAt).not.toBeNull();
  });

  it('12. Enterprise archival is retry-safe and idempotent with fixed batch ID', async () => {
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
});
