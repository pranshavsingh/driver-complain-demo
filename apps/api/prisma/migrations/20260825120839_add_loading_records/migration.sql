-- CreateEnum
CREATE TYPE "LoadingStatus" AS ENUM ('REACHED', 'COMPLETED');

-- CreateTable
CREATE TABLE "LoadingRecord" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "complaintId" UUID,
    "locationName" TEXT,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reachedLatitude" DOUBLE PRECISION NOT NULL,
    "reachedLongitude" DOUBLE PRECISION NOT NULL,
    "reachedAddress" TEXT,
    "reachedPhotoUrl" TEXT NOT NULL,
    "reachedPublicId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedLatitude" DOUBLE PRECISION,
    "completedLongitude" DOUBLE PRECISION,
    "completedAddress" TEXT,
    "completedPhotoUrl" TEXT,
    "completedPublicId" TEXT,
    "waitingTimeMinutes" INTEGER,
    "status" "LoadingStatus" NOT NULL DEFAULT 'REACHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoadingRecord_driverId_idx" ON "LoadingRecord"("driverId");

-- CreateIndex
CREATE INDEX "LoadingRecord_complaintId_idx" ON "LoadingRecord"("complaintId");

-- CreateIndex
CREATE INDEX "LoadingRecord_status_idx" ON "LoadingRecord"("status");

-- CreateIndex
CREATE INDEX "LoadingRecord_reachedAt_idx" ON "LoadingRecord"("reachedAt");

-- AddForeignKey
ALTER TABLE "LoadingRecord" ADD CONSTRAINT "LoadingRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingRecord" ADD CONSTRAINT "LoadingRecord_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
