-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('FUEL', 'DEF');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('TYRE', 'BATTERY');

-- CreateEnum
CREATE TYPE "SparePartRequestStatus" AS ENUM ('PENDING_APPROVAL', 'ISSUE_PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SparePartType" AS ENUM ('NEW', 'EXCHANGE', 'REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportMessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

-- AlterEnum
BEGIN;
CREATE TYPE "ComplaintCategory_new" AS ENUM ('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'VEHICLE_MAINTENANCE');
ALTER TABLE "public"."Complaint" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "category" TYPE "ComplaintCategory_new" USING ("category"::text::"ComplaintCategory_new");
ALTER TABLE "Complaint" ALTER COLUMN "category" TYPE "ComplaintCategory_new" USING ("category"::text::"ComplaintCategory_new");
ALTER TABLE "SparePartRequest" ALTER COLUMN "category" TYPE "ComplaintCategory_new" USING ("category"::text::"ComplaintCategory_new");
ALTER TABLE "CategorySla" ALTER COLUMN "category" TYPE "ComplaintCategory_new" USING ("category"::text::"ComplaintCategory_new");
ALTER TABLE "AdminCategoryAssignment" ALTER COLUMN "category" TYPE "ComplaintCategory_new" USING ("category"::text::"ComplaintCategory_new");
ALTER TYPE "ComplaintCategory" RENAME TO "ComplaintCategory_old";
ALTER TYPE "ComplaintCategory_new" RENAME TO "ComplaintCategory";
DROP TYPE "public"."ComplaintCategory_old";
ALTER TABLE "Complaint" ALTER COLUMN "category" SET DEFAULT 'BREAKDOWN';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoadingStatus" ADD VALUE 'TRIP_STARTED';
ALTER TYPE "LoadingStatus" ADD VALUE 'TRIP_COMPLETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'VEHICLE_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'VEHICLE_UNASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'SPARE_PART_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'SPARE_PART_ISSUE_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE 'SPARE_PART_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'SPARE_PART_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'SPARE_PART_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'USER_APPROVAL_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'USER_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'USER_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'SLA_BREACH_ESCALATION';

-- DropForeignKey
ALTER TABLE "ComplaintAttachment" DROP CONSTRAINT "ComplaintAttachment_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_driverId_fkey";

-- DropIndex
DROP INDEX "Complaint_pendingAssigneeId_idx";

-- DropIndex
DROP INDEX "idx_complaint_category_status";

-- DropIndex
DROP INDEX "idx_complaint_desc_trgm";

-- DropIndex
DROP INDEX "idx_complaint_no_trgm";

-- DropIndex
DROP INDEX "idx_complaint_status_created";

-- DropIndex
DROP INDEX "idx_complaint_title_trgm";

-- DropIndex
DROP INDEX "idx_loading_driver_status_created";

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "lastSlaEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationName" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "tripPhase" TEXT,
ALTER COLUMN "category" SET DEFAULT 'BREAKDOWN';

-- AlterTable
ALTER TABLE "ComplaintAttachment" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LoadingRecord" ADD COLUMN     "tripCompletedAddress" TEXT,
ADD COLUMN     "tripCompletedAt" TIMESTAMP(3),
ADD COLUMN     "tripCompletedLatitude" DOUBLE PRECISION,
ADD COLUMN     "tripCompletedLongitude" DOUBLE PRECISION,
ADD COLUMN     "tripCompletedPhotoUrl" TEXT,
ADD COLUMN     "tripCompletedPublicId" TEXT,
ADD COLUMN     "tripDurationMinutes" INTEGER,
ADD COLUMN     "tripStartAddress" TEXT,
ADD COLUMN     "tripStartLatitude" DOUBLE PRECISION,
ADD COLUMN     "tripStartLongitude" DOUBLE PRECISION,
ADD COLUMN     "tripStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "site" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "agreementStatus" TEXT DEFAULT 'ACTIVE',
ADD COLUMN     "chassisNumber" TEXT,
ADD COLUMN     "modelNumber" TEXT,
ADD COLUMN     "registrationDate" TIMESTAMP(3),
ADD COLUMN     "siteInchargeId" UUID,
ADD COLUMN     "wheels" TEXT,
ALTER COLUMN "driverId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FuelRecord" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "type" "FuelType" NOT NULL DEFAULT 'FUEL',
    "quantityLtr" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "ratePerLtr" DOUBLE PRECISION,
    "odometerKm" INTEGER,
    "receiptUrl" TEXT,
    "receiptPublicId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "type" "MaintenanceType" NOT NULL DEFAULT 'TYRE',
    "itemNumber" TEXT NOT NULL,
    "oldItemNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "photoUrl" TEXT NOT NULL,
    "photoPublicId" TEXT,
    "odometerKm" INTEGER,
    "brand" TEXT,
    "position" TEXT,
    "cost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SparePartRequest" (
    "id" UUID NOT NULL,
    "requestNo" TEXT NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "transcription" TEXT,
    "partName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "voiceUrl" TEXT,
    "voicePublicId" TEXT,
    "status" "SparePartRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "type" "SparePartType" NOT NULL DEFAULT 'NEW',
    "category" "ComplaintCategory",
    "issueProposedById" UUID,
    "issueProposedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "issuedById" UUID,
    "issuedAt" TIMESTAMP(3),
    "warehouseId" UUID,
    "issuedPartName" TEXT,
    "issuedPartNo" TEXT,
    "issuedQty" INTEGER,
    "issuedItems" JSONB,
    "returnedPartNo" TEXT,
    "returnedPartCondition" TEXT,
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SparePartRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "type" "SupportMessageType" NOT NULL DEFAULT 'TEXT',
    "attachmentUrl" TEXT,
    "attachmentPublicId" TEXT,
    "attachmentDurationSec" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "linkedComplaintId" UUID,
    "linkedComplaintNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingSite" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySla" (
    "id" UUID NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "slaHours" DOUBLE PRECISION NOT NULL DEFAULT 12.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCategoryAssignment" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCategoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelRecord_driverId_idx" ON "FuelRecord"("driverId");

-- CreateIndex
CREATE INDEX "FuelRecord_vehicleId_idx" ON "FuelRecord"("vehicleId");

-- CreateIndex
CREATE INDEX "FuelRecord_type_idx" ON "FuelRecord"("type");

-- CreateIndex
CREATE INDEX "FuelRecord_createdAt_idx" ON "FuelRecord"("createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_driverId_idx" ON "MaintenanceRecord"("driverId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_vehicleId_idx" ON "MaintenanceRecord"("vehicleId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_type_idx" ON "MaintenanceRecord"("type");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_createdAt_idx" ON "MaintenanceRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SparePartRequest_requestNo_key" ON "SparePartRequest"("requestNo");

-- CreateIndex
CREATE INDEX "SparePartRequest_driverId_idx" ON "SparePartRequest"("driverId");

-- CreateIndex
CREATE INDEX "SparePartRequest_vehicleId_idx" ON "SparePartRequest"("vehicleId");

-- CreateIndex
CREATE INDEX "SparePartRequest_status_idx" ON "SparePartRequest"("status");

-- CreateIndex
CREATE INDEX "SparePartRequest_warehouseId_idx" ON "SparePartRequest"("warehouseId");

-- CreateIndex
CREATE INDEX "SparePartRequest_createdAt_idx" ON "SparePartRequest"("createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_senderId_receiverId_idx" ON "SupportMessage"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "SupportMessage_receiverId_isRead_idx" ON "SupportMessage"("receiverId", "isRead");

-- CreateIndex
CREATE INDEX "SupportMessage_senderId_isRead_idx" ON "SupportMessage"("senderId", "isRead");

-- CreateIndex
CREATE INDEX "SupportMessage_createdAt_idx" ON "SupportMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperatingSite_name_key" ON "OperatingSite"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OperatingSite_code_key" ON "OperatingSite"("code");

-- CreateIndex
CREATE INDEX "OperatingSite_isActive_idx" ON "OperatingSite"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySla_category_key" ON "CategorySla"("category");

-- CreateIndex
CREATE INDEX "AdminCategoryAssignment_adminId_idx" ON "AdminCategoryAssignment"("adminId");

-- CreateIndex
CREATE INDEX "AdminCategoryAssignment_category_idx" ON "AdminCategoryAssignment"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AdminCategoryAssignment_adminId_category_key" ON "AdminCategoryAssignment"("adminId", "category");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_siteInchargeId_idx" ON "Vehicle"("siteInchargeId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_siteInchargeId_fkey" FOREIGN KEY ("siteInchargeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartRequest" ADD CONSTRAINT "SparePartRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartRequest" ADD CONSTRAINT "SparePartRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartRequest" ADD CONSTRAINT "SparePartRequest_issueProposedById_fkey" FOREIGN KEY ("issueProposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartRequest" ADD CONSTRAINT "SparePartRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartRequest" ADD CONSTRAINT "SparePartRequest_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartRequest" ADD CONSTRAINT "SparePartRequest_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_linkedComplaintId_fkey" FOREIGN KEY ("linkedComplaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCategoryAssignment" ADD CONSTRAINT "AdminCategoryAssignment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_complaint_driver_status" RENAME TO "Complaint_driverId_status_idx";
