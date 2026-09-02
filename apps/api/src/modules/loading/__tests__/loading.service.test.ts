import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import {
  markReachedLoadingPoint,
  markLoadingCompleted,
  startTrip,
  completeTrip,
  completeUnloading,
  getActiveLoadingRecord,
  getDriverMonthlyTripSummaries,
} from '../loading.service';

// Cloudinary is mocked so every milestone's photo-proof upload runs without real credentials
// or a network call. Only uploadBuffer is faked; the rest of the service stays real.
vi.mock('../../../lib/cloudinary', () => {
  // publicId is unique in the schema, so one fixed asset would collide the moment a single
  // trip records four proof photos. Each call gets its own.
  let n = 0;
  return {
    cloudinaryEnabled: true,
    cloudinaryFolder: 'test',
    cloudinary: {},
    uploadBuffer: vi.fn(async () => {
      n += 1;
      return {
        url: `https://cdn.test/loading_${n}.jpg`,
        publicId: `test/loading_${n}`,
        resourceType: 'image' as const,
        format: 'jpg',
        bytes: 12345,
        durationSec: null,
      };
    }),
  };
});

// Self-contained integration test — requires a migrated database (docker compose up -d db).
const D1 = 'LTEST_D1';

let driver1UserId: string;
let driver1Id: string;

const photo = () => Buffer.from('fake-image-bytes');
const gps = { latitude: 22.5726, longitude: 88.3639 };

/** Drive one cycle up to (but not including) the unloading tap. Returns the record id. */
async function reachUnloadingPoint(): Promise<string> {
  const reached = await markReachedLoadingPoint({ userId: driver1UserId, fileBuffer: photo(), ...gps });
  await markLoadingCompleted({ userId: driver1UserId, loadingId: reached.id, fileBuffer: photo(), ...gps });
  await startTrip({ userId: driver1UserId, loadingId: reached.id, ...gps });
  await completeTrip({ userId: driver1UserId, loadingId: reached.id, fileBuffer: photo(), ...gps });
  return reached.id;
}

async function cleanupLoadingRecords(): Promise<void> {
  await prisma.loadingRecord.deleteMany({ where: { driverId: driver1Id } });
}

beforeAll(async () => {
  const pinHash = await hashPin('9999');

  const u1 = await prisma.user.upsert({
    where: { employeeId: D1 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: D1, pinHash, role: 'DRIVER', firstName: 'Lana', lastName: 'Loader' },
  });
  driver1UserId = u1.id;
  const d1 = await prisma.driver.upsert({
    where: { userId: u1.id },
    update: {},
    create: { userId: u1.id, licenseNumber: 'LTEST-DL-1' },
  });
  driver1Id = d1.id;
  await prisma.vehicle.upsert({
    where: { plateNumber: 'LTEST-PLATE-1' },
    update: { driverId: d1.id },
    create: { driverId: d1.id, plateNumber: 'LTEST-PLATE-1', make: 'Test', model: 'Tipper' },
  });
});

beforeEach(cleanupLoadingRecords);

afterAll(async () => {
  await cleanupLoadingRecords();
  // Deleting the user cascades its driver → vehicles.
  await prisma.user.deleteMany({ where: { employeeId: D1 } });
  await prisma.$disconnect();
});

