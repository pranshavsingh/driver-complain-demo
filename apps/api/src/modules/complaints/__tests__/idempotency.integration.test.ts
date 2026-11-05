import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { create } from '../complaints.service';
import { uploadBuffer, deleteAsset } from '../../../lib/cloudinary';

vi.mock('../../../lib/cloudinary', () => {
  let n = 0;
  return {
    cloudinaryEnabled: true,
    cloudinaryFolder: 'test',
    cloudinary: {},
    uploadBuffer: vi.fn(async (_buffer: Buffer, options: { resourceType?: 'image' | 'video' }) => {
      n += 1;
      const isImage = options.resourceType !== 'video';
      return {
        url: `https://cdn.test/asset_${n}.${isImage ? 'jpg' : 'mp4'}`,
        publicId: `test/asset_idempotency_${n}`,
        resourceType: options.resourceType ?? 'image',
        format: isImage ? 'jpg' : 'mp4',
        bytes: 54321,
        durationSec: isImage ? null : 15,
      };
    }),
    deleteAsset: vi.fn(async () => {}),
  };
});

const defaultUploadBufferMock = vi.mocked(uploadBuffer).getMockImplementation();

vi.mock('../../../lib/transcribe', () => ({
  transcribeAudio: vi.fn(async () => null),
  transcribeAudioFromUrl: vi.fn(async () => null),
  translateText: vi.fn(async (text: string) => text),
}));

/**
 * ConcurrencyBarrier
 * Coordinates concurrent test requests deterministically.
 * Fails closed: if the deadline expires before all expected participants arrive,
 * it rejects with a clear error indicating participant count vs target count.
 */
class ConcurrencyBarrier {
  private count = 0;
  private readonly target: number;
  private readonly timeoutMs: number;
  private releaseBarrier!: () => void;
  private rejectBarrier!: (reason: Error) => void;
  private readonly barrierPromise: Promise<void>;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private settled = false;

