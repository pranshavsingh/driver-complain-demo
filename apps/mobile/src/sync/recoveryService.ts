import { complaintsRepository } from '../db/complaintsRepository';
import { isFileAccessible } from '../media/attachmentStorage';
import { syncService } from './syncService';

export interface RecoveryResult {
  success: boolean;
  removedAttachments: string[];
  keptAttachments: string[];
  error?: string;
}

/**
 * Recovers a permanently failed complaint with missing attachments.
 * Only removes attachments that are confirmed missing from device storage.
 * Existing/accessible attachments, original complaint ID, and idempotency key remain untouched.
 * Resets complaint status to PENDING and triggers synchronization.
 */
export async function recoverMissingAttachmentsAndRetry(
  complaintId: string,
  userId: string,
): Promise<RecoveryResult> {
  const removedAttachments: string[] = [];
  const keptAttachments: string[] = [];

  try {
    const complaint = await complaintsRepository.getComplaintById(complaintId);
    if (!complaint) {
      return {
        success: false,
        removedAttachments: [],
        keptAttachments: [],
        error: `Complaint ${complaintId} not found in local database`,
      };
    }

    // Check each attachment and only remove those confirmed missing from disk
    for (const att of complaint.attachments) {
      const exists = await isFileAccessible(att.localUri);
      if (!exists) {
        await complaintsRepository.removeAttachment(complaintId, att.id);
        removedAttachments.push(att.id);
      } else {
        keptAttachments.push(att.id);
      }
    }

    // Reset status to PENDING with cleared error and retry timestamp
    await complaintsRepository.retryComplaint(complaintId);

    // Trigger sync for this driver
    await syncService.triggerSync(userId);

    return {
      success: true,
      removedAttachments,
      keptAttachments,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[recoveryService] Failed to recover complaint ${complaintId}:`, err);
    return {
      success: false,
      removedAttachments,
      keptAttachments,
      error: errorMsg,
    };
  }
}

