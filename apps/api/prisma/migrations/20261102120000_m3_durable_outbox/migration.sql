-- ──────────────────────────────────────────────────────────────
-- Milestone 3: Durable Outbox & Enterprise Reliable Dispatch
-- ──────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsumerState" AS ENUM ('ACTIVE', 'PAUSED', 'DRAINING', 'RETIRED', 'BLOCKED', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "DispatchIntentStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'DELIVERED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('DELIVERED', 'RETRIABLE_FAILURE', 'TERMINAL_FAILURE', 'LEASE_EXPIRED', 'SUSPENDED_BY_RETIREMENT', 'REVOKED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('IN_FLIGHT', 'COMMITTED', 'ROLLED_BACK', 'UNCERTAIN_NEEDS_WATCHDOG', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "ArchivalReason" AS ENUM ('TTL_EXPIRED', 'RETIREMENT_SWEEP', 'REGULATORY_HOLD', 'MANUAL_PURGE', 'DLQ_DRAIN');

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS sse_internal;

-- CreateTable
CREATE TABLE "RegisteredConsumer" (
    "id" UUID NOT NULL,
    "consumerGroup" TEXT NOT NULL,
    "consumerName" TEXT NOT NULL,
    "state" "ConsumerState" NOT NULL DEFAULT 'ACTIVE',
    "filterPattern" JSONB,
    "maxInFlight" INTEGER NOT NULL DEFAULT 10,
    "leaseDurationSeconds" INTEGER NOT NULL DEFAULT 30,
    "retiredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisteredConsumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionalOutbox" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "isFanoutSealed" BOOLEAN NOT NULL DEFAULT false,
    "expectedConsumerCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionalOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxConsumerDispatchIntent" (
    "id" UUID NOT NULL,
    "outboxId" UUID NOT NULL,
    "consumerId" UUID NOT NULL,
    "sequenceNumber" BIGINT NOT NULL,
    "status" "DispatchIntentStatus" NOT NULL DEFAULT 'PLANNED',
    "deliveredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxConsumerDispatchIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLedger" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "consumerId" UUID NOT NULL,
    "outboxId" UUID NOT NULL,
    "claimEpoch" BIGINT NOT NULL DEFAULT 0,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastWorkerId" TEXT,
    "outcome" "DeliveryOutcome",
    "outcomeReason" TEXT,
    "executionDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerAggregateCursor" (
    "id" UUID NOT NULL,
    "consumerId" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "lastDeliveredSequence" BIGINT NOT NULL DEFAULT 0,
    "lastDeliveredOutboxId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumerAggregateCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceResolutionRecord" (
    "id" UUID NOT NULL,
    "consumerId" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "sequenceNumber" BIGINT NOT NULL,
    "outboxId" UUID NOT NULL,
    "status" "ResolutionStatus" NOT NULL DEFAULT 'IN_FLIGHT',
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceResolutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionalOutboxArchive" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "status" "OutboxStatus" NOT NULL,
    "isFanoutSealed" BOOLEAN NOT NULL,
    "expectedConsumerCount" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "maxRetries" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archiveBatchId" UUID NOT NULL,
    "archivedReason" "ArchivalReason" NOT NULL,
    "archivedTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionalOutboxArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxConsumerDispatchIntentArchive" (
    "id" UUID NOT NULL,
    "outboxId" UUID NOT NULL,
    "consumerId" UUID NOT NULL,
    "sequenceNumber" BIGINT NOT NULL,
    "status" "DispatchIntentStatus" NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archiveBatchId" UUID NOT NULL,
    "archivedReason" "ArchivalReason" NOT NULL,
    "archivedTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxConsumerDispatchIntentArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLedgerArchive" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "consumerId" UUID NOT NULL,
    "outboxId" UUID NOT NULL,
    "claimEpoch" BIGINT NOT NULL,
    "claimCount" INTEGER NOT NULL,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastWorkerId" TEXT,
    "outcome" "DeliveryOutcome",
    "outcomeReason" TEXT,
    "executionDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archiveBatchId" UUID NOT NULL,
    "archivedReason" "ArchivalReason" NOT NULL,
    "archivedTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLedgerArchive_pkey" PRIMARY KEY ("id")
);

-- Indexes & Unique Constraints
CREATE INDEX "RegisteredConsumer_state_idx" ON "RegisteredConsumer"("state");
CREATE INDEX "RegisteredConsumer_consumerGroup_idx" ON "RegisteredConsumer"("consumerGroup");
CREATE UNIQUE INDEX "RegisteredConsumer_consumerGroup_consumerName_key" ON "RegisteredConsumer"("consumerGroup", "consumerName");

CREATE INDEX "TransactionalOutbox_status_scheduledAt_idx" ON "TransactionalOutbox"("status", "scheduledAt");
CREATE INDEX "TransactionalOutbox_aggregateType_aggregateId_idx" ON "TransactionalOutbox"("aggregateType", "aggregateId");
CREATE INDEX "TransactionalOutbox_createdAt_idx" ON "TransactionalOutbox"("createdAt");

CREATE INDEX "OutboxConsumerDispatchIntent_consumerId_status_idx" ON "OutboxConsumerDispatchIntent"("consumerId", "status");
CREATE INDEX "OutboxConsumerDispatchIntent_status_idx" ON "OutboxConsumerDispatchIntent"("status");
CREATE UNIQUE INDEX "OutboxConsumerDispatchIntent_outboxId_consumerId_key" ON "OutboxConsumerDispatchIntent"("outboxId", "consumerId");
CREATE UNIQUE INDEX "OutboxConsumerDispatchIntent_consumerId_sequenceNumber_key" ON "OutboxConsumerDispatchIntent"("consumerId", "sequenceNumber");

CREATE INDEX "DeliveryLedger_consumerId_leaseExpiresAt_idx" ON "DeliveryLedger"("consumerId", "leaseExpiresAt");
CREATE INDEX "DeliveryLedger_outboxId_idx" ON "DeliveryLedger"("outboxId");
CREATE INDEX "DeliveryLedger_intentId_idx" ON "DeliveryLedger"("intentId");
CREATE INDEX "DeliveryLedger_outcome_idx" ON "DeliveryLedger"("outcome");

CREATE INDEX "ConsumerAggregateCursor_consumerId_idx" ON "ConsumerAggregateCursor"("consumerId");
CREATE UNIQUE INDEX "ConsumerAggregateCursor_consumerId_aggregateType_aggregateI_key" ON "ConsumerAggregateCursor"("consumerId", "aggregateType", "aggregateId");

CREATE INDEX "SequenceResolutionRecord_consumerId_status_idx" ON "SequenceResolutionRecord"("consumerId", "status");
CREATE INDEX "SequenceResolutionRecord_outboxId_idx" ON "SequenceResolutionRecord"("outboxId");
CREATE UNIQUE INDEX "SequenceResolutionRecord_consumerId_sequenceNumber_key" ON "SequenceResolutionRecord"("consumerId", "sequenceNumber");

CREATE INDEX "TransactionalOutboxArchive_archiveBatchId_idx" ON "TransactionalOutboxArchive"("archiveBatchId");
CREATE INDEX "TransactionalOutboxArchive_archivedTimestamp_idx" ON "TransactionalOutboxArchive"("archivedTimestamp");
CREATE INDEX "TransactionalOutboxArchive_aggregateType_aggregateId_idx" ON "TransactionalOutboxArchive"("aggregateType", "aggregateId");

CREATE INDEX "OutboxConsumerDispatchIntentArchive_archiveBatchId_idx" ON "OutboxConsumerDispatchIntentArchive"("archiveBatchId");
CREATE INDEX "OutboxConsumerDispatchIntentArchive_outboxId_idx" ON "OutboxConsumerDispatchIntentArchive"("outboxId");
CREATE INDEX "OutboxConsumerDispatchIntentArchive_consumerId_idx" ON "OutboxConsumerDispatchIntentArchive"("consumerId");

CREATE INDEX "DeliveryLedgerArchive_archiveBatchId_idx" ON "DeliveryLedgerArchive"("archiveBatchId");
CREATE INDEX "DeliveryLedgerArchive_intentId_idx" ON "DeliveryLedgerArchive"("intentId");
CREATE INDEX "DeliveryLedgerArchive_consumerId_idx" ON "DeliveryLedgerArchive"("consumerId");
CREATE INDEX "DeliveryLedgerArchive_outboxId_idx" ON "DeliveryLedgerArchive"("outboxId");

-- Foreign Keys
ALTER TABLE "OutboxConsumerDispatchIntent" ADD CONSTRAINT "OutboxConsumerDispatchIntent_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "TransactionalOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxConsumerDispatchIntent" ADD CONSTRAINT "OutboxConsumerDispatchIntent_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "RegisteredConsumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryLedger" ADD CONSTRAINT "DeliveryLedger_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "OutboxConsumerDispatchIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryLedger" ADD CONSTRAINT "DeliveryLedger_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "RegisteredConsumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryLedger" ADD CONSTRAINT "DeliveryLedger_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "TransactionalOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerAggregateCursor" ADD CONSTRAINT "ConsumerAggregateCursor_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "RegisteredConsumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SequenceResolutionRecord" ADD CONSTRAINT "SequenceResolutionRecord_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "RegisteredConsumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SequenceResolutionRecord" ADD CONSTRAINT "SequenceResolutionRecord_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "TransactionalOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────
-- Stored Procedures (Strict 7-Rank Lock Ranking Hierarchy)
-- Rank 1: RegisteredConsumer (id ASC)
-- Rank 2: TransactionalOutbox (id ASC)
-- Rank 3: OutboxConsumerDispatchIntent (id ASC)
-- Rank 4: DeliveryLedger (id ASC)
-- Rank 5: ConsumerAggregateCursor (id ASC)
-- Rank 6: SequenceResolutionRecord (id ASC)
-- Rank 7: Archive Tables
-- ──────────────────────────────────────────────────────────────

-- Procedure 7: Status Synthesis
CREATE OR REPLACE FUNCTION sp_synthesize_parent_outbox_status(
    p_outbox_id UUID
)
RETURNS "OutboxStatus"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_is_sealed BOOLEAN;
    v_expected INTEGER;
    v_delivered INTEGER := 0;
    v_revoked INTEGER := 0;
    v_expired INTEGER := 0;
    v_in_flight INTEGER := 0;
    v_new_status "OutboxStatus";
BEGIN
    -- Rank 2: Lock TransactionalOutbox
    SELECT t."isFanoutSealed", t."expectedConsumerCount"
    INTO v_is_sealed, v_expected
    FROM "TransactionalOutbox" t
    WHERE t."id" = p_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TransactionalOutbox % not found', p_outbox_id;
    END IF;

    -- If not sealed yet, stays in current state
    IF NOT v_is_sealed THEN
        SELECT t."status" INTO v_new_status FROM "TransactionalOutbox" t WHERE t."id" = p_outbox_id;
        RETURN v_new_status;
    END IF;

    -- Zero child case: instantly COMPLETED
    IF v_expected = 0 THEN
        UPDATE "TransactionalOutbox"
        SET "status" = 'COMPLETED'::"OutboxStatus",
            "publishedAt" = COALESCE("publishedAt", CLOCK_TIMESTAMP()),
            "updatedAt" = CLOCK_TIMESTAMP()
        WHERE "id" = p_outbox_id;
        RETURN 'COMPLETED'::"OutboxStatus";
    END IF;

    -- Count child intent statuses
    SELECT
        COUNT(*) FILTER (WHERE di."status" = 'DELIVERED'::"DispatchIntentStatus"),
        COUNT(*) FILTER (WHERE di."status" = 'REVOKED'::"DispatchIntentStatus"),
        COUNT(*) FILTER (WHERE di."status" = 'EXPIRED'::"DispatchIntentStatus"),
        COUNT(*) FILTER (WHERE di."status" IN ('PLANNED'::"DispatchIntentStatus", 'ASSIGNED'::"DispatchIntentStatus"))
    INTO v_delivered, v_revoked, v_expired, v_in_flight
    FROM "OutboxConsumerDispatchIntent" di
    WHERE di."outboxId" = p_outbox_id;

    -- Synthesis truth table:
    -- 1. All expected consumers succeeded -> COMPLETED
    IF v_delivered = v_expected THEN
        v_new_status := 'COMPLETED'::"OutboxStatus";
    -- 2. Any consumer is still in flight -> DISPATCHED
    ELSIF v_in_flight > 0 THEN
        v_new_status := 'DISPATCHED'::"OutboxStatus";
    -- 3. All non-in-flight: if any consumer permanently failed (revoked or expired), outbox is FAILED
    ELSIF (v_revoked + v_expired) > 0 THEN
        v_new_status := 'FAILED'::"OutboxStatus";
    ELSE
        v_new_status := 'FAILED'::"OutboxStatus";
    END IF;

    UPDATE "TransactionalOutbox"
    SET "status" = v_new_status,
        "publishedAt" = CASE
            WHEN v_new_status = 'COMPLETED'::"OutboxStatus" THEN COALESCE("publishedAt", CLOCK_TIMESTAMP())
            ELSE NULL
        END,
        "updatedAt" = CLOCK_TIMESTAMP()
    WHERE "id" = p_outbox_id;

    RETURN v_new_status;
END;
$$;

REVOKE ALL ON FUNCTION sp_synthesize_parent_outbox_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_synthesize_parent_outbox_status(UUID) TO CURRENT_USER;

-- Procedure 1: sp_activate_consumer
CREATE OR REPLACE FUNCTION sp_activate_consumer(
    p_consumer_group TEXT,
    p_consumer_name TEXT,
    p_filter_pattern JSONB DEFAULT NULL,
    p_max_in_flight INTEGER DEFAULT 10,
    p_lease_duration_seconds INTEGER DEFAULT 30,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    consumer_id UUID,
    consumer_group TEXT,
    consumer_name TEXT,
    state "ConsumerState",
    filter_pattern JSONB,
    max_in_flight INTEGER,
    lease_duration_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Rank 1 lock: Insert or Update with row lock
    INSERT INTO "RegisteredConsumer" (
        "id", "consumerGroup", "consumerName", "state", "filterPattern",
        "maxInFlight", "leaseDurationSeconds", "retiredAt", "metadata", "createdAt", "updatedAt"
    )
    VALUES (
        gen_random_uuid(), p_consumer_group, p_consumer_name, 'ACTIVE'::"ConsumerState", p_filter_pattern,
        p_max_in_flight, p_lease_duration_seconds, NULL, p_metadata, CLOCK_TIMESTAMP(), CLOCK_TIMESTAMP()
    )
    ON CONFLICT ("consumerGroup", "consumerName") DO UPDATE
    SET "state" = 'ACTIVE'::"ConsumerState",
        "filterPattern" = EXCLUDED."filterPattern",
        "maxInFlight" = EXCLUDED."maxInFlight",
        "leaseDurationSeconds" = EXCLUDED."leaseDurationSeconds",
        "retiredAt" = NULL,
        "metadata" = COALESCE(EXCLUDED."metadata", "RegisteredConsumer"."metadata"),
        "updatedAt" = CLOCK_TIMESTAMP()
    RETURNING "RegisteredConsumer"."id" INTO v_id;

    RETURN QUERY
    SELECT rc."id", rc."consumerGroup", rc."consumerName", rc."state", rc."filterPattern", rc."maxInFlight", rc."leaseDurationSeconds"
    FROM "RegisteredConsumer" rc
    WHERE rc."id" = v_id;
END;
$$;

REVOKE ALL ON FUNCTION sp_activate_consumer(TEXT, TEXT, JSONB, INTEGER, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_activate_consumer(TEXT, TEXT, JSONB, INTEGER, INTEGER, JSONB) TO CURRENT_USER;

-- Procedure 2: sp_retire_consumer
CREATE OR REPLACE FUNCTION sp_retire_consumer(
    p_consumer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_outbox_ids UUID[];
    v_outbox_id UUID;
BEGIN
    -- Rank 1: Lock consumer row
    PERFORM 1
    FROM "RegisteredConsumer"
    WHERE "id" = p_consumer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE "RegisteredConsumer"
    SET "state" = 'RETIRED'::"ConsumerState",
        "retiredAt" = CLOCK_TIMESTAMP(),
        "updatedAt" = CLOCK_TIMESTAMP()
    WHERE "id" = p_consumer_id;

    -- Collect all distinct affected outbox IDs in sorted order
    SELECT ARRAY_AGG(DISTINCT di."outboxId" ORDER BY di."outboxId" ASC)
    INTO v_outbox_ids
    FROM "OutboxConsumerDispatchIntent" di
    WHERE di."consumerId" = p_consumer_id
      AND di."status" IN ('PLANNED'::"DispatchIntentStatus", 'ASSIGNED'::"DispatchIntentStatus");

    -- Rank 2: Lock affected TransactionalOutbox records in id ASC order
    IF v_outbox_ids IS NOT NULL AND ARRAY_LENGTH(v_outbox_ids, 1) > 0 THEN
        PERFORM 1
        FROM "TransactionalOutbox"
        WHERE "id" = ANY(v_outbox_ids)
        ORDER BY "id" ASC
        FOR UPDATE;
    END IF;

    -- Rank 3: Update DispatchIntents
    UPDATE "OutboxConsumerDispatchIntent"
    SET "status" = 'REVOKED'::"DispatchIntentStatus",
        "updatedAt" = CLOCK_TIMESTAMP()
    WHERE "consumerId" = p_consumer_id
      AND "status" IN ('PLANNED'::"DispatchIntentStatus", 'ASSIGNED'::"DispatchIntentStatus");

    -- Rank 4: Terminate active delivery ledgers
    UPDATE "DeliveryLedger"
    SET "outcome" = 'SUSPENDED_BY_RETIREMENT'::"DeliveryOutcome",
        "outcomeReason" = 'Consumer retired by administrative action',
        "leaseToken" = NULL,
        "leaseExpiresAt" = CLOCK_TIMESTAMP(),
        "updatedAt" = CLOCK_TIMESTAMP()
    WHERE "consumerId" = p_consumer_id
      AND "outcome" IS NULL;

    -- Synthesize parent status for all affected outbox items (already locked at Rank 2)
    IF v_outbox_ids IS NOT NULL THEN
        FOREACH v_outbox_id IN ARRAY v_outbox_ids
        LOOP
            PERFORM sp_synthesize_parent_outbox_status(v_outbox_id);
        END LOOP;
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION sp_retire_consumer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_retire_consumer(UUID) TO CURRENT_USER;

-- Procedure 3: sp_prepare_outbox_dispatch
CREATE OR REPLACE FUNCTION sp_prepare_outbox_dispatch(
    p_outbox_id UUID
)
RETURNS TABLE (
    outbox_id UUID,
    status "OutboxStatus",
    expected_consumer_count INTEGER,
    intents_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_event_type TEXT;
    v_aggregate_type TEXT;
    v_aggregate_id TEXT;
    v_status "OutboxStatus";
    v_is_sealed BOOLEAN;
    v_consumer_ids UUID[];
    v_consumer_id UUID;
    v_seq BIGINT;
    v_intent_id UUID;
    v_count INTEGER := 0;
BEGIN
    -- Read outbox without lock first to obtain eventType for consumer filtering
    SELECT t."eventType", t."aggregateType", t."aggregateId", t."status", t."isFanoutSealed"
    INTO v_event_type, v_aggregate_type, v_aggregate_id, v_status, v_is_sealed
    FROM "TransactionalOutbox" t
    WHERE t."id" = p_outbox_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Outbox record % not found', p_outbox_id;
    END IF;

    -- If already sealed, return current state
    IF v_is_sealed THEN
        RETURN QUERY
        SELECT t."id", t."status", t."expectedConsumerCount", 0
        FROM "TransactionalOutbox" t
        WHERE t."id" = p_outbox_id;
        RETURN;
    END IF;

    -- Rank 1: Lock matching ACTIVE consumers in deterministic id ASC order
    SELECT ARRAY_AGG(rc."id" ORDER BY rc."id" ASC)
    INTO v_consumer_ids
    FROM (
        SELECT c."id"
        FROM "RegisteredConsumer" c
        WHERE c."state" = 'ACTIVE'::"ConsumerState"
          AND (
            c."filterPattern" IS NULL
            OR c."filterPattern"->'eventTypes' IS NULL
            OR c."filterPattern"->'eventTypes' @> to_jsonb(v_event_type)
          )
        ORDER BY c."id" ASC
        FOR UPDATE
    ) rc;

    -- Rank 2: Lock TransactionalOutbox FOR UPDATE
    SELECT t."status", t."isFanoutSealed"
    INTO v_status, v_is_sealed
    FROM "TransactionalOutbox" t
    WHERE t."id" = p_outbox_id
    FOR UPDATE;

    IF v_is_sealed THEN
        RETURN QUERY
        SELECT t."id", t."status", t."expectedConsumerCount", 0
        FROM "TransactionalOutbox" t
        WHERE t."id" = p_outbox_id;
        RETURN;
    END IF;

    -- Handle zero-consumer event: seal immediately as COMPLETED
    IF v_consumer_ids IS NULL OR ARRAY_LENGTH(v_consumer_ids, 1) = 0 THEN
        UPDATE "TransactionalOutbox"
        SET "isFanoutSealed" = TRUE,
            "expectedConsumerCount" = 0,
            "status" = 'COMPLETED'::"OutboxStatus",
            "publishedAt" = COALESCE("publishedAt", CLOCK_TIMESTAMP()),
            "updatedAt" = CLOCK_TIMESTAMP()
        WHERE "id" = p_outbox_id;

        RETURN QUERY
        SELECT p_outbox_id, 'COMPLETED'::"OutboxStatus", 0, 0;
        RETURN;
    END IF;

    -- Create intents and ledgers for each locked consumer
    FOREACH v_consumer_id IN ARRAY v_consumer_ids
    LOOP
        -- Allocate monotonic sequence per consumer
        SELECT COALESCE(MAX(di."sequenceNumber"), 0) + 1
        INTO v_seq
        FROM "OutboxConsumerDispatchIntent" di
        WHERE di."consumerId" = v_consumer_id;

        v_intent_id := gen_random_uuid();

        -- Rank 3: Insert DispatchIntent
        INSERT INTO "OutboxConsumerDispatchIntent" (
            "id", "outboxId", "consumerId", "sequenceNumber", "status", "createdAt", "updatedAt"
        )
        VALUES (
            v_intent_id, p_outbox_id, v_consumer_id, v_seq, 'PLANNED'::"DispatchIntentStatus",
            CLOCK_TIMESTAMP(), CLOCK_TIMESTAMP()
        )
        ON CONFLICT ("outboxId", "consumerId") DO NOTHING;

        -- Rank 4: Insert initial DeliveryLedger
        INSERT INTO "DeliveryLedger" (
            "id", "intentId", "consumerId", "outboxId", "claimEpoch", "claimCount",
            "leaseToken", "leaseExpiresAt", "lastWorkerId", "outcome", "createdAt", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), v_intent_id, v_consumer_id, p_outbox_id, 0, 0,
            NULL, NULL, NULL, NULL, CLOCK_TIMESTAMP(), CLOCK_TIMESTAMP()
        );

        v_count := v_count + 1;
    END LOOP;

    -- Seal fan-out and update outbox status
    UPDATE "TransactionalOutbox"
    SET "isFanoutSealed" = TRUE,
        "expectedConsumerCount" = ARRAY_LENGTH(v_consumer_ids, 1),
        "status" = 'DISPATCHED'::"OutboxStatus",
        "updatedAt" = CLOCK_TIMESTAMP()
    WHERE "id" = p_outbox_id;

    RETURN QUERY
    SELECT p_outbox_id, 'DISPATCHED'::"OutboxStatus", ARRAY_LENGTH(v_consumer_ids, 1), v_count;
END;
$$;

REVOKE ALL ON FUNCTION sp_prepare_outbox_dispatch(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_prepare_outbox_dispatch(UUID) TO CURRENT_USER;

-- Procedure 4: sp_worker_delivery_preflight
CREATE OR REPLACE FUNCTION sp_worker_delivery_preflight(
    p_consumer_id UUID,
    p_worker_id TEXT,
    p_lease_seconds INTEGER DEFAULT 30
)
RETURNS TABLE (
    ledger_id UUID,
    intent_id UUID,
    outbox_id UUID,
    sequence_number BIGINT,
    lease_token UUID,
    claim_epoch BIGINT,
    lease_expires_at TIMESTAMP(3),
    payload JSONB,
    headers JSONB,
    aggregate_type TEXT,
    aggregate_id TEXT,
    event_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_consumer_state "ConsumerState";
    v_max_in_flight INTEGER;
    v_consumer_lease_sec INTEGER;
    v_current_in_flight INTEGER := 0;
    v_effective_lease_seconds INTEGER;
    v_intent RECORD;
    v_ledger RECORD;
    v_new_token UUID;
    v_expires TIMESTAMP(3);
BEGIN
    -- Rank 1: Verify consumer exists, is ACTIVE, and has not exceeded maxInFlight
    SELECT rc."state", rc."maxInFlight", rc."leaseDurationSeconds"
    INTO v_consumer_state, v_max_in_flight, v_consumer_lease_sec
    FROM "RegisteredConsumer" rc
    WHERE rc."id" = p_consumer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RegisteredConsumer % not found', p_consumer_id;
    END IF;

    -- Active-state enforcement
    IF v_consumer_state != 'ACTIVE'::"ConsumerState" THEN
        RETURN;
    END IF;

    -- Concurrency ceiling (maxInFlight) enforcement
    SELECT COUNT(*)
    INTO v_current_in_flight
    FROM "DeliveryLedger" dl
    WHERE dl."consumerId" = p_consumer_id
      AND dl."outcome" IS NULL
      AND (dl."leaseExpiresAt" IS NOT NULL AND dl."leaseExpiresAt" > CLOCK_TIMESTAMP());

    IF v_current_in_flight >= v_max_in_flight THEN
        RETURN;
    END IF;

    v_effective_lease_seconds := COALESCE(p_lease_seconds, v_consumer_lease_sec, 30);

    -- Find candidate intents ordered by sequenceNumber ASC
    FOR v_intent IN
        SELECT di."id" AS intent_id, di."outboxId", di."sequenceNumber", di."status",
               o."payload", o."headers", o."aggregateType", o."aggregateId", o."eventType"
        FROM "OutboxConsumerDispatchIntent" di
        JOIN "TransactionalOutbox" o ON o."id" = di."outboxId"
        WHERE di."consumerId" = p_consumer_id
          AND di."status" IN ('PLANNED'::"DispatchIntentStatus", 'ASSIGNED'::"DispatchIntentStatus")
        ORDER BY di."sequenceNumber" ASC
        LIMIT 50
    LOOP
        -- Strict FIFO / Per-aggregate ordering enforcement:
        -- If ANY earlier sequence for this aggregate and consumer is NOT in a terminal resolved state (DELIVERED or REVOKED),
        -- this later intent MUST NOT be dispatched.
        IF EXISTS (
            SELECT 1
            FROM "OutboxConsumerDispatchIntent" prev_di
            JOIN "TransactionalOutbox" prev_o ON prev_o."id" = prev_di."outboxId"
            WHERE prev_di."consumerId" = p_consumer_id
              AND prev_o."aggregateType" = v_intent."aggregateType"
              AND prev_o."aggregateId" = v_intent."aggregateId"
              AND prev_di."sequenceNumber" < v_intent."sequenceNumber"
              AND prev_di."status" NOT IN ('DELIVERED'::"DispatchIntentStatus", 'REVOKED'::"DispatchIntentStatus")
        ) THEN
            -- Head-of-line blocked on earlier unresolved event for this aggregate
            CONTINUE;
        END IF;

        -- Rank 4: Try to lock DeliveryLedger FOR UPDATE SKIP LOCKED
        SELECT dl."id", dl."claimEpoch", dl."claimCount", dl."leaseExpiresAt"
        INTO v_ledger
        FROM "DeliveryLedger" dl
        WHERE dl."intentId" = v_intent.intent_id
          AND (dl."leaseExpiresAt" IS NULL OR dl."leaseExpiresAt" <= CLOCK_TIMESTAMP())
          AND (dl."outcome" IS NULL OR dl."outcome" IN ('RETRIABLE_FAILURE'::"DeliveryOutcome", 'LEASE_EXPIRED'::"DeliveryOutcome"))
        FOR UPDATE SKIP LOCKED;

        IF FOUND THEN
            v_new_token := gen_random_uuid();
            v_expires := CLOCK_TIMESTAMP() + (v_effective_lease_seconds || ' seconds')::INTERVAL;

            UPDATE "DeliveryLedger"
            SET "leaseToken" = v_new_token,
                "claimEpoch" = v_ledger."claimEpoch" + 1,
                "claimCount" = v_ledger."claimCount" + 1,
                "leaseExpiresAt" = v_expires,
                "lastWorkerId" = p_worker_id,
                "outcome" = NULL,
                "outcomeReason" = NULL,
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "id" = v_ledger."id";

            UPDATE "OutboxConsumerDispatchIntent"
            SET "status" = 'ASSIGNED'::"DispatchIntentStatus",
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "id" = v_intent.intent_id;

            RETURN QUERY
            SELECT v_ledger."id", v_intent.intent_id, v_intent."outboxId", v_intent."sequenceNumber",
                   v_new_token, (v_ledger."claimEpoch" + 1)::BIGINT, v_expires,
                   v_intent."payload", v_intent."headers", v_intent."aggregateType", v_intent."aggregateId", v_intent."eventType";
            RETURN;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION sp_worker_delivery_preflight(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_worker_delivery_preflight(UUID, TEXT, INTEGER) TO CURRENT_USER;

-- Procedure 5: sp_worker_delivery_completion
CREATE OR REPLACE FUNCTION sp_worker_delivery_completion(
    p_ledger_id UUID,
    p_lease_token UUID,
    p_claim_epoch BIGINT,
    p_outcome "DeliveryOutcome",
    p_outcome_reason TEXT DEFAULT NULL,
    p_duration_ms INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_intent_id UUID;
    v_outbox_id UUID;
    v_consumer_id UUID;
    v_seq BIGINT;
    v_agg_type TEXT;
    v_agg_id TEXT;
    v_token UUID;
    v_epoch BIGINT;
    v_expires TIMESTAMP(3);
BEGIN
    -- Read immutable IDs from DeliveryLedger without lock
    SELECT dl."intentId", dl."outboxId", dl."consumerId"
    INTO v_intent_id, v_outbox_id, v_consumer_id
    FROM "DeliveryLedger" dl
    WHERE dl."id" = p_ledger_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DeliveryLedger % not found', p_ledger_id;
    END IF;

    -- Strict ascending lock acquisition:
    -- Rank 2: Lock TransactionalOutbox
    PERFORM 1
    FROM "TransactionalOutbox"
    WHERE "id" = v_outbox_id
    FOR UPDATE;

    -- Rank 3: Lock OutboxConsumerDispatchIntent
    PERFORM 1
    FROM "OutboxConsumerDispatchIntent"
    WHERE "id" = v_intent_id
    FOR UPDATE;

    -- Rank 4: Lock DeliveryLedger
    SELECT dl."leaseToken", dl."claimEpoch", dl."leaseExpiresAt"
    INTO v_token, v_epoch, v_expires
    FROM "DeliveryLedger" dl
    WHERE dl."id" = p_ledger_id
    FOR UPDATE;

    -- Strict lease fencing verification
    IF v_token IS NULL OR v_token != p_lease_token OR v_epoch != p_claim_epoch THEN
        RAISE EXCEPTION 'LEASE_FENCED: Worker lease token or epoch mismatch for ledger %', p_ledger_id;
    END IF;

    IF v_expires IS NOT NULL AND v_expires < CLOCK_TIMESTAMP() THEN
        RAISE EXCEPTION 'LEASE_EXPIRED: Worker lease expired at % for ledger %', v_expires, p_ledger_id;
    END IF;

    -- Update ledger outcome
    UPDATE "DeliveryLedger"
    SET "outcome" = p_outcome,
        "outcomeReason" = p_outcome_reason,
        "executionDurationMs" = p_duration_ms,
        "leaseToken" = NULL,
        "updatedAt" = CLOCK_TIMESTAMP()
    WHERE "id" = p_ledger_id;

    -- Rank 3 / Rank 5 / Rank 6 updates based on outcome:
    IF p_outcome = 'DELIVERED'::"DeliveryOutcome" THEN
        UPDATE "OutboxConsumerDispatchIntent"
        SET "status" = 'DELIVERED'::"DispatchIntentStatus",
            "deliveredAt" = CLOCK_TIMESTAMP(),
            "updatedAt" = CLOCK_TIMESTAMP()
        WHERE "id" = v_intent_id
        RETURNING "sequenceNumber" INTO v_seq;

        -- Rank 5: Update ConsumerAggregateCursor
        SELECT "aggregateType", "aggregateId"
        INTO v_agg_type, v_agg_id
        FROM "TransactionalOutbox"
        WHERE "id" = v_outbox_id;

        INSERT INTO "ConsumerAggregateCursor" (
            "id", "consumerId", "aggregateType", "aggregateId", "lastDeliveredSequence", "lastDeliveredOutboxId", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), v_consumer_id, v_agg_type, v_agg_id, v_seq, v_outbox_id, CLOCK_TIMESTAMP()
        )
        ON CONFLICT ("consumerId", "aggregateType", "aggregateId") DO UPDATE
        SET "lastDeliveredSequence" = GREATEST("ConsumerAggregateCursor"."lastDeliveredSequence", EXCLUDED."lastDeliveredSequence"),
            "lastDeliveredOutboxId" = CASE
                WHEN EXCLUDED."lastDeliveredSequence" >= "ConsumerAggregateCursor"."lastDeliveredSequence" THEN EXCLUDED."lastDeliveredOutboxId"
                ELSE "ConsumerAggregateCursor"."lastDeliveredOutboxId"
            END,
            "updatedAt" = CLOCK_TIMESTAMP();

    ELSIF p_outcome IN ('TERMINAL_FAILURE'::"DeliveryOutcome", 'REVOKED'::"DeliveryOutcome") THEN
        UPDATE "OutboxConsumerDispatchIntent"
        SET "status" = 'REVOKED'::"DispatchIntentStatus",
            "updatedAt" = CLOCK_TIMESTAMP()
        WHERE "id" = v_intent_id;

    ELSIF p_outcome = 'RETRIABLE_FAILURE'::"DeliveryOutcome" THEN
        UPDATE "OutboxConsumerDispatchIntent"
        SET "status" = 'PLANNED'::"DispatchIntentStatus",
            "updatedAt" = CLOCK_TIMESTAMP()
        WHERE "id" = v_intent_id;

    ELSIF p_outcome = 'UNCERTAIN'::"DeliveryOutcome" THEN
        -- Retain ASSIGNED, create resolution record (Rank 6)
        SELECT "aggregateType", "aggregateId"
        INTO v_agg_type, v_agg_id
        FROM "TransactionalOutbox"
        WHERE "id" = v_outbox_id;

        SELECT "sequenceNumber" INTO v_seq FROM "OutboxConsumerDispatchIntent" WHERE "id" = v_intent_id;

        -- Rank 6: Insert resolution record
        INSERT INTO "SequenceResolutionRecord" (
            "id", "consumerId", "aggregateType", "aggregateId", "sequenceNumber", "outboxId",
            "status", "resolutionNotes", "createdAt", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), v_consumer_id, v_agg_type, v_agg_id, v_seq, v_outbox_id,
            'UNCERTAIN_NEEDS_WATCHDOG'::"ResolutionStatus", p_outcome_reason, CLOCK_TIMESTAMP(), CLOCK_TIMESTAMP()
        )
        ON CONFLICT ("consumerId", "sequenceNumber") DO UPDATE
        SET "status" = 'UNCERTAIN_NEEDS_WATCHDOG'::"ResolutionStatus",
            "resolutionNotes" = EXCLUDED."resolutionNotes",
            "updatedAt" = CLOCK_TIMESTAMP();
    END IF;

    -- Synthesize parent status (TransactionalOutbox is already locked at Rank 2)
    PERFORM sp_synthesize_parent_outbox_status(v_outbox_id);

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION sp_worker_delivery_completion(UUID, UUID, BIGINT, "DeliveryOutcome", TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_worker_delivery_completion(UUID, UUID, BIGINT, "DeliveryOutcome", TEXT, INTEGER) TO CURRENT_USER;

-- Procedure 6: sp_watchdog_reconcile_cursor
CREATE OR REPLACE FUNCTION sp_watchdog_reconcile_cursor(
    p_consumer_id UUID,
    p_aggregate_type TEXT,
    p_aggregate_id TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_outbox_ids UUID[];
    v_intent_ids UUID[];
    v_outbox_id UUID;
    v_expired RECORD;
    v_current_cursor BIGINT := 0;
    v_first_gap_seq BIGINT;
    v_contiguous_seq BIGINT := 0;
    v_last_outbox_id UUID;
BEGIN
    -- Collect expired or UNCERTAIN ledgers for this consumer
    SELECT ARRAY_AGG(DISTINCT dl."outboxId" ORDER BY dl."outboxId" ASC),
           ARRAY_AGG(DISTINCT dl."intentId" ORDER BY dl."intentId" ASC)
    INTO v_outbox_ids, v_intent_ids
    FROM "DeliveryLedger" dl
    WHERE dl."consumerId" = p_consumer_id
      AND (
        (dl."leaseExpiresAt" < CLOCK_TIMESTAMP() AND dl."outcome" IS NULL)
        OR (dl."outcome" = 'UNCERTAIN'::"DeliveryOutcome")
      );

    -- Strict hierarchy:
    -- Rank 2: Lock affected TransactionalOutbox records in id ASC order
    IF v_outbox_ids IS NOT NULL AND ARRAY_LENGTH(v_outbox_ids, 1) > 0 THEN
        PERFORM 1
        FROM "TransactionalOutbox"
        WHERE "id" = ANY(v_outbox_ids)
        ORDER BY "id" ASC
        FOR UPDATE;
    END IF;

    -- Rank 3: Lock affected OutboxConsumerDispatchIntent records in id ASC order
    IF v_intent_ids IS NOT NULL AND ARRAY_LENGTH(v_intent_ids, 1) > 0 THEN
        PERFORM 1
        FROM "OutboxConsumerDispatchIntent"
        WHERE "id" = ANY(v_intent_ids)
        ORDER BY "id" ASC
        FOR UPDATE;
    END IF;

    -- Rank 4: Recover expired and UNCERTAIN ledgers
    FOR v_expired IN
        SELECT dl."id", dl."intentId", dl."outboxId", dl."claimCount", dl."outcome", o."maxRetries"
        FROM "DeliveryLedger" dl
        JOIN "TransactionalOutbox" o ON o."id" = dl."outboxId"
        WHERE dl."consumerId" = p_consumer_id
          AND (
            (dl."leaseExpiresAt" < CLOCK_TIMESTAMP() AND dl."outcome" IS NULL)
            OR (dl."outcome" = 'UNCERTAIN'::"DeliveryOutcome")
          )
        ORDER BY dl."id" ASC
        FOR UPDATE OF dl
    LOOP
        IF v_expired."claimCount" >= v_expired."maxRetries" THEN
            -- Max retries reached: terminal failure
            UPDATE "DeliveryLedger"
            SET "outcome" = 'TERMINAL_FAILURE'::"DeliveryOutcome",
                "outcomeReason" = CASE
                    WHEN v_expired."outcome" = 'UNCERTAIN'::"DeliveryOutcome" THEN 'Watchdog: UNCERTAIN delivery reached maxRetries limit'
                    ELSE 'Watchdog: lease expired and maxRetries reached'
                END,
                "leaseToken" = NULL,
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "id" = v_expired."id";

            UPDATE "OutboxConsumerDispatchIntent"
            SET "status" = 'REVOKED'::"DispatchIntentStatus",
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "id" = v_expired."intentId";

            -- Rank 6: Update resolution record if exists
            UPDATE "SequenceResolutionRecord"
            SET "status" = 'DEAD_LETTERED'::"ResolutionStatus",
                "resolutionNotes" = 'Watchdog: max retries exceeded',
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "consumerId" = p_consumer_id AND "outboxId" = v_expired."outboxId";
        ELSE
            -- Retriable: reset to PLANNED for worker retry
            UPDATE "DeliveryLedger"
            SET "outcome" = CASE
                    WHEN v_expired."outcome" = 'UNCERTAIN'::"DeliveryOutcome" THEN 'RETRIABLE_FAILURE'::"DeliveryOutcome"
                    ELSE 'LEASE_EXPIRED'::"DeliveryOutcome"
                END,
                "outcomeReason" = CASE
                    WHEN v_expired."outcome" = 'UNCERTAIN'::"DeliveryOutcome" THEN 'Watchdog: recovered UNCERTAIN delivery for retry'
                    ELSE 'Watchdog: lease expired, resetting to retriable'
                END,
                "leaseToken" = NULL,
                "leaseExpiresAt" = CLOCK_TIMESTAMP(),
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "id" = v_expired."id";

            UPDATE "OutboxConsumerDispatchIntent"
            SET "status" = 'PLANNED'::"DispatchIntentStatus",
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "id" = v_expired."intentId";

            -- Rank 6: Update resolution record if exists
            UPDATE "SequenceResolutionRecord"
            SET "status" = 'ROLLED_BACK'::"ResolutionStatus",
                "resolutionNotes" = 'Watchdog: recovered for retry',
                "updatedAt" = CLOCK_TIMESTAMP()
            WHERE "consumerId" = p_consumer_id AND "outboxId" = v_expired."outboxId";
        END IF;
    END LOOP;

    -- Synthesize parent status for all affected outboxes
    IF v_outbox_ids IS NOT NULL THEN
        FOREACH v_outbox_id IN ARRAY v_outbox_ids
        LOOP
            PERFORM sp_synthesize_parent_outbox_status(v_outbox_id);
        END LOOP;
    END IF;

    -- Rank 5: Contiguous Cursor Reconciliation
    SELECT COALESCE(c."lastDeliveredSequence", 0)
    INTO v_current_cursor
    FROM "ConsumerAggregateCursor" c
    WHERE c."consumerId" = p_consumer_id
      AND c."aggregateType" = p_aggregate_type
      AND c."aggregateId" = p_aggregate_id;

    IF v_current_cursor IS NULL THEN
        v_current_cursor := 0;
    END IF;

    -- Find the earliest sequence greater than v_current_cursor that is NOT DELIVERED
    SELECT MIN(di."sequenceNumber")
    INTO v_first_gap_seq
    FROM "OutboxConsumerDispatchIntent" di
    JOIN "TransactionalOutbox" o ON o."id" = di."outboxId"
    WHERE di."consumerId" = p_consumer_id
      AND o."aggregateType" = p_aggregate_type
      AND o."aggregateId" = p_aggregate_id
      AND di."sequenceNumber" > v_current_cursor
      AND di."status" != 'DELIVERED'::"DispatchIntentStatus";

    IF v_first_gap_seq IS NOT NULL THEN
        -- Contiguous delivered sequence is the highest sequence before the gap
        SELECT COALESCE(MAX(di."sequenceNumber"), v_current_cursor)
        INTO v_contiguous_seq
        FROM "OutboxConsumerDispatchIntent" di
        JOIN "TransactionalOutbox" o ON o."id" = di."outboxId"
        WHERE di."consumerId" = p_consumer_id
          AND o."aggregateType" = p_aggregate_type
          AND o."aggregateId" = p_aggregate_id
          AND di."sequenceNumber" > v_current_cursor
          AND di."sequenceNumber" < v_first_gap_seq
          AND di."status" = 'DELIVERED'::"DispatchIntentStatus";
    ELSE
        -- No gap: all sequences above current cursor are DELIVERED
        SELECT COALESCE(MAX(di."sequenceNumber"), v_current_cursor)
        INTO v_contiguous_seq
        FROM "OutboxConsumerDispatchIntent" di
        JOIN "TransactionalOutbox" o ON o."id" = di."outboxId"
        WHERE di."consumerId" = p_consumer_id
          AND o."aggregateType" = p_aggregate_type
          AND o."aggregateId" = p_aggregate_id
          AND di."sequenceNumber" > v_current_cursor
          AND di."status" = 'DELIVERED'::"DispatchIntentStatus";
    END IF;

    IF v_contiguous_seq > 0 THEN
        SELECT di."outboxId"
        INTO v_last_outbox_id
        FROM "OutboxConsumerDispatchIntent" di
        WHERE di."consumerId" = p_consumer_id
          AND di."sequenceNumber" = v_contiguous_seq;
    END IF;

    INSERT INTO "ConsumerAggregateCursor" (
        "id", "consumerId", "aggregateType", "aggregateId", "lastDeliveredSequence", "lastDeliveredOutboxId", "updatedAt"
    )
    VALUES (
        gen_random_uuid(), p_consumer_id, p_aggregate_type, p_aggregate_id, v_contiguous_seq, v_last_outbox_id, CLOCK_TIMESTAMP()
    )
    ON CONFLICT ("consumerId", "aggregateType", "aggregateId") DO UPDATE
    SET "lastDeliveredSequence" = GREATEST("ConsumerAggregateCursor"."lastDeliveredSequence", EXCLUDED."lastDeliveredSequence"),
        "lastDeliveredOutboxId" = CASE
            WHEN EXCLUDED."lastDeliveredSequence" >= "ConsumerAggregateCursor"."lastDeliveredSequence" THEN EXCLUDED."lastDeliveredOutboxId"
            ELSE "ConsumerAggregateCursor"."lastDeliveredOutboxId"
        END,
        "updatedAt" = CLOCK_TIMESTAMP();

    RETURN v_contiguous_seq;
END;
$$;

REVOKE ALL ON FUNCTION sp_watchdog_reconcile_cursor(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_watchdog_reconcile_cursor(UUID, TEXT, TEXT) TO CURRENT_USER;

-- Procedure 8: sse_internal.sp_execute_enterprise_archival
CREATE OR REPLACE FUNCTION sse_internal.sp_execute_enterprise_archival(
    p_retention_interval INTERVAL DEFAULT INTERVAL '30 days',
    p_batch_size INTEGER DEFAULT 100,
    p_reason "ArchivalReason" DEFAULT 'TTL_EXPIRED'::"ArchivalReason",
    p_batch_id UUID DEFAULT NULL
)
RETURNS TABLE (
    archived_outbox_count INTEGER,
    archived_intent_count INTEGER,
    archived_ledger_count INTEGER,
    batch_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sse_internal, pg_temp
AS $$
DECLARE
    v_batch_id UUID;
    v_outbox_ids UUID[];
    v_outbox_count INTEGER := 0;
    v_intent_count INTEGER := 0;
    v_ledger_count INTEGER := 0;
BEGIN
    v_batch_id := COALESCE(p_batch_id, gen_random_uuid());

    -- Rank 2: Select candidate outboxes
    SELECT ARRAY_AGG("id")
    INTO v_outbox_ids
    FROM (
        SELECT "id"
        FROM "TransactionalOutbox"
        WHERE "status" IN ('COMPLETED'::"OutboxStatus", 'FAILED'::"OutboxStatus", 'CANCELLED'::"OutboxStatus", 'SUPERSEDED'::"OutboxStatus")
          AND "updatedAt" < (CLOCK_TIMESTAMP() - p_retention_interval)
        ORDER BY "updatedAt" ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    ) sub;

    IF v_outbox_ids IS NULL OR ARRAY_LENGTH(v_outbox_ids, 1) = 0 THEN
        RETURN QUERY SELECT 0, 0, 0, v_batch_id;
        RETURN;
    END IF;

    -- 1. Archive TransactionalOutbox (idempotent ON CONFLICT DO NOTHING)
    INSERT INTO "TransactionalOutboxArchive" (
        "id", "aggregateType", "aggregateId", "eventType", "payload", "headers",
        "status", "isFanoutSealed", "expectedConsumerCount", "retryCount", "maxRetries",
        "scheduledAt", "lockedAt", "lockedBy", "publishedAt", "archivedAt",
        "createdAt", "updatedAt", "archiveBatchId", "archivedReason", "archivedTimestamp"
    )
    SELECT
        "id", "aggregateType", "aggregateId", "eventType", "payload", "headers",
        "status", "isFanoutSealed", "expectedConsumerCount", "retryCount", "maxRetries",
        "scheduledAt", "lockedAt", "lockedBy", "publishedAt", CLOCK_TIMESTAMP(),
        "createdAt", "updatedAt", v_batch_id, p_reason, CLOCK_TIMESTAMP()
    FROM "TransactionalOutbox"
    WHERE "id" = ANY(v_outbox_ids)
    ON CONFLICT ("id") DO NOTHING;

    GET DIAGNOSTICS v_outbox_count = ROW_COUNT;

    -- 2. Archive OutboxConsumerDispatchIntent
    INSERT INTO "OutboxConsumerDispatchIntentArchive" (
        "id", "outboxId", "consumerId", "sequenceNumber", "status",
        "deliveredAt", "archivedAt", "createdAt", "updatedAt",
        "archiveBatchId", "archivedReason", "archivedTimestamp"
    )
    SELECT
        "id", "outboxId", "consumerId", "sequenceNumber", "status",
        "deliveredAt", CLOCK_TIMESTAMP(), "createdAt", "updatedAt",
        v_batch_id, p_reason, CLOCK_TIMESTAMP()
    FROM "OutboxConsumerDispatchIntent"
    WHERE "outboxId" = ANY(v_outbox_ids)
    ON CONFLICT ("id") DO NOTHING;

    GET DIAGNOSTICS v_intent_count = ROW_COUNT;

    -- 3. Archive DeliveryLedger
    INSERT INTO "DeliveryLedgerArchive" (
        "id", "intentId", "consumerId", "outboxId", "claimEpoch", "claimCount",
        "leaseToken", "leaseExpiresAt", "lastWorkerId", "outcome", "outcomeReason",
        "executionDurationMs", "createdAt", "updatedAt",
        "archiveBatchId", "archivedReason", "archivedTimestamp"
    )
    SELECT
        "id", "intentId", "consumerId", "outboxId", "claimEpoch", "claimCount",
        "leaseToken", "leaseExpiresAt", "lastWorkerId", "outcome", "outcomeReason",
        "executionDurationMs", "createdAt", "updatedAt",
        v_batch_id, p_reason, CLOCK_TIMESTAMP()
    FROM "DeliveryLedger"
    WHERE "outboxId" = ANY(v_outbox_ids)
    ON CONFLICT ("id") DO NOTHING;

    GET DIAGNOSTICS v_ledger_count = ROW_COUNT;

    -- 4. Delete operational rows (Cascades from TransactionalOutbox)
    DELETE FROM "DeliveryLedger" WHERE "outboxId" = ANY(v_outbox_ids);
    DELETE FROM "OutboxConsumerDispatchIntent" WHERE "outboxId" = ANY(v_outbox_ids);
    DELETE FROM "TransactionalOutbox" WHERE "id" = ANY(v_outbox_ids);

    RETURN QUERY
    SELECT v_outbox_count, v_intent_count, v_ledger_count, v_batch_id;
END;
$$;

-- Privileges & Grants
REVOKE ALL ON FUNCTION sse_internal.sp_execute_enterprise_archival(INTERVAL, INTEGER, "ArchivalReason", UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sse_internal.sp_execute_enterprise_archival(INTERVAL, INTEGER, "ArchivalReason", UUID) TO CURRENT_USER;