describe('loading.service — completeTrip parks the record in UNLOADING', () => {
  it('ends transit without closing the cycle', async () => {
    const reached = await markReachedLoadingPoint({ userId: driver1UserId, fileBuffer: photo(), ...gps });
    await markLoadingCompleted({ userId: driver1UserId, loadingId: reached.id, fileBuffer: photo(), ...gps });
    await startTrip({ userId: driver1UserId, loadingId: reached.id, ...gps });

    const arrived = await completeTrip({
      userId: driver1UserId,
      loadingId: reached.id,
      fileBuffer: photo(),
      address: 'Plant, Durgapur',
      ...gps,
    });

    // TRIP_COMPLETED is now reserved for "unloading done", so arrival must not claim it.
    expect(arrived.status).toBe('UNLOADING');
    expect(arrived.tripCompletedAt).not.toBeNull();
    expect(arrived.tripDurationMinutes).not.toBeNull();
    expect(arrived.unloadingCompletedAt ?? null).toBeNull();
    expect(arrived.unloadingDurationMinutes ?? null).toBeNull();
  });

  it('keeps the record as the driver’s active session so the timer resumes after a restart', async () => {
    const id = await reachUnloadingPoint();
    const { active } = await getActiveLoadingRecord(driver1UserId);

    expect(active?.id).toBe(id);
    expect(active?.status).toBe('UNLOADING');
    // The mobile card counts the unloading timer from this timestamp.
    expect(active?.tripCompletedAt).not.toBeNull();
  });

  // SAFETY-CRITICAL: an open unloading must block a second cycle, or the first record's
  // unloading time is orphaned and the vehicle silently disappears from the unloading bay.
  it('refuses a fresh loading session while unloading is still open', async () => {
    await reachUnloadingPoint();
    await expect(
      markReachedLoadingPoint({ userId: driver1UserId, fileBuffer: photo(), ...gps }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('loading.service — completeUnloading', () => {
  it('closes the cycle out to TRIP_COMPLETED with the unloading proof recorded', async () => {
    const id = await reachUnloadingPoint();

    const done = await completeUnloading({
      userId: driver1UserId,
      loadingId: id,
      fileBuffer: photo(),
      address: 'Plant bay 4, Durgapur',
      latitude: 23.52,
      longitude: 87.31,
    });

    expect(done.status).toBe('TRIP_COMPLETED');
    expect(done.unloadingCompletedAt).not.toBeNull();
    expect(done.unloadingAddress).toBe('Plant bay 4, Durgapur');
    expect(done.unloadingLatitude).toBe(23.52);
    expect(done.unloadingPhotoUrl).toMatch(/^https:\/\/cdn\.test\/loading_\d+\.jpg$/);
    // The driver no longer holds an open session.
    const { active } = await getActiveLoadingRecord(driver1UserId);
    expect(active).toBeNull();
  });

  it('measures the unloading wait from tripCompletedAt, not from trip start', async () => {
    const id = await reachUnloadingPoint();
    // Backdate arrival at the unloading point by 90 minutes; trip start goes back further so a
    // regression that measured from tripStartedAt would produce 150, not 90.
    const arrivedAt = new Date(Date.now() - 90 * 60_000);
    await prisma.loadingRecord.update({
      where: { id },
      data: { tripStartedAt: new Date(Date.now() - 150 * 60_000), tripCompletedAt: arrivedAt },
    });

    const done = await completeUnloading({
      userId: driver1UserId,
      loadingId: id,
      fileBuffer: photo(),
      ...gps,
    });

    expect(done.unloadingDurationMinutes).toBe(90);
    expect(done.formattedUnloadingDuration).toBe('01:30:00');
  });

  it('never reports a negative duration', async () => {
    const id = await reachUnloadingPoint();
    // Clock skew between the phone and the server can put arrival in the future.
    await prisma.loadingRecord.update({
      where: { id },
      data: { tripCompletedAt: new Date(Date.now() + 5 * 60_000) },
    });

    const done = await completeUnloading({
      userId: driver1UserId,
      loadingId: id,
      fileBuffer: photo(),
      ...gps,
    });
    expect(done.unloadingDurationMinutes).toBe(0);
  });

  it('rejects a record that is not in UNLOADING', async () => {
    const reached = await markReachedLoadingPoint({ userId: driver1UserId, fileBuffer: photo(), ...gps });
    await markLoadingCompleted({ userId: driver1UserId, loadingId: reached.id, fileBuffer: photo(), ...gps });
    await startTrip({ userId: driver1UserId, loadingId: reached.id, ...gps });

    // Still in transit — the driver has not reported reaching the unloading point.
    await expect(
      completeUnloading({ userId: driver1UserId, loadingId: reached.id, fileBuffer: photo(), ...gps }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a second tap on an already-closed trip', async () => {
    const id = await reachUnloadingPoint();
    await completeUnloading({ userId: driver1UserId, loadingId: id, fileBuffer: photo(), ...gps });

    await expect(
      completeUnloading({ userId: driver1UserId, loadingId: id, fileBuffer: photo(), ...gps }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('finds the open unloading session when no loadingId is supplied', async () => {
    await reachUnloadingPoint();
    const done = await completeUnloading({ userId: driver1UserId, fileBuffer: photo(), ...gps });
    expect(done.status).toBe('TRIP_COMPLETED');
  });
});

describe('loading.service — getDriverMonthlyTripSummaries', () => {
  it('sums and averages unloading minutes across a driver-month', async () => {
    const now = new Date();
    // Two closed trips in the current month: 30 and 90 minutes of unloading.
    for (const minutes of [30, 90]) {
      const id = await reachUnloadingPoint();
      await prisma.loadingRecord.update({
        where: { id },
        data: { tripCompletedAt: new Date(Date.now() - minutes * 60_000) },
      });
      await completeUnloading({ userId: driver1UserId, loadingId: id, fileBuffer: photo(), ...gps });
    }

    const summaries = await getDriverMonthlyTripSummaries({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      driverId: driver1Id,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].completedTripsCount).toBe(2);
    expect(summaries[0].totalUnloadingTimeMinutes).toBe(120);
    expect(summaries[0].avgUnloadingTimeMinutes).toBe(60);
  });

  it('reports zero rather than NaN for a driver-month with no unloading data', async () => {
    const now = new Date();
    // A cycle that stops at "loading done" — it counts as a trip but has no unloading row yet.
    const reached = await markReachedLoadingPoint({ userId: driver1UserId, fileBuffer: photo(), ...gps });
    await markLoadingCompleted({ userId: driver1UserId, loadingId: reached.id, fileBuffer: photo(), ...gps });

    const summaries = await getDriverMonthlyTripSummaries({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      driverId: driver1Id,
    });

    expect(summaries[0].totalUnloadingTimeMinutes).toBe(0);
    expect(summaries[0].avgUnloadingTimeMinutes).toBe(0);
  });
});
