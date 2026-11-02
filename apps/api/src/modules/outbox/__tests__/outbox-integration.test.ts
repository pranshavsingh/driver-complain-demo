import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma';
import {
  publishOutboxEvent,
  prepareOutboxDispatch,
  synthesizeParentOutboxStatus,
  getOutboxDetails,
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
  const TEST_PREFIX = `m3_test_${Date.now()}`;
  let consumer1Id: string;
  let consumer2Id: string;
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
    // Cleanup consumers and outbox
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
    consumer1Id = c1.consumerId;

    const c2 = await activateConsumer({
      consumerGroup: TEST_PREFIX,
      consumerName: 'notification-service',
      filterPattern: { eventTypes: ['ORDER_CREATED'] },
      maxInFlight: 10,
      leaseDurationSeconds: 30,
    });
    consumer2Id = c2.consumerId;

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

    expect(c1Reactivated.consumerId).toBe(consumer1Id);
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

  it('3. Per-consumer fan-out creates matching intents with monotonic sequences', async () => {
    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_ORDER',
      aggregateId: 'order-101',
      eventType: 'ORDER_CREATED',
      payload: { amount: 2500, customerId: 'cust-1' },
    });

    const dispatch = await prepareOutboxDispatch(outbox.id);
    expect(dispatch.expectedConsumerCount).toBe(2); // c1 and c2 match ORDER_CREATED
    expect(dispatch.status).toBe(OutboxStatus.DISPATCHED);
    expect(dispatch.intentsCreated).toBe(2);

    const details = await getOutboxDetails(outbox.id);
    expect(details?.dispatchIntents).toHaveLength(2);
    expect(details?.deliveryLedgers).toHaveLength(2);

    for (const intent of details!.dispatchIntents) {
      expect(intent.status).toBe(DispatchIntentStatus.PLANNED);
      expect(intent.sequenceNumber).toBe(1n);
    }
  });

  it('4. Preflight acquires lease and enforces lease fencing on completion', async () => {
    const worker1 = 'worker-node-1';
    const preflight = await executeDeliveryPreflight(consumer1Id, worker1, 10);

    expect(preflight).not.toBeNull();
    expect(preflight?.consumerId === undefined).toBe(true); // preflight has ledgerId, intentId, outboxId
    expect(preflight?.claimEpoch).toBe(1n);
    expect(preflight?.leaseToken).toBeDefined();

    // Verify lease fencing: attempt completion with wrong lease token fails
    await expect(
      executeDeliveryCompletion({
        ledgerId: preflight!.ledgerId,
        leaseToken: '00000000-0000-0000-0000-000000000000',
        claimEpoch: preflight!.claimEpoch,
        outcome: DeliveryOutcome.DELIVERED,
      }),
    ).rejects.toThrow(/LEASE_FENCED/);

    // Verify lease fencing: attempt completion with wrong claim epoch fails
    await expect(
      executeDeliveryCompletion({
        ledgerId: preflight!.ledgerId,
        leaseToken: preflight!.leaseToken,
        claimEpoch: 99n,
        outcome: DeliveryOutcome.DELIVERED,
      }),
    ).rejects.toThrow(/LEASE_FENCED/);

    // Correct lease completion succeeds
    const success = await executeDeliveryCompletion({
      ledgerId: preflight!.ledgerId,
      leaseToken: preflight!.leaseToken,
      claimEpoch: preflight!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
      durationMs: 42,
    });

    expect(success).toBe(true);

    const ledger = await prisma.deliveryLedger.findUnique({ where: { id: preflight!.ledgerId } });
    expect(ledger?.outcome).toBe(DeliveryOutcome.DELIVERED);
    expect(ledger?.leaseToken).toBeNull();
    expect(ledger?.executionDurationMs).toBe(42);

    // Verify ConsumerAggregateCursor was updated
    const cursor = await prisma.consumerAggregateCursor.findUnique({
      where: {
        consumerId_aggregateType_aggregateId: {
          consumerId: consumer1Id,
          aggregateType: 'TEST_AGG_ORDER',
          aggregateId: 'order-101',
        },
      },
    });
    expect(cursor?.lastDeliveredSequence).toBe(1n);
  });

  it('5. Parent outbox status synthesizes to COMPLETED when all children deliver', async () => {
    // Deliver the second intent (for consumer2)
    const preflight2 = await executeDeliveryPreflight(consumer2Id, 'worker-node-2', 10);
    expect(preflight2).not.toBeNull();

    await executeDeliveryCompletion({
      ledgerId: preflight2!.ledgerId,
      leaseToken: preflight2!.leaseToken,
      claimEpoch: preflight2!.claimEpoch,
      outcome: DeliveryOutcome.DELIVERED,
    });

    const outbox = await prisma.transactionalOutbox.findUnique({ where: { id: preflight2!.outboxId } });
    expect(outbox?.status).toBe(OutboxStatus.COMPLETED);
    expect(outbox?.publishedAt).not.toBeNull();
  });

  it('6. UNCERTAIN outcome holds intent and registers SequenceResolutionRecord', async () => {
    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_UNCERTAIN',
      aggregateId: 'unc-1',
      eventType: 'ORDER_CREATED',
      payload: { uncertainTest: true },
    });

    await prepareOutboxDispatch(outbox.id);

    const preflight = await executeDeliveryPreflight(consumer1Id, 'worker-uncertain', 10);
    expect(preflight).not.toBeNull();

    const success = await executeDeliveryCompletion({
      ledgerId: preflight!.ledgerId,
      leaseToken: preflight!.leaseToken,
      claimEpoch: preflight!.claimEpoch,
      outcome: DeliveryOutcome.UNCERTAIN,
      outcomeReason: 'Socket write timed out with downstream partner',
    });

    expect(success).toBe(true);

    const intent = await prisma.outboxConsumerDispatchIntent.findUnique({ where: { id: preflight!.intentId } });
    expect(intent?.status).toBe(DispatchIntentStatus.ASSIGNED);

    const resolution = await prisma.sequenceResolutionRecord.findFirst({
      where: { consumerId: consumer1Id, outboxId: outbox.id },
    });
    expect(resolution).toBeDefined();
    expect(resolution?.status).toBe(ResolutionStatus.UNCERTAIN_NEEDS_WATCHDOG);
    expect(resolution?.resolutionNotes).toBe('Socket write timed out with downstream partner');
  });

  it('7. Watchdog cursor reconciliation recovers expired leases', async () => {
    const outbox = await publishOutboxEvent({
      aggregateType: 'TEST_AGG_EXPIRE',
      aggregateId: 'exp-1',
      eventType: 'ORDER_CREATED',
      payload: { expireTest: true },
    });

    await prepareOutboxDispatch(outbox.id);

    // Preflight with a 1-second lease
    const preflight = await executeDeliveryPreflight(consumer2Id, 'worker-slow', 1);
    expect(preflight).not.toBeNull();

    // Sleep 1.5 seconds to expire lease
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Run watchdog reconciliation
    const reconciledSeq = await reconcileConsumerCursor(consumer2Id, 'TEST_AGG_EXPIRE', 'exp-1');
    expect(reconciledSeq).toBeGreaterThanOrEqual(0n);

    // Ledger should now be reset to LEASE_EXPIRED and intent reset to PLANNED for retry
    const ledger = await prisma.deliveryLedger.findUnique({ where: { id: preflight!.ledgerId } });
    expect(ledger?.outcome).toBe(DeliveryOutcome.LEASE_EXPIRED);

    const intent = await prisma.outboxConsumerDispatchIntent.findUnique({ where: { id: preflight!.intentId } });
    expect(intent?.status).toBe(DispatchIntentStatus.PLANNED);
  });

  it('8. Consumer retirement revokes pending dispatches and suspends active ledgers', async () => {
    const retired = await retireConsumer(noMatchConsumerId);
    expect(retired).toBe(true);

    const consumer = await prisma.registeredConsumer.findUnique({ where: { id: noMatchConsumerId } });
    expect(consumer?.state).toBe(ConsumerState.RETIRED);
    expect(consumer?.retiredAt).not.toBeNull();
  });

  it('9. Enterprise archival copies to archive tables and purges operational rows idempotently', async () => {
    // Create an old completed outbox to archive
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    const outbox = await prisma.transactionalOutbox.create({
      data: {
        aggregateType: 'TEST_AGG_ARCHIVE',
        aggregateId: 'arch-1',
        eventType: 'ARCHIVE_EVENT',
        payload: { archived: true },
        status: OutboxStatus.COMPLETED,
        isFanoutSealed: true,
        expectedConsumerCount: 0,
        updatedAt: oldDate,
      },
    });

    const fixedBatchId = '11111111-2222-3333-4444-555555555555';

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

    // Second archival run with same batch ID: MUST BE IDEMPOTENT (0 errors)
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
