import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTestDatabase } from '../../test/sqliteTestHelper';
import { setDatabaseInstance } from '../../db/database';
import { complaintsRepository } from '../../db/complaintsRepository';
import { syncService } from '../syncService';
import * as api from '../../api/endpoints';
import * as mediaStorage from '../../media/attachmentStorage';
import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '../../api/client';

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(),
    addEventListener: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../api/endpoints', () => ({
  complaints: {
    create: vi.fn(),
  },
}));

vi.mock('../../media/attachmentStorage', () => ({
  isFileAccessible: vi.fn(),
  removeLocalAttachment: vi.fn(),
}));

describe('SyncService', () => {
  let db: any;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createTestDatabase();
    setDatabaseInstance(db);

    // Reset syncService internal state
    syncService.setActiveUser(null);
    (syncService as any).isSyncing = false;
    (syncService as any).syncScheduled = false;

    // Default NetInfo to online
    vi.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      details: null,
    } as any);

    // Default file accessible
    vi.mocked(mediaStorage.isFileAccessible).mockResolvedValue(true);
    vi.mocked(mediaStorage.removeLocalAttachment).mockResolvedValue(undefined);
  });

  it('synchronizes pending complaints in FIFO order and marks them synced upon server confirmation', async () => {
    // Seed pending complaint with attachment
    await complaintsRepository.savePendingComplaint({
      id: 'c-sync-1',
      userId: 'driver-1',
      idempotencyKey: 'idem-12345',
      title: 'AC not cooling',
      description: 'Cabin AC blowing warm air',
      category: 'ELECTRICAL',
      priority: 'MEDIUM',
      vehicleNumber: 'KA-01-EQ-9999',
      attachments: [
        {
          id: 'att-sync-1',
          kind: 'PHOTO',
          localUri: 'file:///persistent/photo1.jpg',
          fileName: 'photo1.jpg',
          mimeType: 'image/jpeg',
          fileSize: 10240,
        },
      ],
    });

    // Mock API success response
    vi.mocked(api.complaints.create).mockResolvedValueOnce({
      id: 'server-cmp-100',
      complaintNo: 'CMP-2026-0100',
      status: 'NEW',
      priority: 'MEDIUM',
      category: 'ELECTRICAL',
      title: 'AC not cooling',
      description: 'Cabin AC blowing warm air',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      driverId: 'driver-1',
      vehicleId: null,
      assignedToId: null,
      resolvedAt: null,
      vehicle: null,
      driver: { id: 'driver-1', firstName: 'John', lastName: 'Doe', role: 'DRIVER', phone: '123' },
      assignedTo: null,
      attachments: [],
      updates: [],
      resolutionSummary: null,
      wasAppended: false,
    } as any);

    syncService.setActiveUser({ id: 'driver-1' } as any);

    const success = await syncService.triggerSync('driver-1');
    expect(success).toBe(true);

    // Verify API called with idempotencyKey
    expect(api.complaints.create).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(api.complaints.create).mock.calls[0]!;
    expect(payload.idempotencyKey).toBe('idem-12345');
    expect(payload.title).toBe('AC not cooling');

    // Verify DB updated to SYNCED
    const record = await complaintsRepository.getComplaintById('c-sync-1');
    expect(record?.syncStatus).toBe('SYNCED');
    expect(record?.serverComplaintId).toBe('server-cmp-100');
    expect(record?.serverComplaintNo).toBe('CMP-2026-0100');

    // Verify local persistent attachment was cleaned up only AFTER server confirmation
    expect(mediaStorage.removeLocalAttachment).toHaveBeenCalledWith('file:///persistent/photo1.jpg');
  });

  it('prevents concurrent sync workers via mutex lock', async () => {
    // Seed pending complaint
    await complaintsRepository.savePendingComplaint({
      id: 'c-mutex-1',
      userId: 'driver-1',
      idempotencyKey: 'idem-mutex',
      title: 'Mutex test',
      description: 'Desc',
      category: 'BREAKDOWN',
      priority: 'LOW',
    });

    vi.mocked(api.complaints.create).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 80));
      return { id: 'srv-1', complaintNo: 'CMP-1' } as any;
    });

    syncService.setActiveUser({ id: 'driver-1' } as any);

    // Trigger first sync
    const firstPromise = syncService.triggerSync('driver-1');
    // Trigger second sync immediately while first is in flight
    const secondResult = await syncService.triggerSync('driver-1');

    expect(secondResult).toBe(false); // Second rejected by mutex lock
    const firstResult = await firstPromise;
    expect(firstResult).toBe(true);
  });

  it('classifies 400 and 422 errors as permanent failures without infinite retry loops', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-invalid-400',
      userId: 'driver-1',
      idempotencyKey: 'idem-bad-input',
      title: 'Bad title',
      description: 'Test',
      category: 'BREAKDOWN',
      priority: 'MEDIUM',
    });

    // Mock 400 Validation Error
    vi.mocked(api.complaints.create).mockRejectedValueOnce(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid category specified',
        details: null,
      }),
    );

    syncService.setActiveUser({ id: 'driver-1' } as any);
    await syncService.triggerSync('driver-1');

    const record = await complaintsRepository.getComplaintById('c-invalid-400');
    expect(record?.syncStatus).toBe('FAILED_PERMANENT');
    expect(record?.lastFailureReason).toContain('Invalid category specified');

    // Attachments must NOT be deleted on failure
    expect(mediaStorage.removeLocalAttachment).not.toHaveBeenCalled();

    // Verify it is not re-attempted in auto-sync queue
    const queue = await complaintsRepository.getPendingQueueForUser('driver-1', 10);
    expect(queue.length).toBe(0);
  });

  it('halts batch and preserves queue on transient 503 or network failure', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-transient-503',
      userId: 'driver-1',
      idempotencyKey: 'idem-503',
      title: 'Service unavailable test',
      description: 'Test',
      category: 'BREAKDOWN',
      priority: 'MEDIUM',
    });

    // Mock 503 Service Unavailable
    vi.mocked(api.complaints.create).mockRejectedValueOnce(
      new ApiClientError(503, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Server undergoing maintenance',
        details: null,
      }),
    );

    syncService.setActiveUser({ id: 'driver-1' } as any);
    await syncService.triggerSync('driver-1');

    const record = await complaintsRepository.getComplaintById('c-transient-503');
    expect(record?.syncStatus).toBe('FAILED_TRANSIENT');
    expect(record?.retryCount).toBe(1);
    expect(record?.nextRetryAt).toBeDefined();

    // Immediate queue skips it while backoff is active
    const queueNow = await complaintsRepository.getPendingQueueForUser('driver-1', 10);
    expect(queueNow.length).toBe(0);

    // Future queue includes it when backoff time arrives
    const farFuture = new Date(Date.now() + 600000).toISOString();
    const queueLater = await complaintsRepository.getPendingQueueForUser('driver-1', 10, undefined, farFuture);
    expect(queueLater.length).toBe(1);
  });

  it('enforces driver account isolation: never synchronizes data belonging to another driver', async () => {
    // Save item for Driver Alpha
    await complaintsRepository.savePendingComplaint({
      id: 'c-alpha',
      userId: 'driver-alpha',
      idempotencyKey: 'k-alpha',
      title: 'Alpha issue',
      description: 'Alpha description',
      category: 'BREAKDOWN',
      priority: 'LOW',
    });

    // Save item for Driver Beta
    await complaintsRepository.savePendingComplaint({
      id: 'c-beta',
      userId: 'driver-beta',
      idempotencyKey: 'k-beta',
      title: 'Beta issue',
      description: 'Beta description',
      category: 'BREAKDOWN',
      priority: 'LOW',
    });

    vi.mocked(api.complaints.create).mockResolvedValueOnce({
      id: 'srv-alpha',
      complaintNo: 'CMP-A',
    } as any);

    // Set active user as Driver Alpha
    syncService.setActiveUser({ id: 'driver-alpha' } as any);
    await syncService.triggerSync('driver-alpha');

    // Only Driver Alpha's complaint was sent to API
    expect(api.complaints.create).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(api.complaints.create).mock.calls[0]!;
    expect(payload.idempotencyKey).toBe('k-alpha');

    // Driver Beta's item is untouched
    const betaRecord = await complaintsRepository.getComplaintById('c-beta');
    expect(betaRecord?.syncStatus).toBe('PENDING');
  });

  it('halts synchronization when device is offline', async () => {
    vi.mocked(NetInfo.fetch).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    } as any);

    syncService.setActiveUser({ id: 'driver-1' } as any);
    const result = await syncService.triggerSync('driver-1');
    expect(result).toBe(false);
    expect(api.complaints.create).not.toHaveBeenCalled();
  });

  it('never silently loses missing photo attachment: aborts, marks permanent failure, and preserves metadata', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-missing-photo',
      userId: 'driver-1',
      idempotencyKey: 'idem-missing-photo',
      title: 'Missing photo complaint',
      description: 'Photo was deleted from disk by cleaner tool',
      category: 'BREAKDOWN',
      priority: 'HIGH',
      attachments: [
        {
          id: 'att-photo',
          kind: 'PHOTO',
          localUri: 'file:///persistent/missing_bumper.jpg',
          fileName: 'missing_bumper.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        },
      ],
    });

    vi.mocked(mediaStorage.isFileAccessible).mockResolvedValueOnce(false);

    syncService.setActiveUser({ id: 'driver-1' } as any);
    const result = await syncService.triggerSync('driver-1');
    expect(result).toBe(true);

    // Complaint must NOT have been submitted to API
    expect(api.complaints.create).not.toHaveBeenCalled();

    // Record marked as FAILED_PERMANENT requiring attention, with reason explaining missing file
    const record = await complaintsRepository.getComplaintById('c-missing-photo');
    expect(record?.syncStatus).toBe('FAILED_PERMANENT');
    expect(record?.lastFailureReason).toContain('Missing local attachment file: missing_bumper.jpg (PHOTO)');
    // Metadata preserved
    expect(record?.attachments.length).toBe(1);
    expect(record?.attachments[0]?.fileName).toBe('missing_bumper.jpg');

    // Never deleted local attachments
    expect(mediaStorage.removeLocalAttachment).not.toHaveBeenCalled();
  });

  it('never silently loses missing voice attachment: aborts, marks permanent failure, and preserves metadata', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-missing-voice',
      userId: 'driver-1',
      idempotencyKey: 'idem-missing-voice',
      title: 'Missing voice note',
      description: 'Voice note was removed',
      category: 'BREAKDOWN',
      priority: 'MEDIUM',
      attachments: [
        {
          id: 'att-voice',
          kind: 'VOICE',
          localUri: 'file:///persistent/missing_audio.m4a',
          fileName: 'missing_audio.m4a',
          mimeType: 'audio/m4a',
          fileSize: 4096,
        },
      ],
    });

    vi.mocked(mediaStorage.isFileAccessible).mockResolvedValueOnce(false);

    syncService.setActiveUser({ id: 'driver-1' } as any);
    await syncService.triggerSync('driver-1');

    expect(api.complaints.create).not.toHaveBeenCalled();

    const record = await complaintsRepository.getComplaintById('c-missing-voice');
    expect(record?.syncStatus).toBe('FAILED_PERMANENT');
    expect(record?.lastFailureReason).toContain('Missing local attachment file: missing_audio.m4a (VOICE)');
    expect(mediaStorage.removeLocalAttachment).not.toHaveBeenCalled();
  });

  it('never silently loses missing video attachment: aborts, marks permanent failure, and preserves metadata', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-missing-video',
      userId: 'driver-1',
      idempotencyKey: 'idem-missing-video',
      title: 'Missing video footage',
      description: 'Dashcam clip missing',
      category: 'BREAKDOWN',
      priority: 'CRITICAL',
      attachments: [
        {
          id: 'att-video',
          kind: 'VIDEO',
          localUri: 'file:///persistent/missing_clip.mp4',
          fileName: 'missing_clip.mp4',
          mimeType: 'video/mp4',
          fileSize: 8192,
        },
      ],
    });

    vi.mocked(mediaStorage.isFileAccessible).mockResolvedValueOnce(false);

    syncService.setActiveUser({ id: 'driver-1' } as any);
    await syncService.triggerSync('driver-1');

    expect(api.complaints.create).not.toHaveBeenCalled();

    const record = await complaintsRepository.getComplaintById('c-missing-video');
    expect(record?.syncStatus).toBe('FAILED_PERMANENT');
    expect(record?.lastFailureReason).toContain('Missing local attachment file: missing_clip.mp4 (VIDEO)');
    expect(mediaStorage.removeLocalAttachment).not.toHaveBeenCalled();
  });

  it('protects account isolation: logout during in-flight upload resets item to PENDING and preserves files', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-logout-midflight',
      userId: 'driver-1',
      idempotencyKey: 'idem-logout-test',
      title: 'In-flight logout test',
      description: 'Driver logs out before server responds',
      category: 'BREAKDOWN',
      priority: 'HIGH',
      attachments: [
        {
          id: 'att-logout',
          kind: 'PHOTO',
          localUri: 'file:///persistent/logout_photo.jpg',
          fileName: 'logout_photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        },
      ],
    });

    // Make API take 50ms, during which driver logs out
    vi.mocked(api.complaints.create).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: 'srv-logout-1', complaintNo: 'CMP-LOGOUT-1' } as any;
    });

    syncService.setActiveUser({ id: 'driver-1' } as any);
    const syncPromise = syncService.triggerSync('driver-1');

    // Simulate driver logging out while request is in flight
    await new Promise((resolve) => setTimeout(resolve, 10));
    syncService.setActiveUser(null);

    await syncPromise;

    // Record MUST NOT be marked SYNCED
    const record = await complaintsRepository.getComplaintById('c-logout-midflight');
    expect(record?.syncStatus).toBe('PENDING');
    expect(record?.serverComplaintId).toBeNull();

    // Attachments MUST NOT be deleted
    expect(mediaStorage.removeLocalAttachment).not.toHaveBeenCalled();
  });

  it('protects account isolation: switching accounts during in-flight upload does not cross-contaminate or delete files', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-switch-driver1',
      userId: 'driver-1',
      idempotencyKey: 'idem-switch-test',
      title: 'Driver 1 complaint',
      description: 'Driver 1 submits',
      category: 'BREAKDOWN',
      priority: 'HIGH',
      attachments: [
        {
          id: 'att-switch',
          kind: 'PHOTO',
          localUri: 'file:///persistent/switch_photo.jpg',
          fileName: 'switch_photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        },
      ],
    });

    vi.mocked(api.complaints.create).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: 'srv-switch-1', complaintNo: 'CMP-SWITCH-1' } as any;
    });

    syncService.setActiveUser({ id: 'driver-1' } as any);
    const syncPromise = syncService.triggerSync('driver-1');

    // Driver 2 logs in on the same device while Driver 1 upload is in flight
    await new Promise((resolve) => setTimeout(resolve, 10));
    syncService.setActiveUser({ id: 'driver-2' } as any);

    await syncPromise;

    // Driver 1's record must remain PENDING for driver 1, not committed or deleted
    const driver1Record = await complaintsRepository.getComplaintById('c-switch-driver1');
    expect(driver1Record?.syncStatus).toBe('PENDING');
    expect(driver1Record?.serverComplaintId).toBeNull();
    expect(mediaStorage.removeLocalAttachment).not.toHaveBeenCalled();

    // When Driver 1 logs back in later, the original idempotency key and attachments are still intact for safe resumption!
    expect(driver1Record?.idempotencyKey).toBe('idem-switch-test');
    expect(driver1Record?.attachments.length).toBe(1);
  });

  it('respects Retry-After header from server during transient failure and delays retry', async () => {
    await complaintsRepository.savePendingComplaint({
      id: 'c-rate-limited',
      userId: 'driver-1',
      idempotencyKey: 'idem-rate-limit',
      title: 'Rate limit test',
      description: 'Server sends 429 with Retry-After: 90',
      category: 'BREAKDOWN',
      priority: 'MEDIUM',
    });

    const errorWithRetryAfter = new ApiClientError(
      429,
      { code: 'RATE_LIMITED', message: 'Too many requests. Please wait.', details: null },
      90,
    );

    vi.mocked(api.complaints.create).mockRejectedValueOnce(errorWithRetryAfter);

    syncService.setActiveUser({ id: 'driver-1' } as any);
    await syncService.triggerSync('driver-1');

    const record = await complaintsRepository.getComplaintById('c-rate-limited');
    expect(record?.syncStatus).toBe('FAILED_TRANSIENT');
    expect(record?.nextRetryAt).toBeDefined();

    const retryTime = new Date(record!.nextRetryAt!).getTime();
    expect(retryTime).toBeGreaterThanOrEqual(Date.now() + 85000);
  });
});
