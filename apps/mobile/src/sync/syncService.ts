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
  private isSyncing = false;
  private syncScheduled = false;
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

    this.activeUserId = newUserId;
    if (newUserId) {
      // Recover interrupted operations from prior sessions
      void complaintsRepository.resetStuckSyncing(newUserId).then(() => {
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

    this.isSyncing = true;
    this.notify({ type: 'SYNC_STARTED', userId: targetUserId });

    try {
      // 1. Check network connectivity before starting
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('[syncService] Device is offline — sync postponed');
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
        // Double check user didn't log out mid-batch
        if (this.activeUserId !== targetUserId) {
          console.log('[syncService] User changed mid-sync — aborting batch');
          break;
        }

        const success = await this.syncOneComplaint(record);
        if (!success) {
          // If transient network failure occurred, stop remaining batch to preserve backoff
          const net = await NetInfo.fetch();
          if (!net.isConnected) break;
        }
      }

      const finalCounts = await complaintsRepository.getQueueCountsForUser(targetUserId);
      this.notify({ type: 'SYNC_COMPLETED', userId: targetUserId, counts: finalCounts });
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
  private async syncOneComplaint(record: PendingComplaintRecord): Promise<boolean> {
    await complaintsRepository.updateSyncStatus(record.id, 'SYNCING');
    this.notify({
      type: 'SYNC_PROGRESS',
      userId: record.userId,
      complaintId: record.id,
      status: 'SYNCING',
      message: 'Uploading complaint…',
    });

    try {
      // 1. Reconstruct EvidenceUpload from persistent local attachments
      const evidence: api.EvidenceUpload = {};
      const attachmentsToDelete: string[] = [];

      for (const att of record.attachments) {
        const exists = await isFileAccessible(att.localUri);
        if (!exists) {
          console.warn(`[syncService] Attachment file missing on disk: ${att.localUri}`);
          continue;
        }

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

      // 2. Call server endpoint with original idempotency key
      const response = await api.complaints.create(
        {
          title: record.title,
          description: record.description,
          category: record.category as ComplaintCategory,
          priority: record.priority as Priority,
          vehicleId: record.vehicleId ?? undefined,
          vehicleNumber: record.vehicleNumber ?? undefined,
          tripPhase: (record.tripPhase as 'PRE_TRIP' | 'IN_TRANSIT' | 'POST_TRIP' | 'OFF_DUTY') ?? undefined,
          latitude: record.latitude ?? undefined,
          longitude: record.longitude ?? undefined,
          locationName: record.locationName ?? undefined,
          idempotencyKey: record.idempotencyKey,
        },
        evidence,
      );

      // 3. Server confirmed success!
      await complaintsRepository.markComplaintSynced(
        record.id,
        response.id,
        response.complaintNo,
      );

      // 4. Safely clean up local persistent attachments now that server has confirmed
      for (const uri of attachmentsToDelete) {
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
      let isPermanent = false;
      let failureReason = 'Network error. Will retry when connection returns.';

      if (err instanceof ApiClientError) {
        failureReason = err.message;
        // 400 Bad Request, 422 Unprocessable Entity are non-retryable validation failures
        if (err.status === 400 || err.status === 422) {
          isPermanent = true;
          failureReason = `Validation error: ${err.message}`;
        } else if (err.status === 401) {
          // Auth failure: do not mark permanent; halt sync until re-authenticated
          console.warn('[syncService] Session expired during sync. Halting queue.');
          await complaintsRepository.updateSyncStatus(record.id, 'FAILED_TRANSIENT', 'Session expired. Please log in again.');
          return false;
        } else if (err.status === 403) {
          isPermanent = true;
          failureReason = 'Permission denied: Account not authorized to file complaints.';
        }
      } else if (err instanceof Error) {
        failureReason = err.message;
      }

      await complaintsRepository.recordSyncFailure(record.id, failureReason, isPermanent);

      this.notify({
        type: 'SYNC_PROGRESS',
        userId: record.userId,
        complaintId: record.id,
        status: isPermanent ? 'FAILED_PERMANENT' : 'FAILED_TRANSIENT',
        message: failureReason,
        error: failureReason,
      });

      return false;
    }
  }
}

export const syncService = new SyncService();
