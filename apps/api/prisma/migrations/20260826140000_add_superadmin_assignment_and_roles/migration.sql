-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('NONE', 'PENDING', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_REJECTED';

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN "pendingAssigneeId" UUID,
ADD COLUMN "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "Complaint_pendingAssigneeId_idx" ON "Complaint"("pendingAssigneeId");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_pendingAssigneeId_fkey" FOREIGN KEY ("pendingAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
