-- M6 Offline-first SQLite Synchronization & Server Idempotency
-- AlterTable: Add idempotencyKey column to Complaint
ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex: Unique constraint per driverId + idempotencyKey
CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_driverId_idempotencyKey_key" 
  ON "Complaint"("driverId", "idempotencyKey");

-- CreateIndex: Index on idempotencyKey for fast lookups
CREATE INDEX IF NOT EXISTS "Complaint_idempotencyKey_idx" 
  ON "Complaint"("idempotencyKey");
