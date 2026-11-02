import {
  OutboxStatus,
  ConsumerState,
  DispatchIntentStatus,
  DeliveryOutcome,
  ResolutionStatus,
  ArchivalReason,
} from '@prisma/client';

export {
  OutboxStatus,
  ConsumerState,
  DispatchIntentStatus,
  DeliveryOutcome,
  ResolutionStatus,
  ArchivalReason,
};

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
  scheduledAt?: Date;
  maxRetries?: number;
}

export interface ConsumerRegistrationInput {
  consumerGroup: string;
  consumerName: string;
  filterPattern?: {
    eventTypes?: string[];
    [key: string]: unknown;
  };
  maxInFlight?: number;
  leaseDurationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface DeliveryPreflightResult {
  ledgerId: string;
  intentId: string;
  outboxId: string;
  sequenceNumber: bigint;
  leaseToken: string;
  claimEpoch: bigint;
  leaseExpiresAt: Date;
  payload: Record<string, unknown>;
  headers: Record<string, unknown> | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
}

export interface DeliveryCompletionInput {
  ledgerId: string;
  leaseToken: string;
  claimEpoch: bigint;
  outcome: DeliveryOutcome;
  outcomeReason?: string;
  durationMs?: number;
}

export type ConsumerHandler = (
  event: DeliveryPreflightResult,
) => Promise<{ outcome: DeliveryOutcome; reason?: string }>;
