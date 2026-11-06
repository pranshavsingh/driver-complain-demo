-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'VOICE', 'VIDEO');

-- AlterTable
ALTER TABLE "ComplaintAttachment" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "kind" "AttachmentKind" NOT NULL DEFAULT 'PHOTO';
