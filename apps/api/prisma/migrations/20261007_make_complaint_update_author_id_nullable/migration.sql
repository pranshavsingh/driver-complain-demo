-- AlterTable
ALTER TABLE "ComplaintUpdate" ALTER COLUMN "authorId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "ComplaintUpdate" DROP CONSTRAINT IF EXISTS "ComplaintUpdate_authorId_fkey";

-- AddForeignKey
ALTER TABLE "ComplaintUpdate" ADD CONSTRAINT "ComplaintUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
