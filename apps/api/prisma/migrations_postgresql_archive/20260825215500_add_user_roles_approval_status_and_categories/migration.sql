-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EXECUTIVE';

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'PENDING_APPROVAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'COMPLAINT_STATUS', 'MEDICAL_EMERGENCY', 'SUPPORT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "category" "ComplaintCategory",
ADD COLUMN "createdByAdminId" UUID;

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN "category" "ComplaintCategory" NOT NULL DEFAULT 'SUPPORT';

-- CreateIndex
CREATE INDEX "User_approvalStatus_idx" ON "User"("approvalStatus");
