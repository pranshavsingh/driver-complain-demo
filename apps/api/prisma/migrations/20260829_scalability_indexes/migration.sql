-- Scalability migration: add composite indexes, trigram search, and partial indexes.
-- This migration can be run with: npx prisma migrate dev --name scalability_indexes

-- ────────────────── Full-text search (pg_trgm) ──────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_title_trgm
  ON "Complaint" USING gin ("title" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_desc_trgm
  ON "Complaint" USING gin ("description" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_no_trgm
  ON "Complaint" USING gin ("complaintNo" gin_trgm_ops);

-- ────────────────── Composite indexes for common query patterns ──────────────────

-- Complaint list: filter by status + sort by createdAt (dashboard default view)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_status_created
  ON "Complaint" ("status", "createdAt" DESC);

-- Admin's assigned complaints filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_assigned_status
  ON "Complaint" ("assignedToId", "status") WHERE "assignedToId" IS NOT NULL;

-- Driver's complaints filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_driver_status
  ON "Complaint" ("driverId", "status");

-- Complaint category for auto-assignment lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaint_category_status
  ON "Complaint" ("category", "status");

-- ────────────────── Notification performance ──────────────────

-- Unread notifications for a user, sorted newest-first (badge count + list)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_user_unread
  ON "Notification" ("userId", "createdAt" DESC) WHERE "isRead" = false;

-- ────────────────── Loading record queries ──────────────────

-- Active loading session lookup: driver + active statuses + newest first
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loading_driver_status_created
  ON "LoadingRecord" ("driverId", "status", "createdAt" DESC);

-- ────────────────── Refresh token cleanup ──────────────────

-- Efficiently find expired tokens that have not yet been revoked (for cleanup cron)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_token_expired
  ON "RefreshToken" ("expiresAt") WHERE "revokedAt" IS NULL;

-- Family-based revocation scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_token_family_active
  ON "RefreshToken" ("familyId") WHERE "revokedAt" IS NULL;
