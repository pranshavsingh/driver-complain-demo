import { AppState, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { ComplaintCategory, Priority, UserPublic } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { ApiClientError } from '../api/client';
import {
  complaintsRepository,
  type LocalSyncStatus,
  type PendingComplaintRecord,
} from '../db/complaintsRepository';
import { isFileAccessible, removeLocalAttachment } from '../media/attachmentStorage';

export interface SyncEvent {
  type: 'SYNC_STARTED' | 'SYNC_PROGRESS' | 'SYNC_COMPLETED' | 'SYNC_FAILED';
  userId: string;
  complaintId?: string;
  status?: LocalSyncStatus;
  message?: string;
  error?: string;
  counts?: { pending: number; syncing: number; failed: number; totalUnsynced: number };
}

type SyncListener = (event: SyncEvent) => void;

class SyncService {
  private activeUserId: string | null = null;
  private sessionGeneration = 0;
  private isSyncing = false;
  private syncScheduled = false;
  private activeAbortController: AbortController | null = null;
  private listeners = new Set<SyncListener>();
  private netInfoUnsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private lastOnlineState = false;

  /**
   * Initialize lifecycle listeners for network transitions and app foregrounding.
   */
  public init(): void {
    if (this.netInfoUnsubscribe) return;

    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      const transitionedToOnline = !this.lastOnlineState && isOnline;
      this.lastOnlineState = isOnline;

      if (transitionedToOnline && this.activeUserId) {
        console.log('[syncService] Network restored — triggering sync');
        void this.triggerSync();
      }
    });

    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active' && this.activeUserId) {
          console.log('[syncService] App foregrounded — triggering sync');
          void this.triggerSync();
        }
      },
    );
  }

  public destroy(): void {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.listeners.clear();
  }

  /**
   * Set currently authenticated driver.
   * Enforces strict account isolation: pending items are only synced for the active user.
   */
  public setActiveUser(user: UserPublic | null): void {
    const newUserId = user?.id ?? null;
    if (this.activeUserId === newUserId) return;

    // Account changed or logged out: increment session generation and abort in-flight sync request
    this.sessionGeneration++;
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {
        // Ignore abort errors
      }
      this.activeAbortController = null;
    }

    this.activeUserId = newUserId;
    if (newUserId) {
      // Recover interrupted operations and auth-expired records from prior sessions
      void Promise.all([
        complaintsRepository.resetStuckSyncing(newUserId),
        complaintsRepository.resetAuthExpiredComplaints(newUserId),
      ]).then(() => {
        void this.triggerSync();
      });
    }
  }

  public getActiveUserId(): string | null {
    return this.activeUserId;
  }

  public addListener(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[syncService] Listener error:', err);
      }
    }
  }

  /**
   * Trigger queue synchronization for the active user.
   * Avoids concurrent sync workers via mutex lock.
   */
  public async triggerSync(forcedUserId?: string): Promise<boolean> {
    const targetUserId = forcedUserId ?? this.activeUserId;
    if (!targetUserId) {
      console.log('[syncService] No authenticated user — sync skipped');
      return false;
    }

    if (this.isSyncing) {
      console.log('[syncService] Sync already in flight — queuing follow-up');
      this.syncScheduled = true;
      return false;
    }

    const startGeneration = this.sessionGeneration;
    this.isSyncing = true;
    this.notify({ type: 'SYNC_STARTED', userId: targetUserId });

    try {
      // 1. Check network connectivity before starting
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('[syncService] Device is offline — sync postponed');
        return false;
      }

      // Check account validity before fetching queue
      if (this.sessionGeneration !== startGeneration || this.activeUserId !== targetUserId) {
        console.log('[syncService] Account changed before queue fetch — aborting');
        return false;
      }

      // 2. Fetch pending queue items strictly scoped to targetUserId
      const queue = await complaintsRepository.getPendingQueueForUser(targetUserId, 15);
      if (queue.length === 0) {
        const counts = await complaintsRepository.getQueueCountsForUser(targetUserId);
        this.notify({ type: 'SYNC_COMPLETED', userId: targetUserId, counts });
        return true;
      }

      console.log(`[syncService] Processing ${String(queue.length)} pending complaint(s) for user`);

      for (const record of queue) {
        // Double check user didn't log out or switch mid-batch
        if (this.sessionGeneration !== startGeneration || this.activeUserId !== targetUserId) {
          console.log('[syncService] User changed mid-sync — aborting batch');
          break;
        }

        const success = await this.syncOneComplaint(record, startGeneration);
        if (!success) {
          // If session changed, break immediately
          if (this.sessionGeneration !== startGeneration || this.activeUserId !== targetUserId) {
            break;
          }
          // If transient network failure occurred, stop remaining batch to preserve backoff
          const net = await NetInfo.fetch();
          if (!net.isConnected) break;
        }
      }

      if (this.sessionGeneration === startGeneration && this.activeUserId === targetUserId) {
        const finalCounts = await complaintsRepository.getQueueCountsForUser(targetUserId);
        this.notify({ type: 'SYNC_COMPLETED', userId: targetUserId, counts: finalCounts });
      }
      return true;
    } catch (err) {
      console.warn('[syncService] Unexpected sync engine error:', err);
      this.notify({
        type: 'SYNC_FAILED',
        userId: targetUserId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    } finally {
      this.isSyncing = false;
      if (this.syncScheduled) {
        this.syncScheduled = false;
        setTimeout(() => {
          void this.triggerSync();
        }, 1000);
      }
    }
  }

  /**
   * Synchronize a single complaint record and its attachments.
   */
  private async syncOneComplaint(
    record: PendingComplaintRecord,
    startGeneration: number,
  ): Promise<boolean> {
    if (this.sessionGeneration !== startGeneration || this.activeUserId !== record.userId) {
      return false;
    }

    await complaintsRepository.updateSyncStatus(record.id, 'SYNCING');
    this.notify({
      type: 'SYNC_PROGRESS',
      userId: record.userId,
      complaintId: record.id,
      status: 'SYNCING',
      message: 'Uploading complaint…',
    });

    // 1. Verify ALL attachments recorded in SQLite exist on disk before submitting.
    // If ANY attachment is missing, DO NOT submit the complaint!
    for (const att of record.attachments) {
      const exists = await isFileAccessible(att.localUri);
      if (!exists) {
        const missingMsg = `Missing local attachment file: ${att.fileName} (${att.kind}). Complaint cannot be submitted without all recorded attachments.`;
        console.error(`[syncService] ${missingMsg}`);
        await complaintsRepository.recordSyncFailure(record.id, missingMsg, true);
        this.notify({
          type: 'SYNC_PROGRESS',
          userId: record.userId,
          complaintId: record.id,
          status: 'FAILED_PERMANENT',
          message: missingMsg,
          error: missingMsg,
        });
        return false;
      }
    }

    // Re-verify account isolation before network request
    if (this.sessionGeneration !== startGeneration || this.activeUserId !== record.userId) {
      console.log('[syncService] User changed before network dispatch — resetting to PENDING');
      await complaintsRepository.updateSyncStatus(record.id, 'PENDING');
      return false;
    }

    // Reconstruct EvidenceUpload from persistent local attachments
    const evidence: api.EvidenceUpload = {};
    const attachmentsToDelete: string[] = [];
    for (const att of record.attachments) {
      const fileToUpload: api.FileToUpload = {
        uri: att.localUri,
        name: att.fileName,
        type: att.mimeType,
      };
      if (att.kind === 'PHOTO') evidence.photo = fileToUpload;
      else if (att.kind === 'VOICE') evidence.voice = fileToUpload;
      else if (att.kind === 'VIDEO') evidence.video = fileToUpload;
      attachmentsToDelete.push(att.localUri);
    }

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      const response = await api.complaints.create(
        {
          title: record.title,
          description: record.description,
          category: record.category as ComplaintCategory,
          priority: record.priority as Priority,
          vehicleId: record.vehicleId ?? undefined,
          vehicleNumber: record.vehicleNumber ?? undefined,
          tripPhase: record.tripPhase ? (record.tripPhase as any) : undefined,
          latitude: record.latitude ?? undefined,
          longitude: record.longitude ?? undefined,
          locationName: record.locationName ?? undefined,
          idempotencyKey: record.idempotencyKey,
        },
        evidence,
        abortController.signal,
      );

      // Revalidate active account before committing local sync state!
      // If user logged out or switched while the network call was in flight:
      // 1. DO NOT mark synced
      // 2. DO NOT delete local files
      // 3. Reset to PENDING and preserve the record with its idempotency key intact for safe resumption
      if (this.sessionGeneration !== startGeneration || this.activeUserId !== record.userId) {
        console.log('[syncService] Session changed during/after upload — resetting to PENDING and preserving local files');
        await complaintsRepository.updateSyncStatus(record.id, 'PENDING');
        return false;
      }

      // Revalidate session generation immediately before changing local sync state!
      const committed = await complaintsRepository.markComplaintSynced(
        record.id,
        record.userId,
        response.id,
        response.complaintNo,
      );

      if (!committed) {
        console.warn('[syncService] Complaint record was not updated (possibly owned by another user or removed)');
        return false;
      }

      // Revalidate session generation before deleting persistent attachments!
      if (this.sessionGeneration !== startGeneration || this.activeUserId !== record.userId) {
        console.log('[syncService] Session changed after commit — preserving local attachment files');
        return false;
      }

      // Clean up local persistent attachments now that server has confirmed and session remains active
      for (const uri of attachmentsToDelete) {
        if (this.sessionGeneration !== startGeneration || this.activeUserId !== record.userId) break;
        await removeLocalAttachment(uri);
      }

      this.notify({
        type: 'SYNC_PROGRESS',
        userId: record.userId,
        complaintId: record.id,
        status: 'SYNCED',
        message: `Synced as ${response.complaintNo}`,
      });

      return true;
    } catch (err: unknown) {
      // If error occurred because account changed or upload was aborted, do NOT mutate another session's state
      if (this.sessionGeneration !== startGeneration || this.activeUserId !== record.userId) {
        console.log('[syncService] Interrupted due to account change — resetting to PENDING without mutating other sessions');
        await complaintsRepository.updateSyncStatus(record.id, 'PENDING');
        return false;
      }

      let isPermanent = false;
      let failureReason = 'Network error. Will retry when connection returns.';
      let retryAfter: number | undefined;

      if (err instanceof ApiClientError) {
        failureReason = err.message;
        retryAfter = err.retryAfter;

        if (err.status === 400 || err.status === 422) {
          isPermanent = true;
          failureReason = `Validation error: ${err.message}`;
        } else if (err.status === 401) {
          // Auth failure: do not mark permanent; halt sync until re-authenticated
          console.warn('[syncService] Session expired during sync. Halting queue.');
          await complaintsRepository.updateSyncStatus(
            record.id,
            'FAILED_TRANSIENT',
            'Session expired. Please log in again.',
          );
          return false;
        } else if (err.status === 403) {
          isPermanent = true;
          failureReason = 'Permission denied: Account not authorized to file complaints.';
        }
      } else if (err instanceof Error) {
        failureReason = err.message;
      }

      await complaintsRepository.recordSyncFailure(
        record.id,
        failureReason,
        isPermanent,
        retryAfter,
      );

      this.notify({
        type: 'SYNC_PROGRESS',
        userId: record.userId,
        complaintId: record.id,
        status: isPermanent ? 'FAILED_PERMANENT' : 'FAILED_TRANSIENT',
        message: failureReason,
        error: failureReason,
      });

      return false;
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }
}

export const syncService = new SyncService();
