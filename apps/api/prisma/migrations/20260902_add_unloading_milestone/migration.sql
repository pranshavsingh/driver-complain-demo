-- Adds the unloading milestone to the loading/trip lifecycle.
--
-- Written by hand rather than generated: the migration history for this table is already
-- behind schema.prisma (the whole trip_* feature reached the DB through `prisma db push`,
-- which is what the api's `build`/`prestart` scripts run). Running `prisma migrate dev`
-- here would report drift and offer to reset the database, so don't.
--
-- Everything below is additive, nullable and idempotent, so it is safe to apply on top of
-- a database that `db push` has already converged. Existing TRIP_COMPLETED rows keep their
-- data and simply report NULL unloading time.

-- Postgres 12+ allows ALTER TYPE ... ADD VALUE inside Prisma's migration transaction as
-- long as the new value is not referenced in that same transaction. It is not.
ALTER TYPE "LoadingStatus" ADD VALUE IF NOT EXISTS 'UNLOADING';

ALTER TABLE "LoadingRecord"
  ADD COLUMN IF NOT EXISTS "unloadingCompletedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unloadingLatitude"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "unloadingLongitude"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "unloadingAddress"         TEXT,
  ADD COLUMN IF NOT EXISTS "unloadingPhotoUrl"        TEXT,
  ADD COLUMN IF NOT EXISTS "unloadingPublicId"        TEXT,
  ADD COLUMN IF NOT EXISTS "unloadingDurationMinutes" INTEGER;
