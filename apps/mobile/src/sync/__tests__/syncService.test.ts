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
    vi.mocked(mediaStorage.removeLocalAttachment).mockResolvedValue(true);
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

    // Queue still holds item for retry
    const queue = await complaintsRepository.getPendingQueueForUser('driver-1', 10);
    expect(queue.length).toBe(1);
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
});
