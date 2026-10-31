-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "clearedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_userId_clearedAt_idx" ON "Notification"("userId", "clearedAt");

