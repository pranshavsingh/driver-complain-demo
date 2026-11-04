import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { create } from '../complaints.service';

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
  };
});

vi.mock('../../../lib/transcribe', () => ({
  transcribeAudio: vi.fn(async () => null),
  transcribeAudioFromUrl: vi.fn(async () => null),
  translateText: vi.fn(async (text: string) => text),
}));

const IDEM_D1 = 'IDEM_DRIVER_1';
const IDEM_D2 = 'IDEM_DRIVER_2';

let driver1UserId: string;
let driver1Id: string;
let driver2UserId: string;
let driver2Id: string;

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
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.driver.deleteMany({ where: { userId: { in: [driver1UserId, driver2UserId].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { id: { in: [driver1UserId, driver2UserId].filter(Boolean) } } });
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
});
