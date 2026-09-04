/**
 * Media processing worker — runs as part of the API process (or standalone).
 *
 * Dequeues complaint-media and loading-photo jobs from BullMQ, processes them
 * (Cloudinary upload, Whisper transcription), and updates the database.
 *
 * DSA: FIFO Queue consumption with priority ordering (URGENT complaints first).
 */
import { createRequire } from 'node:module';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { QUEUES } from './queue';
import type { AttachmentKind } from '@driver-complaint/shared-types';

const require = createRequire(import.meta.url);

export interface ComplaintMediaJobData {
  complaintId: string;
  driverUserId: string;
  files: Record<string, { base64: string; originalName?: string }>;
  priority: string;
}

export interface LoadingPhotoJobData {
  loadingRecordId: string;
  stage: 'reached' | 'completed' | 'trip-completed';
  fileBase64: string;
  folder: string;
}

/** Start media workers. No-op when Redis is unavailable. */
export async function startMediaWorkers(): Promise<void> {
  if (!redis) {
    logger.info('Redis unavailable — media workers disabled (inline processing active)');
    return;
  }

  let WorkerConstructor: new (name: string, processor: (job: { id?: string; data: unknown }) => Promise<void>, opts?: unknown) => {
    on(event: string, fn: (...args: unknown[]) => void): void;
  };

  try {
    const bullmq = require('bullmq');
    WorkerConstructor = bullmq.Worker;
  } catch {
    logger.info('bullmq not installed — media workers disabled');
    return;
  }

  // ──── Complaint Media Worker ────
  const complaintWorker = new WorkerConstructor(
    QUEUES.COMPLAINT_MEDIA,
    async (job: { id?: string; data: unknown }) => {
      const { complaintId, driverUserId, files, priority } = job.data as ComplaintMediaJobData;
      logger.info({ complaintId, priority, jobId: job.id }, 'Processing complaint media');

      // Dynamic imports to avoid circular dependencies at module load time.
      const { uploadBuffer, cloudinaryFolder } = await import('../lib/cloudinary');
      const { transcribeAudio } = await import('../lib/transcribe');
      const { prisma } = await import('../lib/prisma');
      const { dispatchComplaintEvent } = await import('../lib/notify');
      const { REALTIME_EVENTS } = await import('@driver-complaint/shared-types');
      const { getActiveAdminUserIds } = await import('../lib/admin-cache');

      const ATTACHMENT_KINDS = ['PHOTO', 'VOICE', 'VIDEO'] as const;

      // 1. Transcribe voice note if present.
      let voiceTranscription: string | null = null;
      if (files['VOICE']) {
        try {
          const buf = Buffer.from(files['VOICE'].base64, 'base64');
          voiceTranscription = await transcribeAudio(buf, files['VOICE'].originalName);
        } catch {
          voiceTranscription = null;
        }
      }

      // 2. Upload all files to Cloudinary.
      type UploadResult = {
        kind: AttachmentKind;
        originalName: string | null;
        transcription: string | null;
        asset: Awaited<ReturnType<typeof uploadBuffer>>;
      };

      const uploads: UploadResult[] = [];
      for (const kind of ATTACHMENT_KINDS) {
        const file = files[kind];
        if (!file) continue;
        const buf = Buffer.from(file.base64, 'base64');
        const resourceType = kind === 'PHOTO' ? 'image' : 'video';
        const asset = await uploadBuffer(buf, {
          folder: `${cloudinaryFolder}/complaints`,
          resourceType,
        });
        uploads.push({
          kind,
          originalName: file.originalName ?? null,
          transcription: kind === 'VOICE' ? voiceTranscription : null,
          asset,
        });
      }

      // 3. Update database with attachments and transcription.
      await prisma.$transaction(async (tx) => {
        if (uploads.length > 0) {
          await tx.complaintAttachment.createMany({
            data: uploads.map(({ kind, asset, originalName, transcription }) => ({
              complaintId,
              uploadedById: driverUserId,
              kind,
              url: asset.url,
              publicId: asset.publicId,
              resourceType: asset.resourceType,
              format: asset.format,
              bytes: asset.bytes,
              durationSec: asset.durationSec,
              originalName,
              transcription,
            })),
          });
        }

        if (voiceTranscription) {
          const complaint = await tx.complaint.findUnique({
            where: { id: complaintId },
            select: { description: true },
          });
          const isPlaceholder =
            !complaint?.description?.trim() ||
            complaint.description === 'Voice note attached' ||
            complaint.description === 'Photo attached';

          await tx.complaint.update({
            where: { id: complaintId },
            data: {
              transcription: voiceTranscription,
              ...(isPlaceholder ? { description: voiceTranscription } : {}),
            },
          });
        }
      });

      // 4. Notify admins that media processing is complete.
      const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
      if (complaint) {
        const adminIds = await getActiveAdminUserIds();
        dispatchComplaintEvent({
          userIds: adminIds,
          event: REALTIME_EVENTS.complaintCreated,
          payload: {
            complaintId: complaint.id,
            complaintNo: complaint.complaintNo,
            title: complaint.title,
            status: complaint.status,
            at: new Date().toISOString(),
          },
          push: {
            title: `New complaint ${complaint.complaintNo}`,
            body: complaint.title,
            data: { complaintId: complaint.id, type: 'COMPLAINT_CREATED' },
          },
        });
      }

      logger.info(
        { complaintId, uploads: uploads.length, hasTranscription: !!voiceTranscription },
        'Complaint media processing complete',
      );
    },
    {
      connection: redis,
      concurrency: 3,
      limiter: { max: 10, duration: 60_000 }, // Max 10 jobs/minute to respect API rate limits.
    },
  );

  complaintWorker.on('failed', (job: unknown, err: unknown) => {
    const jobObj = job as { id?: string } | undefined;
    const errObj = err as { message?: string } | undefined;
    logger.error({ jobId: jobObj?.id, err: errObj?.message }, 'Complaint media job failed');
  });

  // ──── Loading Photo Worker ────
  const loadingWorker = new WorkerConstructor(
    QUEUES.LOADING_PHOTO,
    async (job: { id?: string; data: unknown }) => {
      const { loadingRecordId, stage, fileBase64, folder } = job.data as LoadingPhotoJobData;
      logger.info({ loadingRecordId, stage, jobId: job.id }, 'Processing loading photo');

      const { uploadBuffer } = await import('../lib/cloudinary');
      const { prisma } = await import('../lib/prisma');

      const buf = Buffer.from(fileBase64, 'base64');
      const asset = await uploadBuffer(buf, { folder, resourceType: 'image' });

      const updateData: Record<string, string> = {};
      if (stage === 'reached') {
        updateData.reachedPhotoUrl = asset.url;
        updateData.reachedPublicId = asset.publicId;
      } else if (stage === 'completed') {
        updateData.completedPhotoUrl = asset.url;
        updateData.completedPublicId = asset.publicId;
      } else if (stage === 'trip-completed') {
        updateData.tripCompletedPhotoUrl = asset.url;
        updateData.tripCompletedPublicId = asset.publicId;
      }

      await prisma.loadingRecord.update({
        where: { id: loadingRecordId },
        data: updateData,
      });

      logger.info({ loadingRecordId, stage }, 'Loading photo upload complete');
    },
    { connection: redis, concurrency: 5 },
  );

  loadingWorker.on('failed', (job: unknown, err: unknown) => {
    const jobObj = job as { id?: string } | undefined;
    const errObj = err as { message?: string } | undefined;
    logger.error({ jobId: jobObj?.id, err: errObj?.message }, 'Loading photo job failed');
  });

  logger.info('Media workers started (complaint-media, loading-photo)');
}
