import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger';
import type { OutboxEventInput } from './outbox.types';
import { OutboxStatus } from './outbox.types';

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Publishes an event durably into the TransactionalOutbox table.
 * Must be executed inside the business transaction to ensure atomicity.
 */
export async function publishOutboxEvent(
  input: OutboxEventInput,
  client: DbClient = prisma,
) {
  const event = await client.transactionalOutbox.create({
    data: {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue,
      headers: (input.headers ?? {}) as Prisma.InputJsonValue,
      status: OutboxStatus.PENDING,
      scheduledAt: input.scheduledAt ?? new Date(),
      maxRetries: input.maxRetries ?? 5,
    },
  });

  logger.debug(
    { outboxId: event.id, eventType: event.eventType, aggregateId: event.aggregateId },
    'Transactional outbox event published',
  );

  return event;
}

/**
 * Prepares the fan-out dispatch for an outbox record using sp_prepare_outbox_dispatch.
 * Locks consumers in deterministic order, creates per-consumer intents and delivery ledgers,
 * and seals the fan-out boundary.
 */
export async function prepareOutboxDispatch(
  outboxId: string,
  client: DbClient = prisma,
): Promise<{
  outboxId: string;
  status: OutboxStatus;
  expectedConsumerCount: number;
  intentsCreated: number;
}> {
  const result = await client.$queryRaw<
    Array<{
      outbox_id: string;
      status: OutboxStatus;
      expected_consumer_count: number;
      intents_created: number;
    }>
  >`SELECT * FROM sp_prepare_outbox_dispatch(${outboxId}::uuid);`;

  const row = result[0];
  if (!row) {
    throw new Error(`sp_prepare_outbox_dispatch returned empty result for outbox ${outboxId}`);
  }

  return {
    outboxId: row.outbox_id,
    status: row.status,
    expectedConsumerCount: row.expected_consumer_count,
    intentsCreated: row.intents_created,
  };
}

/**
 * Explicitly triggers parent outbox status synthesis via sp_synthesize_parent_outbox_status.
 */
export async function synthesizeParentOutboxStatus(
  outboxId: string,
  client: DbClient = prisma,
): Promise<OutboxStatus> {
  const result = await client.$queryRaw<Array<{ sp_synthesize_parent_outbox_status: OutboxStatus }>>`
    SELECT sp_synthesize_parent_outbox_status(${outboxId}::uuid);
  `;
  return result[0]?.sp_synthesize_parent_outbox_status ?? OutboxStatus.PENDING;
}

/**
 * Retrieves an outbox record with its dispatch intents and delivery ledgers.
 */
export async function getOutboxDetails(outboxId: string) {
  return prisma.transactionalOutbox.findUnique({
    where: { id: outboxId },
    include: {
      dispatchIntents: {
        include: {
          deliveryLedgers: true,
          consumer: true,
        },
      },
      deliveryLedgers: true,
      resolutionRecords: true,
    },
  });
}
