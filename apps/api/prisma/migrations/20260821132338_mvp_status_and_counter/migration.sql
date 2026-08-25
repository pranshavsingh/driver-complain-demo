-- AlterEnum
BEGIN;
CREATE TYPE "ComplaintStatus_new" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
ALTER TABLE "public"."Complaint" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Complaint" ALTER COLUMN "status" TYPE "ComplaintStatus_new" USING ("status"::text::"ComplaintStatus_new");
ALTER TABLE "ComplaintUpdate" ALTER COLUMN "fromStatus" TYPE "ComplaintStatus_new" USING ("fromStatus"::text::"ComplaintStatus_new");
ALTER TABLE "ComplaintUpdate" ALTER COLUMN "toStatus" TYPE "ComplaintStatus_new" USING ("toStatus"::text::"ComplaintStatus_new");
ALTER TYPE "ComplaintStatus" RENAME TO "ComplaintStatus_old";
ALTER TYPE "ComplaintStatus_new" RENAME TO "ComplaintStatus";
DROP TYPE "public"."ComplaintStatus_old";
ALTER TABLE "Complaint" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterTable
ALTER TABLE "Complaint" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- CreateTable
CREATE TABLE "Counter" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("name")
);