  constructor(target = 2, timeoutMs = 15000) {
    this.target = target;
    this.timeoutMs = timeoutMs;
    this.barrierPromise = new Promise<void>((resolve, reject) => {
      this.releaseBarrier = () => {
        if (!this.settled) {
          this.settled = true;
          this.clearTimer();
          resolve();
        }
      };
      this.rejectBarrier = (err: Error) => {
        if (!this.settled) {
          this.settled = true;
          this.clearTimer();
          reject(err);
        }
      };
      this.timeoutId = setTimeout(() => {
        this.rejectBarrier(
          new Error(
            `ConcurrencyBarrier timed out: only ${this.count} of ${this.target} participants arrived within ${this.timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    // Attach catch handler to prevent unhandled rejection warnings if a test fails before awaiting
    this.barrierPromise.catch(() => {});
  }

  private clearTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  async arriveAndAwait(): Promise<void> {
    this.count++;
    if (this.count >= this.target) {
      this.releaseBarrier();
    }
    return this.barrierPromise;
  }

  release(): void {
    this.releaseBarrier();
  }

  cleanup(): void {
    this.clearTimer();
    if (!this.settled) {
      this.releaseBarrier();
    }
  }

  get participantCount(): number {
    return this.count;
  }

  get targetCount(): number {
    return this.target;
  }
}

const IDEM_D1 = 'IDEM_DRIVER_1';
const IDEM_D2 = 'IDEM_DRIVER_2';

let driver1UserId: string;
let driver1Id: string;
let driver2UserId: string;
let driver2Id: string;
let adminUserId: string;

async function cleanup(): Promise<void> {
  const driverIds = [driver1Id, driver2Id].filter(Boolean);
  if (driverIds.length === 0) return;
  const complaints = await prisma.complaint.findMany({
    where: { driverId: { in: driverIds } },
    select: { id: true },
  });
  const ids = complaints.map((c) => c.id);
  if (ids.length > 0) {
    await prisma.notification.deleteMany({ where: { complaintId: { in: ids } } });
    await prisma.complaint.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  const pinHash = await hashPin('1234');

  const u1 = await prisma.user.upsert({
    where: { employeeId: IDEM_D1 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: IDEM_D1, pinHash, role: 'DRIVER', firstName: 'Idem', lastName: 'DriverOne' },
  });
  driver1UserId = u1.id;
  const d1 = await prisma.driver.upsert({
    where: { userId: u1.id },
    update: {},
    create: { userId: u1.id, licenseNumber: 'IDEM-LIC-1' },
  });
  driver1Id = d1.id;

  const u2 = await prisma.user.upsert({
    where: { employeeId: IDEM_D2 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: IDEM_D2, pinHash, role: 'DRIVER', firstName: 'Idem', lastName: 'DriverTwo' },
  });
  driver2UserId = u2.id;
  const d2 = await prisma.driver.upsert({
    where: { userId: u2.id },
    update: {},
    create: { userId: u2.id, licenseNumber: 'IDEM-LIC-2' },
  });
  driver2Id = d2.id;

  const adminU = await prisma.user.upsert({
    where: { employeeId: 'IDEM_ADMIN' },
    update: { pinHash, isActive: true, role: 'ADMIN', approvalStatus: 'APPROVED' },
    create: { employeeId: 'IDEM_ADMIN', pinHash, role: 'ADMIN', approvalStatus: 'APPROVED', firstName: 'Admin', lastName: 'Idem' },
  });
  adminUserId = adminU.id;
});

beforeEach(cleanup);

afterEach(() => {
  if (defaultUploadBufferMock) {
    vi.mocked(uploadBuffer).mockImplementation(defaultUploadBufferMock);
  }
});

afterAll(async () => {
  await cleanup();
  await prisma.driver.deleteMany({ where: { userId: { in: [driver1UserId, driver2UserId].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: [driver1UserId, driver2UserId, adminUserId].filter(Boolean) } } });
});

describe('ConcurrencyBarrier Unit Tests', () => {
  it('fails closed: rejects with clear error when a participant is missing and timeout expires', async () => {
    const barrier = new ConcurrencyBarrier(2, 50);
    // Only 1 participant arrives, target is 2
    const arrivePromise = barrier.arriveAndAwait();
    await expect(arrivePromise).rejects.toThrow(
      'ConcurrencyBarrier timed out: only 1 of 2 participants arrived within 50ms',
    );
    expect(barrier.participantCount).toBe(1);
    expect(barrier.targetCount).toBe(2);
  });

  it('fails closed: rejects when zero participants arrive before timeout', async () => {
    const barrier = new ConcurrencyBarrier(2, 50);
    await new Promise((r) => setTimeout(r, 60));
    await expect(barrier.arriveAndAwait()).rejects.toThrow(
      /ConcurrencyBarrier timed out: only 0 of 2 participants arrived within 50ms/,
    );
  });

  it('resolves successfully when all expected participants arrive before timeout', async () => {
    const barrier = new ConcurrencyBarrier(3, 500);
    let resolved = false;

    const p1 = barrier.arriveAndAwait();
    const p2 = barrier.arriveAndAwait();
    expect(barrier.participantCount).toBe(2);

    const p3 = barrier.arriveAndAwait();
    expect(barrier.participantCount).toBe(3);

    await Promise.all([p1, p2, p3]);
    resolved = true;
    expect(resolved).toBe(true);
  });

  it('cleanup clears pending timer and releases barrier safely without throwing', async () => {
    const barrier = new ConcurrencyBarrier(2, 10000);
    const p1 = barrier.arriveAndAwait();
    expect(barrier.participantCount).toBe(1);
    barrier.cleanup();
    await expect(p1).resolves.toBeUndefined();
  });
});

describe('M6 Server Idempotency Integration Tests', () => {
  it('creates a new complaint with an idempotency key on first submission', async () => {
    const key = `idem-key-${Date.now()}-1`;
    const res = await create(driver1UserId, {
      title: 'Flat tyre on highway',
      description: 'Right rear tyre punctured near junction 4',
      category: 'BREAKDOWN',
      priority: 'HIGH',
      idempotencyKey: key,
    });

    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    expect(res.complaintNo).toMatch(/^DC-\d{4}-\d{6}$/);
    expect(res.idempotencyKey).toBe(key);

    const dbRecord = await prisma.complaint.findUnique({
      where: { id: res.id },
    });
    expect(dbRecord?.idempotencyKey).toBe(key);
  });

  it('returns the existing complaint on duplicate submission with the same idempotency key', async () => {
    const key = `idem-key-${Date.now()}-2`;
    const first = await create(driver1UserId, {
      title: 'Oil leak under engine',
      description: 'Noticed dark puddle under front chassis',
      category: 'BREAKDOWN',
      priority: 'MEDIUM',
      idempotencyKey: key,
    });

    const second = await create(driver1UserId, {
      title: 'Oil leak under engine (retry)',
      description: 'Different description text sent on retry',
      category: 'BREAKDOWN',
      priority: 'HIGH',
      idempotencyKey: key,
    });

    // Must return the exact same complaint without creating a new record
    expect(second.id).toBe(first.id);
    expect(second.complaintNo).toBe(first.complaintNo);
    expect(second.title).toBe(first.title);
    expect(second.createdAt).toBe(first.createdAt);

    // Verify exactly one complaint exists in database for this driver
    const count = await prisma.complaint.count({
      where: { driverId: driver1Id, idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  it('safely handles concurrent duplicate submissions without duplicate records or errors', async () => {
    const key = `idem-concurrent-${Date.now()}`;
    const [res1, res2] = await Promise.all([
      create(driver1UserId, {
        title: 'Brake pad squeal',
        description: 'Loud metallic grinding noise when braking',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        idempotencyKey: key,
      }),
      create(driver1UserId, {
        title: 'Brake pad squeal',
        description: 'Loud metallic grinding noise when braking',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        idempotencyKey: key,
      }),
    ]);

    expect(res1.id).toBe(res2.id);
    expect(res1.complaintNo).toBe(res2.complaintNo);

    const count = await prisma.complaint.count({
      where: { driverId: driver1Id, idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  it('scopes idempotency keys per driver: two drivers can use the same key without conflict', async () => {
    const sharedKey = `shared-client-uuid-${Date.now()}`;

    const driver1Complaint = await create(driver1UserId, {
      title: 'Driver 1 windshield cracked',
      description: 'Rock strike on passenger side',
      category: 'BREAKDOWN',
      priority: 'LOW',
      idempotencyKey: sharedKey,
    });

    const driver2Complaint = await create(driver2UserId, {
      title: 'Driver 2 windshield cracked',
      description: 'Another rock strike on highway',
      category: 'BREAKDOWN',
      priority: 'LOW',
      idempotencyKey: sharedKey,
    });

    // They are independent complaints
    expect(driver1Complaint.id).not.toBe(driver2Complaint.id);
    expect(driver1Complaint.driverId).toBe(driver1Id);
    expect(driver2Complaint.driverId).toBe(driver2Id);
    expect(driver1Complaint.idempotencyKey).toBe(sharedKey);
    expect(driver2Complaint.idempotencyKey).toBe(sharedKey);
  });

  it('preserves existing behavior when no idempotency key is provided', async () => {
    const complaintWithoutKey = await create(driver1UserId, {
      title: 'Coolant level low',
      description: 'Dashboard temp warning illuminated',
      category: 'BREAKDOWN',
      priority: 'MEDIUM',
    });

    expect(complaintWithoutKey.id).toBeDefined();
    expect(complaintWithoutKey.idempotencyKey).toBeNull();
  });

  it('does not create duplicate Cloudinary uploads on idempotent duplicate requests', async () => {
    vi.mocked(uploadBuffer).mockClear();
    const key = `idem-upload-test-${Date.now()}`;
    const evidence = {
      PHOTO: {
        buffer: Buffer.from('fake-photo-data'),
        originalName: 'photo.jpg',
      },
    };

    // First request uploads to Cloudinary
    const first = await create(
      driver1UserId,
      {
        title: 'Broken taillight',
        description: 'Right rear light assembly cracked',
        category: 'BREAKDOWN',
        priority: 'LOW',
        idempotencyKey: key,
      },
      evidence,
    );

    expect(first.id).toBeDefined();
    expect(uploadBuffer).toHaveBeenCalledTimes(1);

    // Duplicate request with same idempotency key and same evidence
    const second = await create(
      driver1UserId,
      {
        title: 'Broken taillight (replay)',
        description: 'Should not re-upload',
        category: 'BREAKDOWN',
        priority: 'LOW',
        idempotencyKey: key,
      },
      evidence,
    );

    // Returns original complaint without calling uploadBuffer again
    expect(second.id).toBe(first.id);
    expect(uploadBuffer).toHaveBeenCalledTimes(1);
  });

  it('compensates and deletes uploaded assets via deleteAsset if database transaction fails', async () => {
    vi.mocked(deleteAsset).mockClear();
    const key = `idem-compensate-${Date.now()}`;
    const evidence = {
      PHOTO: {
        buffer: Buffer.from('fake-fail-data'),
        originalName: 'fail.jpg',
      },
    };

    // Spy on prisma.$transaction to simulate database failure during commit
    const txSpy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('Simulated database write error'));

    try {
      await expect(
        create(
          driver1UserId,
          {
            title: 'Failed transaction test',
            description: 'Will fail at db layer',
            category: 'BREAKDOWN',
            priority: 'HIGH',
            idempotencyKey: key,
          },
          evidence,
        ),
      ).rejects.toThrow(/Simulated database write error/);

      // deleteAsset MUST be called for the uploaded photo to prevent orphaned Cloudinary assets
      expect(deleteAsset).toHaveBeenCalled();
    } finally {
      txSpy.mockRestore();
    }
  });

  it('deterministically handles concurrent create requests with evidence via upload barrier: both pass initial lookup, both finish uploads, race resolves at unique constraint, loser assets compensated, winning assets protected', async () => {
    vi.mocked(deleteAsset).mockClear();
    vi.mocked(uploadBuffer).mockClear();

    const key = `idem-barrier-race-${Date.now()}`;
    const evidence = {
      PHOTO: {
        buffer: Buffer.from('deterministic-evidence-bytes'),
        originalName: 'deterministic.jpg',
      },
    };

    // Synchronization barriers:
    // 1. lookupBarrier: holds both requests until both have completed their initial idempotency lookup.
    // 2. uploadBarrier: holds both requests in uploadBuffer until both have completed Cloudinary upload.
    const lookupBarrier = new ConcurrencyBarrier(2);
    const uploadBarrier = new ConcurrencyBarrier(2);

    const lookupResults: Array<{ args: any; result: any }> = [];
    const originalFindUnique = prisma.complaint.findUnique;
    prisma.complaint.findUnique = (async (args: any) => {
      const result = await originalFindUnique(args);
      // Synchronize only the initial idempotency check for this test's key
      if (
        args?.where?.driverId_idempotencyKey?.idempotencyKey === key &&
        lookupResults.length < 2
      ) {
        lookupResults.push({ args, result });
        await lookupBarrier.arriveAndAwait();
      }
      return result;
    }) as any;

    const uploadedAssets: string[] = [];
    let uploadArrivalsBeforeRelease = 0;
    const originalUploadBuffer = vi.mocked(uploadBuffer).getMockImplementation();

    vi.mocked(uploadBuffer).mockImplementation(async (buffer, options) => {
      // 1. Prove both initial lookups completed and returned null before uploads release to DB
      expect(lookupResults.length).toBe(2);
      expect(lookupResults[0]?.result).toBeNull();
      expect(lookupResults[1]?.result).toBeNull();

      const result = await (originalUploadBuffer ? originalUploadBuffer(buffer, options) : {
        url: `https://cdn.test/barrier_${Date.now()}_${Math.random()}.jpg`,
        publicId: `test/asset_barrier_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        resourceType: 'image' as const,
        format: 'jpg',
        bytes: 12345,
        durationSec: null,
      });
      uploadedAssets.push(result.publicId);
      uploadArrivalsBeforeRelease++;

      // Force both requests to reach the upload barrier before either proceeds
      await uploadBarrier.arriveAndAwait();

      // Assert exactly two upload calls reached the barrier before allowing either request to continue
      expect(uploadBarrier.participantCount).toBe(2);
      expect(uploadArrivalsBeforeRelease).toBe(2);

      return result;
    });

    try {
      const [res1, res2] = await Promise.all([
        create(
          driver1UserId,
          {
            title: 'Deterministic concurrent tyre blowout',
            description: 'Left rear tyre blowout on ring road',
            category: 'TYRE_ISSUE',
            priority: 'URGENT',
            idempotencyKey: key,
          },
          evidence,
        ),
        create(
          driver1UserId,
          {
            title: 'Deterministic concurrent tyre blowout',
            description: 'Left rear tyre blowout on ring road',
            category: 'TYRE_ISSUE',
            priority: 'URGENT',
            idempotencyKey: key,
          },
          evidence,
        ),
      ]);

      // Unconditional assertions:
      // 1. Both requests resolve successfully and return identical complaint identity
      expect(res1.id).toBe(res2.id);
      expect(res1.complaintNo).toBe(res2.complaintNo);

      // 2. Both initial idempotency lookups returned no existing complaint
      expect(lookupResults.length).toBe(2);
      expect(lookupResults[0]?.result).toBeNull();
      expect(lookupResults[1]?.result).toBeNull();

      // 3. Exactly two assets were uploaded before the database transaction
      expect(uploadedAssets.length).toBe(2);
      expect(uploadArrivalsBeforeRelease).toBe(2);

      // 4. Exactly one complaint exists in database for this driver and idempotency key
      const dbCount = await prisma.complaint.count({
        where: { driverId: driver1Id, idempotencyKey: key },
      });
      expect(dbCount).toBe(1);

      // 5. Exactly one winning attachment is persisted
      const winningComplaint = await prisma.complaint.findUnique({
        where: { id: res1.id },
        include: { attachments: true },
      });
      expect(winningComplaint?.attachments.length).toBe(1);
      const winningAssetPublicId = winningComplaint!.attachments[0]!.publicId;
      expect(uploadedAssets).toContain(winningAssetPublicId);

      // Identify the losing asset that was uploaded but could not be linked due to unique constraint race
      const losingAssetPublicId = uploadedAssets.find((id) => id !== winningAssetPublicId)!;
      expect(losingAssetPublicId).toBeDefined();

      // 6. The winning Cloudinary public ID is NEVER passed to deleteAsset
      const deletedPublicIds = vi.mocked(deleteAsset).mock.calls.map((call) => call[0]);
      expect(deletedPublicIds).not.toContain(winningAssetPublicId);

      // 7. The losing request's Cloudinary public ID IS passed to deleteAsset
      expect(deletedPublicIds).toContain(losingAssetPublicId);

      // 8. No orphaned assets remain: every uploaded asset is either persisted or deleted
      const allAccountedAssets = [winningAssetPublicId, ...deletedPublicIds];
      for (const assetId of uploadedAssets) {
        expect(allAccountedAssets).toContain(assetId);
      }

      // 9. No duplicate updates or duplicate notifications are created
      const updateCount = await prisma.complaintUpdate.count({
        where: { complaintId: res1.id },
      });
      expect(updateCount).toBe(1);

      const notifCount = await prisma.notification.count({
        where: { complaintId: res1.id },
      });
      expect(notifCount).toBeGreaterThan(0);
      const uniqueNotifRecipients = await prisma.notification.findMany({
        where: { complaintId: res1.id },
        select: { userId: true },
      });
      const recipientIds = uniqueNotifRecipients.map((n) => n.userId);
      const uniqueRecipientIds = new Set(recipientIds);
      expect(recipientIds.length).toBe(uniqueRecipientIds.size);
    } finally {
      lookupBarrier.cleanup();
      uploadBarrier.cleanup();
      prisma.complaint.findUnique = originalFindUnique;
      if (originalUploadBuffer) {
        vi.mocked(uploadBuffer).mockImplementation(originalUploadBuffer);
      }
    }
  });

  it('winning asset protection: winning transaction persists attachment, concurrent loser compensates only its own asset, and subsequent append-update failure cleans up only its own asset', async () => {
    vi.mocked(deleteAsset).mockClear();
    vi.mocked(uploadBuffer).mockClear();

    const sharedKey = `idem-winning-protect-${Date.now()}`;
    const evidenceA = {
      PHOTO: { buffer: Buffer.from('photo-payload-A'), originalName: 'evidence_A.jpg' },
    };
    const evidenceB = {
      PHOTO: { buffer: Buffer.from('photo-payload-B'), originalName: 'evidence_B.jpg' },
    };

    const uploadBarrier = new ConcurrencyBarrier(2);
    const originalUploadBuffer = vi.mocked(uploadBuffer).getMockImplementation();
    let uploadIndex = 0;
    vi.mocked(uploadBuffer).mockImplementation(async (_buffer, _options) => {
      uploadIndex++;
      const id = `test/protect_asset_${uploadIndex}_${Date.now()}`;
      const asset = {
        url: `https://cdn.test/${id}.jpg`,
        publicId: id,
        resourceType: 'image' as const,
        format: 'jpg',
        bytes: 10000 + uploadIndex,
        durationSec: null,
      };
      await uploadBarrier.arriveAndAwait();
      return asset;
    });

    let originalFindFirst = prisma.complaint.findFirst;
    let failTxSpy: any;

    try {
      const [resA, resB] = await Promise.all([
        create(
          driver1UserId,
          {
            title: 'Protected asset race A',
            description: 'Payload A from device',
            category: 'BREAKDOWN',
            priority: 'HIGH',
            idempotencyKey: sharedKey,
          },
          evidenceA,
        ),
        create(
          driver1UserId,
          {
            title: 'Protected asset race B',
            description: 'Payload B from device',
            category: 'BREAKDOWN',
            priority: 'HIGH',
            idempotencyKey: sharedKey,
          },
          evidenceB,
        ),
      ]);

      expect(resA.id).toBe(resB.id);

      // Verify winning attachment in DB
      const complaintInDb = await prisma.complaint.findUniqueOrThrow({
        where: { id: resA.id },
        include: { attachments: true },
      });
      expect(complaintInDb.attachments.length).toBe(1);
      const winningAssetId = complaintInDb.attachments[0]!.publicId;

      // Verify that the winning asset was NEVER sent to deleteAsset
      const deletedAfterRace = vi.mocked(deleteAsset).mock.calls.map((c) => c[0]);
      expect(deletedAfterRace).not.toContain(winningAssetId);
      expect(deletedAfterRace.length).toBe(1); // exactly 1 losing asset was compensated
      const losingAssetId = deletedAfterRace[0];
      expect(losingAssetId).not.toBe(winningAssetId);

      // Now verify subsequent failure on the append-update path:
      // An append update arrives within 5 minutes with the same driver, category, and title,
      // without an idempotencyKey, matching the winning complaint.
      // Ensure that a failed transaction during append cleans up ONLY its own uploaded asset,
      // and never touches the winning asset!
      vi.mocked(deleteAsset).mockClear();

      const failedAssetPublicId = `test/protect_asset_failed_${Date.now()}`;
      vi.mocked(uploadBuffer).mockImplementationOnce(async () => ({
        url: `https://cdn.test/${failedAssetPublicId}.jpg`,
        publicId: failedAssetPublicId,
        resourceType: 'image' as const,
        format: 'jpg',
        bytes: 9999,
        durationSec: null,
      }));

      // Confirm the failed operation follows the intended append-update path:
      // Intercept prisma.complaint.findFirst to prove it matched the existing open winning complaint
      originalFindFirst = prisma.complaint.findFirst;
      let foundMatchingOpenComplaint: any = null;
      prisma.complaint.findFirst = (async (args: any) => {
        const found = await originalFindFirst(args);
        if (args?.where?.title?.equals === complaintInDb.title && args?.where?.category === complaintInDb.category) {
          foundMatchingOpenComplaint = found;
        }
        return found;
      }) as any;

      // Track that the append transaction branch is indeed entered and targets complaintInDb.id
      let appendTransactionInvoked = false;
      let targetedComplaintId: string | null = null;
      failTxSpy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (cb: any, _options: any) => {
        if (typeof cb === 'function') {
          appendTransactionInvoked = true;
          // Invoke the callback with an intercepted tx to capture the complaintId targeted by the append
          const mockTx = {
            complaintAttachment: {
              createMany: vi.fn(async ({ data }: any) => {
                targetedComplaintId = data[0]?.complaintId;
                throw new Error('Simulated atomic failure during append update');
              }),
            },
          };
          return cb(mockTx);
        }
        throw new Error('Simulated atomic failure during append update');
      });

      await expect(
        create(
          driver1UserId,
          {
            title: complaintInDb.title, // Matches existing open complaint title
            description: 'Additional notes on broken part during append update',
            category: complaintInDb.category, // Matches existing open complaint category
            priority: 'HIGH',
            vehicleId: complaintInDb.vehicleId ?? undefined,
            // Explicitly no idempotencyKey so it exercises the 5-minute append-update deduplication path
          },
          {
            PHOTO: { buffer: Buffer.from('failed-part-data'), originalName: 'broken_gear.jpg' },
          },
        ),
      ).rejects.toThrow(/Simulated atomic failure during append update/);

      // Confirm that the append-update path was indeed matched and followed:
      expect(foundMatchingOpenComplaint).not.toBeNull();
      expect(foundMatchingOpenComplaint?.id).toBe(complaintInDb.id);
      expect(appendTransactionInvoked).toBe(true);
      expect(targetedComplaintId).toBe(complaintInDb.id);

      // Assert that deleteAsset was called for the failed asset ONLY
      expect(deleteAsset).toHaveBeenCalledWith(failedAssetPublicId, 'image');
      expect(deleteAsset).not.toHaveBeenCalledWith(winningAssetId, expect.anything());

      // Assert winning complaint and its asset are STILL intact in PostgreSQL!
      const recheckedComplaint = await prisma.complaint.findUniqueOrThrow({
        where: { id: resA.id },
        include: { attachments: true },
      });
      expect(recheckedComplaint.attachments.length).toBe(1);
      expect(recheckedComplaint.attachments[0]!.publicId).toBe(winningAssetId);
    } finally {
      uploadBarrier.cleanup();
      prisma.complaint.findFirst = originalFindFirst;
      if (failTxSpy) failTxSpy.mockRestore();
      if (originalUploadBuffer) {
        vi.mocked(uploadBuffer).mockImplementation(originalUploadBuffer);
      }
    }
  });

  it('handles concurrent append updates on existing open complaints and compensates on failure', async () => {
    vi.mocked(deleteAsset).mockClear();

    // Create an initial open complaint
    const initial = await create(driver1UserId, {
      title: 'Transmission noise',
      description: 'Gear grinding in 3rd',
      category: 'BREAKDOWN',
      priority: 'HIGH',
      idempotencyKey: `init-append-${Date.now()}`,
    });
    expect(initial.id).toBeDefined();

    // Concurrent append attempt: simulate transaction failure on append matching initial title & category
    const txSpy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('Append transaction deadlocked'));
    const evidence = {
      PHOTO: {
        buffer: Buffer.from('append-fail-evidence'),
        originalName: 'gear.jpg',
      },
    };

    try {
      await expect(
        create(
          driver1UserId,
          {
            title: initial.title,
            description: 'Now grinding in 4th gear as well',
            category: initial.category,
            priority: 'HIGH',
            vehicleId: initial.vehicleId ?? undefined,
          },
          evidence,
        ),
      ).rejects.toThrow(/Append transaction deadlocked/);

      // Failed append compensates its own uploaded assets
      expect(deleteAsset).toHaveBeenCalled();
    } finally {
      txSpy.mockRestore();
    }
  });
});
