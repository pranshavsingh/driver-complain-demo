import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDatabase } from '../../test/sqliteTestHelper';
import { setDatabaseInstance } from '../../db/database';
import { complaintsRepository } from '../../db/complaintsRepository';
import { recoverMissingAttachmentsAndRetry } from '../recoveryService';
import * as attachmentStorage from '../../media/attachmentStorage';
import { syncService } from '../syncService';
import * as api from '../../api/endpoints';

vi.mock('../../media/attachmentStorage', () => ({
  isFileAccessible: vi.fn(),
  persistAttachment: vi.fn(),
  persistAttachmentBatch: vi.fn(),
  removeLocalAttachment: vi.fn(),
  ensureDirectoryExists: vi.fn(),
}));

vi.mock('../../api/endpoints', () => ({
  complaints: {
    create: vi.fn(),
  },
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: vi.fn(() => () => {}),
  },
}));

describe('Permanent Failure Recovery Service', () => {
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createTestDatabase();
    setDatabaseInstance(db);
    syncService.resetForTesting();

    vi.mocked(api.complaints.create).mockResolvedValue({
      id: 'srv-default',
      complaintNo: 'DC-2026-000001',
    } as any);
  });

  it('driver cancels confirmation: nothing is removed and complaint is not retried', async () => {
    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-cancel-test',
        userId: 'driver-cancel',
        idempotencyKey: 'idem-cancel-key',
        title: 'Brake failure report',
        description: 'Brakes spongy',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        attachments: [
          {
            id: 'att-1',
            kind: 'PHOTO',
            localUri: 'file:///persistent/photo1.jpg',
            fileName: 'photo1.jpg',
            mimeType: 'image/jpeg',
            fileSize: 1024,
          },
        ],
      },
      db,
    );
    await complaintsRepository.recordSyncFailure('c-cancel-test', 'Missing local attachment file: photo1.jpg', true, undefined, db);

    // Simulate driver cancellation: the confirmation dialog was dismissed without confirming
    const initialRecord = await complaintsRepository.getComplaintById('c-cancel-test', db);
    expect(initialRecord?.attachments.length).toBe(1);
    expect(initialRecord?.syncStatus).toBe('FAILED_PERMANENT');

    // Confirm that no repository mutation took place
    const updatedRecord = await complaintsRepository.getComplaintById('c-cancel-test', db);
    expect(updatedRecord?.attachments.length).toBe(1);
    expect(updatedRecord?.syncStatus).toBe('FAILED_PERMANENT');
    expect(updatedRecord?.lastFailureReason).toContain('Missing local attachment file');
  });

  it('driver confirms: only missing attachments are removed, existing attachments remain intact', async () => {
    syncService.setActiveUser({ id: 'driver-confirm' } as any);
    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-confirm-test',
        userId: 'driver-confirm',
        idempotencyKey: 'idem-confirm-key-42',
        title: 'Steering vibration',
        description: 'Shaking at 60 km/h',
        category: 'BREAKDOWN',
        priority: 'MEDIUM',
        attachments: [
          {
            id: 'att-existing',
            kind: 'PHOTO',
            localUri: 'file:///persistent/present.jpg',
            fileName: 'present.jpg',
            mimeType: 'image/jpeg',
            fileSize: 2048,
          },
          {
            id: 'att-missing',
            kind: 'PHOTO',
            localUri: 'file:///persistent/missing.jpg',
            fileName: 'missing.jpg',
            mimeType: 'image/jpeg',
            fileSize: 4096,
          },
        ],
      },
      db,
    );
    await complaintsRepository.recordSyncFailure('c-confirm-test', 'Missing local attachment file: missing.jpg', true, undefined, db);

    // att-existing is found on disk; att-missing is confirmed missing
    vi.mocked(attachmentStorage.isFileAccessible).mockImplementation(async (uri: string) => {
      return uri.includes('present.jpg');
    });

    const res = await recoverMissingAttachmentsAndRetry('c-confirm-test', 'driver-confirm');

    expect(res.success).toBe(true);
    expect(res.removedAttachments).toEqual(['att-missing']);
    expect(res.keptAttachments).toEqual(['att-existing']);

    // Verify SQLite state
    const afterRecovery = await complaintsRepository.getComplaintById('c-confirm-test', db);
    expect(afterRecovery).not.toBeNull();
    // Exactly 1 attachment remaining
    expect(afterRecovery?.attachments.length).toBe(1);
    expect(afterRecovery?.attachments[0]!.id).toBe('att-existing');
    expect(afterRecovery?.attachments[0]!.fileName).toBe('present.jpg');
  });

  it('preserves original complaint ID and idempotency key during recovery', async () => {
    syncService.setActiveUser({ id: 'driver-preserve' } as any);
    const originalComplaintId = 'c-preserve-id-123';
    const originalIdempotencyKey = 'idem-unique-uuid-999';

    await complaintsRepository.savePendingComplaint(
      {
        id: originalComplaintId,
        userId: 'driver-preserve',
        idempotencyKey: originalIdempotencyKey,
        title: 'Oil leak',
        description: 'Dark pool under engine bay',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        attachments: [
          {
            id: 'att-lost',
            kind: 'PHOTO',
            localUri: 'file:///persistent/lost.jpg',
            fileName: 'lost.jpg',
            mimeType: 'image/jpeg',
            fileSize: 512,
          },
        ],
      },
      db,
    );
    await complaintsRepository.recordSyncFailure(originalComplaintId, 'Missing local attachment file: lost.jpg', true, undefined, db);

    vi.mocked(attachmentStorage.isFileAccessible).mockResolvedValue(false);

    const res = await recoverMissingAttachmentsAndRetry(originalComplaintId, 'driver-preserve');
    expect(res.success).toBe(true);

    const recovered = await complaintsRepository.getComplaintById(originalComplaintId, db);
    expect(recovered?.id).toBe(originalComplaintId);
    expect(recovered?.idempotencyKey).toBe(originalIdempotencyKey);
    expect(recovered?.userId).toBe('driver-preserve');
    expect(recovered?.syncStatus).toBe('SYNCED');
    expect(recovered?.serverComplaintId).toBe('srv-default');
    expect(recovered?.lastFailureReason).toBeNull();
    expect(recovered?.nextRetryAt).toBeNull();
  });

  it('retrying recovered complaint submits to server with original idempotency key without duplicate complaints', async () => {
    syncService.setActiveUser({ id: 'driver-sync-user' } as any);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const complaintId = 'c-retry-server-idem';
    const idempotencyKey = 'idem-server-dedup-100';

    await complaintsRepository.savePendingComplaint(
      {
        id: complaintId,
        userId: 'driver-sync-user',
        idempotencyKey,
        title: 'Tyre pressure warning',
        description: 'Front right tyre pressure warning illuminated',
        category: 'TYRE_ISSUE',
        priority: 'HIGH',
        attachments: [
          {
            id: 'att-lost-server',
            kind: 'PHOTO',
            localUri: 'file:///persistent/missing.jpg',
            fileName: 'missing.jpg',
            mimeType: 'image/jpeg',
            fileSize: 1024,
          },
        ],
      },
      db,
    );
    await complaintsRepository.recordSyncFailure(complaintId, 'Missing local attachment file: missing.jpg', true, undefined, db);

    vi.mocked(attachmentStorage.isFileAccessible).mockResolvedValue(false);
    vi.mocked(api.complaints.create).mockResolvedValueOnce({
      id: 'srv-server-idem-response',
      complaintNo: 'DC-2026-000888',
    } as any);

    const res = await recoverMissingAttachmentsAndRetry(complaintId, 'driver-sync-user');
    expect(res.success).toBe(true);

    // Wait for sync worker triggered by recovery to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(api.complaints.create).toHaveBeenCalledTimes(1);
    const sentPayload = vi.mocked(api.complaints.create).mock.calls[0]![0];
    expect(sentPayload.idempotencyKey).toBe(idempotencyKey);
    expect(sentPayload.title).toBe('Tyre pressure warning');

    // Complaint status is now SYNCED with server ID
    const synced = await complaintsRepository.getComplaintById(complaintId, db);
    expect(synced?.syncStatus).toBe('SYNCED');
    expect(synced?.serverComplaintId).toBe('srv-server-idem-response');
    expect(synced?.serverComplaintNo).toBe('DC-2026-000888');
  });

  it('recovery failure leaves the complaint recoverable', async () => {
    syncService.setActiveUser({ id: 'driver-err' } as any);
    const complaintId = 'c-fail-recoverable';

    await complaintsRepository.savePendingComplaint(
      {
        id: complaintId,
        userId: 'driver-err',
        idempotencyKey: 'idem-err-key',
        title: 'Alternator fault',
        description: 'Battery not charging',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        attachments: [
          {
            id: 'att-err',
            kind: 'PHOTO',
            localUri: 'file:///persistent/err.jpg',
            fileName: 'err.jpg',
            mimeType: 'image/jpeg',
            fileSize: 1024,
          },
        ],
      },
      db,
    );
    await complaintsRepository.recordSyncFailure(complaintId, 'Missing local attachment file: err.jpg', true, undefined, db);

    // Simulate an unexpected filesystem error during attachment verification
    vi.mocked(attachmentStorage.isFileAccessible).mockRejectedValueOnce(
      new Error('EIO: Hardware I/O failure checking file'),
    );

    const res = await recoverMissingAttachmentsAndRetry(complaintId, 'driver-err');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Hardware I/O failure');

    // Complaint is still present and recoverable in local storage
    const recordAfterFailure = await complaintsRepository.getComplaintById(complaintId, db);
    expect(recordAfterFailure).not.toBeNull();
    expect(recordAfterFailure?.id).toBe(complaintId);
    expect(recordAfterFailure?.attachments.length).toBe(1);

    // Driver can retry recovery again once hardware recovers
    vi.mocked(attachmentStorage.isFileAccessible).mockResolvedValueOnce(false);
    const retryRes = await recoverMissingAttachmentsAndRetry(complaintId, 'driver-err');
    expect(retryRes.success).toBe(true);
    expect(retryRes.removedAttachments).toEqual(['att-err']);
  });
});
