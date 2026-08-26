-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "transcription" TEXT;

-- AlterTable
ALTER TABLE "ComplaintAttachment" ADD COLUMN IF NOT EXISTS "transcription" TEXT;
