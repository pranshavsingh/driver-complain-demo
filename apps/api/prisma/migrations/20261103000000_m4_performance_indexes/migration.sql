-- M4 Performance Optimization Indexes
-- Safe idempotent DDL: pre-created by scripts/deploy-m4-indexes.sql using CREATE INDEX CONCURRENTLY.
-- When executed by prisma migrate deploy, IF NOT EXISTS ensures zero-lock skip and zero downtime.

CREATE INDEX IF NOT EXISTS "Complaint_vehicleId_idx" 
  ON "Complaint"("vehicleId");

CREATE INDEX IF NOT EXISTS "LoadingRecord_driverId_status_createdAt_idx" 
  ON "LoadingRecord"("driverId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Vehicle_createdAt_id_idx" 
  ON "Vehicle"("createdAt", "id");

CREATE INDEX IF NOT EXISTS "User_createdByAdminId_idx" 
  ON "User"("createdByAdminId");

CREATE INDEX IF NOT EXISTS "User_createdAt_id_idx" 
  ON "User"("createdAt", "id");

