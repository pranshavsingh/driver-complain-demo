import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../test/sqliteTestHelper';
import { complaintsRepository } from '../complaintsRepository';

describe('ComplaintsRepository', () => {
  it('saves pending complaint and attachments transactionally', async () => {
    const db = createTestDatabase();

    const complaint = await complaintsRepository.savePendingComplaint(
      {
        id: 'c-test-1',
        userId: 'driver-alpha',
        idempotencyKey: 'idem-key-1',
        title: 'Flat tire near depot',
        description: 'Rear right tire pressure zero',
        category: 'TYRE_ISSUE',
        priority: 'HIGH',
        vehicleNumber: 'MH-12-AB-1234',
        latitude: 18.5204,
        longitude: 73.8567,
        locationName: 'Pune Depot',
        attachments: [
          {
            id: 'att-1',
            kind: 'PHOTO',
            localUri: 'file:///data/photo1.jpg',
            fileName: 'photo1.jpg',
            mimeType: 'image/jpeg',
            fileSize: 204800,
          },
          {
            id: 'att-2',
            kind: 'VOICE',
            localUri: 'file:///data/voice1.m4a',
            fileName: 'voice1.m4a',
            mimeType: 'audio/m4a',
            fileSize: 45000,
          },
        ],
      },
      db,
    );

    expect(complaint.id).toBe('c-test-1');
    expect(complaint.userId).toBe('driver-alpha');
    expect(complaint.syncStatus).toBe('PENDING');
    expect(complaint.retryCount).toBe(0);
    expect(complaint.attachments.length).toBe(2);

    // Verify row was committed to DB
    const stored = await complaintsRepository.getComplaintById('c-test-1', db);
    expect(stored).not.toBeNull();
    expect(stored?.title).toBe('Flat tire near depot');
    expect(stored?.attachments.length).toBe(2);
    expect(stored?.attachments[0]?.fileName).toBe('photo1.jpg');
    expect(stored?.attachments[1]?.kind).toBe('VOICE');
  });

  it('isolates pending queues strictly by userId', async () => {
    const db = createTestDatabase();

    // Driver Alpha complaints
    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-alpha-1',
        userId: 'driver-alpha',
        idempotencyKey: 'idem-a-1',
        title: 'Alpha 1',
        description: 'Issue 1',
        category: 'BREAKDOWN',
        priority: 'MEDIUM',
      },
      db,
    );

    // Driver Beta complaints
    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-beta-1',
        userId: 'driver-beta',
        idempotencyKey: 'idem-b-1',
        title: 'Beta 1',
        description: 'Issue B',
        category: 'ELECTRICAL',
        priority: 'LOW',
      },
      db,
    );

    const alphaQueue = await complaintsRepository.getPendingQueueForUser('driver-alpha', 10, db);
    expect(alphaQueue.length).toBe(1);
    expect(alphaQueue[0]?.id).toBe('c-alpha-1');

    const betaQueue = await complaintsRepository.getPendingQueueForUser('driver-beta', 10, db);
    expect(betaQueue.length).toBe(1);
    expect(betaQueue[0]?.id).toBe('c-beta-1');

    // Unknown driver has empty queue
    const emptyQueue = await complaintsRepository.getPendingQueueForUser('driver-unknown', 10, db);
    expect(emptyQueue.length).toBe(0);
  });

  it('serves queue in FIFO order by created_at', async () => {
    const db = createTestDatabase();

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-first',
        userId: 'driver-1',
        idempotencyKey: 'idem-first',
        title: 'First complaint',
        description: 'First',
        category: 'BREAKDOWN',
        priority: 'LOW',
      },
      db,
    );

    // Manually ensure different timestamps
    db.runSync("UPDATE pending_complaints SET created_at = '2026-11-04T10:00:00Z' WHERE id = 'c-first'");

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-second',
        userId: 'driver-1',
        idempotencyKey: 'idem-second',
        title: 'Second complaint',
        description: 'Second',
        category: 'BREAKDOWN',
        priority: 'HIGH',
      },
      db,
    );
    db.runSync("UPDATE pending_complaints SET created_at = '2026-11-04T10:05:00Z' WHERE id = 'c-second'");

    const queue = await complaintsRepository.getPendingQueueForUser('driver-1', 10, db);
    expect(queue.length).toBe(2);
    expect(queue[0]?.id).toBe('c-first');
    expect(queue[1]?.id).toBe('c-second');
  });

  it('updates sync status and handles transient vs permanent failure recording', async () => {
    const db = createTestDatabase();

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-fail-test',
        userId: 'driver-1',
        idempotencyKey: 'idem-fail',
        title: 'Test',
        description: 'Desc',
        category: 'BREAKDOWN',
        priority: 'MEDIUM',
      },
      db,
    );

    // Record transient network failure
    await complaintsRepository.recordSyncFailure('c-fail-test', 'Network timeout (504)', false, db);
    let record = await complaintsRepository.getComplaintById('c-fail-test', db);
    expect(record?.syncStatus).toBe('FAILED_TRANSIENT');
    expect(record?.retryCount).toBe(1);
    expect(record?.lastFailureReason).toBe('Network timeout (504)');

    // Record permanent 400 validation error
    await complaintsRepository.recordSyncFailure('c-fail-test', 'Vehicle not found (400)', true, db);
    record = await complaintsRepository.getComplaintById('c-fail-test', db);
    expect(record?.syncStatus).toBe('FAILED_PERMANENT');
    expect(record?.retryCount).toBe(2);
    expect(record?.lastFailureReason).toBe('Vehicle not found (400)');

    // Permanent failures are excluded from auto-sync queue to prevent infinite loops
    const queue = await complaintsRepository.getPendingQueueForUser('driver-1', 10, db);
    expect(queue.length).toBe(0);
  });

  it('marks complaint synced with server ID and complaint number', async () => {
    const db = createTestDatabase();

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-sync-test',
        userId: 'driver-1',
        idempotencyKey: 'idem-sync',
        title: 'Engine overheating',
        description: 'Coolant low',
        category: 'BREAKDOWN',
        priority: 'CRITICAL',
      },
      db,
    );

    await complaintsRepository.markComplaintSynced('c-sync-test', 'server-uuid-999', 'CMP-2026-0042', db);

    const record = await complaintsRepository.getComplaintById('c-sync-test', db);
    expect(record?.syncStatus).toBe('SYNCED');
    expect(record?.serverComplaintId).toBe('server-uuid-999');
    expect(record?.serverComplaintNo).toBe('CMP-2026-0042');
    expect(record?.lastFailureReason).toBeNull();

    // Synced items do not appear in pending queue
    const queue = await complaintsRepository.getPendingQueueForUser('driver-1', 10, db);
    expect(queue.length).toBe(0);
  });

  it('recovers interrupted operations by resetting SYNCING back to PENDING', async () => {
    const db = createTestDatabase();

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-interrupted',
        userId: 'driver-1',
        idempotencyKey: 'idem-interrupted',
        title: 'Crash recovery test',
        description: 'Simulating app termination mid-upload',
        category: 'BREAKDOWN',
        priority: 'MEDIUM',
      },
      db,
    );

    // Simulate lock acquired right before app crash
    await complaintsRepository.updateSyncStatus('c-interrupted', 'SYNCING', null, db);
    let record = await complaintsRepository.getComplaintById('c-interrupted', db);
    expect(record?.syncStatus).toBe('SYNCING');

    // On app reboot / session resume, resetStuckSyncing recovers it
    const recoveredCount = await complaintsRepository.resetStuckSyncing('driver-1', db);
    expect(recoveredCount).toBe(1);

    record = await complaintsRepository.getComplaintById('c-interrupted', db);
    expect(record?.syncStatus).toBe('PENDING');

    const queue = await complaintsRepository.getPendingQueueForUser('driver-1', 10, db);
    expect(queue.length).toBe(1);
    expect(queue[0]?.id).toBe('c-interrupted');
  });

  it('computes accurate queue counts for user', async () => {
    const db = createTestDatabase();

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-q1',
        userId: 'driver-1',
        idempotencyKey: 'k1',
        title: 'T1',
        description: 'D1',
        category: 'BREAKDOWN',
        priority: 'LOW',
      },
      db,
    );

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-q2',
        userId: 'driver-1',
        idempotencyKey: 'k2',
        title: 'T2',
        description: 'D2',
        category: 'BREAKDOWN',
        priority: 'LOW',
      },
      db,
    );
    await complaintsRepository.updateSyncStatus('c-q2', 'SYNCING', null, db);

    await complaintsRepository.savePendingComplaint(
      {
        id: 'c-q3',
        userId: 'driver-1',
        idempotencyKey: 'k3',
        title: 'T3',
        description: 'D3',
        category: 'BREAKDOWN',
        priority: 'LOW',
      },
      db,
    );
    await complaintsRepository.recordSyncFailure('c-q3', 'Perm fail', true, db);

    const counts = await complaintsRepository.getQueueCountsForUser('driver-1', db);
    expect(counts.pending).toBe(1);
    expect(counts.syncing).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.totalUnsynced).toBe(3);
  });
});
