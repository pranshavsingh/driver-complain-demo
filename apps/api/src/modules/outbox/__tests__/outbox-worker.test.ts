import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { publishOutboxEvent, getOutboxDetails } from '../outbox.service';
import { activateConsumer, registerConsumerHandler } from '../consumer.service';
import { dispatchPendingOutboxEvents } from '../dispatcher.service';
import { startOutboxWorkers, stopOutboxWorkers } from '../outbox.worker';
import { OutboxStatus, DeliveryOutcome } from '../outbox.types';

const isPostgres = (process.env.DATABASE_URL ?? '').startsWith('postgres');

describe.skipIf(!isPostgres)('Milestone 3: Outbox Worker & Lifecycle Tests', () => {
  const TEST_GROUP = `worker_grp_${Date.now()}`;
  let consumerId: string;
  const receivedPayloads: unknown[] = [];

  beforeAll(async () => {
    // Clean up any stale consumers from previous runs
    await prisma.deliveryLedger.deleteMany({
      where: { outbox: { aggregateType: 'WORKER_TEST_AGG' } },
    });
    await prisma.outboxConsumerDispatchIntent.deleteMany({
      where: { outbox: { aggregateType: 'WORKER_TEST_AGG' } },
    });
    await prisma.consumerAggregateCursor.deleteMany({
      where: { consumer: { consumerName: 'live-worker-consumer' } },
    });
    await prisma.registeredConsumer.deleteMany({
      where: { consumerName: 'live-worker-consumer' },
    });

    // Register consumer and handler
    const consumer = await activateConsumer({
      consumerGroup: TEST_GROUP,
      consumerName: 'live-worker-consumer',
      filterPattern: { eventTypes: ['WORKER_TEST_EVENT'] },
      maxInFlight: 5,
    });
    consumerId = consumer.consumerId;

    registerConsumerHandler('live-worker-consumer', async (event) => {
      receivedPayloads.push(event.payload);
      return { outcome: DeliveryOutcome.DELIVERED };
    });
  });

  afterAll(async () => {
    await stopOutboxWorkers();
    await prisma.deliveryLedger.deleteMany({
      where: { outbox: { aggregateType: 'WORKER_TEST_AGG' } },
    });
    await prisma.outboxConsumerDispatchIntent.deleteMany({
      where: { outbox: { aggregateType: 'WORKER_TEST_AGG' } },
    });
    await prisma.consumerAggregateCursor.deleteMany({
      where: { consumerId },
    });
    await prisma.transactionalOutbox.deleteMany({
      where: { aggregateType: 'WORKER_TEST_AGG' },
    });
    await prisma.registeredConsumer.deleteMany({
      where: { id: consumerId },
    });
  });

  it('verifies worker lifecycle and dispatch/delivery processing', async () => {
    await startOutboxWorkers();

    const outbox = await publishOutboxEvent({
      aggregateType: 'WORKER_TEST_AGG',
      aggregateId: 'agg-worker-1',
      eventType: 'WORKER_TEST_EVENT',
      payload: { greeting: 'hello-from-outbox-worker' },
    });

    expect(outbox.status).toBe(OutboxStatus.PENDING);

    // Trigger dispatcher sweep
    const sweep = await dispatchPendingOutboxEvents();
    expect(sweep.dispatchedCount).toBeGreaterThanOrEqual(1);
    expect(sweep.intentsCreated).toBeGreaterThanOrEqual(1);

    // Process delivery for this consumer
    const { processDeliveryForConsumer } = await import('../consumer.service');
    const deliveryResult = await processDeliveryForConsumer(consumerId, 'live-worker-consumer', 'test-runner-1');
    expect(deliveryResult.processed).toBe(true);
    expect(deliveryResult.outcome).toBe(DeliveryOutcome.DELIVERED);

    // Verify handler received the payload
    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0]).toEqual({ greeting: 'hello-from-outbox-worker' });

    // Verify parent status was synthesized to COMPLETED
    const details = await getOutboxDetails(outbox.id);
    expect(details?.status).toBe(OutboxStatus.COMPLETED);

    // Graceful shutdown
    await stopOutboxWorkers();
  });
});
