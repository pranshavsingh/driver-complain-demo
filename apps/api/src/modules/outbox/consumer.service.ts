import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger';
import type {
  ConsumerRegistrationInput,
  DeliveryPreflightResult,
  DeliveryCompletionInput,
  ConsumerHandler,
} from './outbox.types';
import { ConsumerState, DeliveryOutcome } from './outbox.types';
import { recordOutboxDelivery } from './outbox.metrics';

type DbClient = typeof prisma | Prisma.TransactionClient;

const consumerHandlers = new Map<string, ConsumerHandler>();

/**
 * Registers an event-handling callback for a given consumer name.
 */
export function registerConsumerHandler(consumerName: string, handler: ConsumerHandler): void {
  consumerHandlers.set(consumerName, handler);
}

/**
 * Activates or upserts a registered consumer in PostgreSQL using sp_activate_consumer.
 */
export async function activateConsumer(
  input: ConsumerRegistrationInput,
  client: DbClient = prisma,
): Promise<{
  consumerId: string;
  consumerGroup: string;
  consumerName: string;
  state: ConsumerState;
  filterPattern: unknown;
  maxInFlight: number;
  leaseDurationSeconds: number;
}> {
  const filterJson = input.filterPattern ? JSON.stringify(input.filterPattern) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const rows = await client.$queryRaw<
    Array<{
      consumer_id: string;
      consumer_group: string;
      consumer_name: string;
      state: ConsumerState;
      filter_pattern: unknown;
      max_in_flight: number;
      lease_duration_seconds: number;
    }>
  >`
    SELECT * FROM sp_activate_consumer(
      ${input.consumerGroup},
      ${input.consumerName},
      ${filterJson}::jsonb,
      ${input.maxInFlight ?? 10}::integer,
      ${input.leaseDurationSeconds ?? 30}::integer,
      ${metadataJson}::jsonb
    );
  `;

  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to activate consumer ${input.consumerGroup}:${input.consumerName}`);
  }

  return {
    consumerId: row.consumer_id,
    consumerGroup: row.consumer_group,
    consumerName: row.consumer_name,
    state: row.state,
    filterPattern: row.filter_pattern,
    maxInFlight: row.max_in_flight,
    leaseDurationSeconds: row.lease_duration_seconds,
  };
}

/**
 * Retires an active consumer, revoking pending dispatches and suspending active ledgers.
 */
export async function retireConsumer(consumerId: string, client: DbClient = prisma): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ sp_retire_consumer: boolean }>>`
    SELECT sp_retire_consumer(${consumerId}::uuid);
  `;
  return rows[0]?.sp_retire_consumer ?? false;
}

/**
 * Preflights the next eligible delivery for a consumer, acquiring a leased delivery ledger.
 */
export async function executeDeliveryPreflight(
  consumerId: string,
  workerId: string,
  leaseDurationSeconds = 30,
  client: DbClient = prisma,
): Promise<DeliveryPreflightResult | null> {
  const rows = await client.$queryRaw<
    Array<{
      ledger_id: string;
      intent_id: string;
      outbox_id: string;
      sequence_number: bigint;
      lease_token: string;
      claim_epoch: bigint;
      lease_expires_at: Date;
      payload: Record<string, unknown>;
      headers: Record<string, unknown> | null;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
    }>
  >`
    SELECT * FROM sp_worker_delivery_preflight(
      ${consumerId}::uuid,
      ${workerId},
      ${leaseDurationSeconds}::integer
    );
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    ledgerId: row.ledger_id,
    intentId: row.intent_id,
    outboxId: row.outbox_id,
    sequenceNumber: BigInt(row.sequence_number),
    leaseToken: row.lease_token,
    claimEpoch: BigInt(row.claim_epoch),
    leaseExpiresAt: new Date(row.lease_expires_at),
    payload: row.payload,
    headers: row.headers,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
  };
}

/**
 * Completes a delivery attempt with fenced lease verification.
 */
export async function executeDeliveryCompletion(
  input: DeliveryCompletionInput,
  client: DbClient = prisma,
): Promise<boolean> {
  const durationParam = input.durationMs !== undefined && input.durationMs !== null ? input.durationMs : null;
  const rows = await client.$queryRaw<Array<{ sp_worker_delivery_completion: boolean }>>`
    SELECT sp_worker_delivery_completion(
      ${input.ledgerId}::uuid,
      ${input.leaseToken}::uuid,
      ${input.claimEpoch}::bigint,
      ${input.outcome}::"DeliveryOutcome",
      ${input.outcomeReason ?? null},
      ${durationParam}::integer
    );
  `;
  return rows[0]?.sp_worker_delivery_completion ?? false;
}

/**
 * Executes a single complete delivery cycle for a consumer:
 * 1. Preflight lease acquisition
 * 2. Invocating consumer registered handler
 * 3. Fenced completion commit
 */
export async function processDeliveryForConsumer(
  consumerId: string,
  consumerName: string,
  workerId: string,
): Promise<{ processed: boolean; outcome?: DeliveryOutcome }> {
  const preflight = await executeDeliveryPreflight(consumerId, workerId);
  if (!preflight) {
    return { processed: false };
  }

  const handler = consumerHandlers.get(consumerName);
  if (!handler) {
    logger.warn({ consumerName, consumerId }, 'No handler registered for consumer');
    await executeDeliveryCompletion({
      ledgerId: preflight.ledgerId,
      leaseToken: preflight.leaseToken,
      claimEpoch: preflight.claimEpoch,
      outcome: DeliveryOutcome.RETRIABLE_FAILURE,
      outcomeReason: `No handler registered for consumer: ${consumerName}`,
    });
    return { processed: true, outcome: DeliveryOutcome.RETRIABLE_FAILURE };
  }

  const startTime = Date.now();
  let outcome: DeliveryOutcome = DeliveryOutcome.DELIVERED;
  let reason: string | undefined;

  try {
    const res = await handler(preflight);
    outcome = res.outcome;
    reason = res.reason;
  } catch (err) {
    logger.error({ err, consumerName, intentId: preflight.intentId }, 'Consumer handler failed with error');
    outcome = DeliveryOutcome.RETRIABLE_FAILURE;
    reason = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startTime;

  await executeDeliveryCompletion({
    ledgerId: preflight.ledgerId,
    leaseToken: preflight.leaseToken,
    claimEpoch: preflight.claimEpoch,
    outcome,
    outcomeReason: reason,
    durationMs,
  });

  if (outcome === DeliveryOutcome.DELIVERED) {
    recordOutboxDelivery('success', 1);
  } else if (outcome === DeliveryOutcome.RETRIABLE_FAILURE) {
    recordOutboxDelivery('retry', 1);
  } else {
    recordOutboxDelivery('failure', 1);
  }
  return { processed: true, outcome };
}
