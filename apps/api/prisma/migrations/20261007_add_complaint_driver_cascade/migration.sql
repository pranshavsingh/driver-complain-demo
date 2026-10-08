-- DropForeignKey
ALTER TABLE "Complaint" DROP CONSTRAINT IF EXISTS "Complaint_driverId_fkey";

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
