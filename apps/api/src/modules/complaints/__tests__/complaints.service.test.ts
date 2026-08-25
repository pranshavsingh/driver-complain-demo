import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { ComplaintListQuery } from '@driver-complaint/shared-types';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { create, list, getOne, updateStatus, assign, type Actor } from '../complaints.service';

// Cloudinary is mocked so the evidence-upload path runs without real credentials or a network
// call. Only uploadBuffer is faked; the rest of the service stays real.
vi.mock('../../../lib/cloudinary', () => {
  // publicId is unique in the schema, so one fixed asset would collide the moment a complaint
  // carries two files. Each call gets its own.
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
        publicId: `test/asset_${n}`,
        resourceType: options.resourceType ?? 'image',
        format: isImage ? 'jpg' : 'mp4',
        bytes: 12345,
        // Only cloudinary's video pipeline — which also carries audio — reports a duration.
        durationSec: isImage ? null : 12,
      };
    }),
  };
});

// Self-contained integration test — requires a migrated database (docker compose up -d db).
const D1 = 'CTEST_D1'; // driver who owns the complaints under test
const D2 = 'CTEST_D2'; // a second driver, for cross-driver scoping/authorization
const A1 = 'CTEST_A1'; // an admin, for status changes / assignment

let driver1UserId: string;
let driver1Id: string;
let driver2UserId: string;
let driver2Id: string;
let adminUserId: string;
let vehicle1Id: string;

const driverActor = (userId: string): Actor => ({ id: userId, role: 'DRIVER' });
const adminActor = (): Actor => ({ id: adminUserId, role: 'ADMIN' });

/** Build a fully-typed list query with sensible paging defaults. */
function q(extra: Partial<ComplaintListQuery> = {}): ComplaintListQuery {
  return { page: 1, pageSize: 20, ...extra };
}

/** Remove every complaint owned by the test drivers (+ the notifications pointing at them). */
async function cleanupComplaints(): Promise<void> {
  const complaints = await prisma.complaint.findMany({
    where: { driverId: { in: [driver1Id, driver2Id] } },
    select: { id: true },
  });
  const ids = complaints.map((c) => c.id);
  if (ids.length === 0) return;
  // Notifications SetNull on complaint delete, so clear them explicitly (covers admin + driver rows).
  await prisma.notification.deleteMany({ where: { complaintId: { in: ids } } });
  // Deleting the complaint cascades its updates + attachments.
  await prisma.complaint.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const pinHash = await hashPin('9999');

  const admin = await prisma.user.upsert({
    where: { employeeId: A1 },
    update: { pinHash, isActive: true, role: 'ADMIN' },
    create: { employeeId: A1, pinHash, role: 'ADMIN', firstName: 'Admin', lastName: 'Tester' },
  });
  adminUserId = admin.id;

  const u1 = await prisma.user.upsert({
    where: { employeeId: D1 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: D1, pinHash, role: 'DRIVER', firstName: 'Dee', lastName: 'One' },
  });
  driver1UserId = u1.id;
  const d1 = await prisma.driver.upsert({
    where: { userId: u1.id },
    update: {},
    create: { userId: u1.id, licenseNumber: 'CTEST-DL-1' },
  });
  driver1Id = d1.id;
  const v1 = await prisma.vehicle.upsert({
    where: { plateNumber: 'CTEST-PLATE-1' },
    update: { driverId: d1.id },
    create: { driverId: d1.id, plateNumber: 'CTEST-PLATE-1', make: 'Test', model: 'Van' },
  });
  vehicle1Id = v1.id;

  const u2 = await prisma.user.upsert({
    where: { employeeId: D2 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: D2, pinHash, role: 'DRIVER', firstName: 'Dee', lastName: 'Two' },
  });
  driver2UserId = u2.id;
  const d2 = await prisma.driver.upsert({
    where: { userId: u2.id },
    update: {},
    create: { userId: u2.id, licenseNumber: 'CTEST-DL-2' },
  });
  driver2Id = d2.id;
});

beforeEach(cleanupComplaints);

afterAll(async () => {
  await cleanupComplaints();
  // Deleting the users cascades their drivers → vehicles, and any leftover notifications/tokens.
  await prisma.user.deleteMany({ where: { employeeId: { in: [D1, D2, A1] } } });
  await prisma.$disconnect();
});

describe('complaints.service — create', () => {
  it('generates a DC-<year>-###### number, opens at NEW, and logs the opening entry', async () => {
    const year = new Date().getFullYear();
    const complaint = await create(driver1UserId, {
      title: 'Broken wiper',
      description: 'It fell off',
    });

    expect(complaint.complaintNo).toMatch(new RegExp(`^DC-${year}-\\d{6}$`));
    expect(complaint.status).toBe('NEW');
    expect(complaint.priority).toBe('MEDIUM');
    expect(complaint.driverId).toBe(driver1Id);

    const updates = await prisma.complaintUpdate.findMany({ where: { complaintId: complaint.id } });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.toStatus).toBe('NEW');
  });

  it('notifies every active admin that a complaint was created', async () => {
    const complaint = await create(driver1UserId, { title: 'Flat tyre', description: 'Rear left' });
    const notes = await prisma.notification.findMany({
      where: { complaintId: complaint.id, type: 'COMPLAINT_CREATED' },
    });
    // Includes the seeded admins plus our test admin — assert ours is among them.
    expect(notes.some((n) => n.userId === adminUserId)).toBe(true);
  });

  it('accepts a vehicle the driver owns', async () => {
    const complaint = await create(driver1UserId, {
      title: 'Engine light',
      description: 'On since morning',
      vehicleId: vehicle1Id,
    });
    expect(complaint.vehicleId).toBe(vehicle1Id);
  });

  it('rejects a vehicle that belongs to another driver', async () => {
    await expect(
      create(driver2UserId, { title: 'Nope', description: 'x', vehicleId: vehicle1Id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a caller who has no driver profile', async () => {
    await expect(create(adminUserId, { title: 'Nope', description: 'x' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('uploads and attaches a photo when one is supplied', async () => {
    const complaint = await create(
      driver1UserId,
      { title: 'Cracked mirror', description: 'Photo attached' },
      { PHOTO: { buffer: Buffer.from('fake-image-bytes'), originalName: 'mirror.jpg' } },
    );

    const attachments = await prisma.complaintAttachment.findMany({
      where: { complaintId: complaint.id },
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.kind).toBe('PHOTO');
    expect(attachments[0]?.resourceType).toBe('image');
    expect(attachments[0]?.uploadedById).toBe(driver1UserId);
    expect(attachments[0]?.originalName).toBe('mirror.jpg');
    // A still has no timeline, so no duration is stored.
    expect(attachments[0]?.durationSec).toBeNull();
  });

  it('attaches a photo, a voice note and a video from one submission', async () => {
    const complaint = await create(
      driver1UserId,
      { title: 'All three', description: 'x' },
      {
        PHOTO: { buffer: Buffer.from('img'), originalName: 'a.jpg' },
        VOICE: { buffer: Buffer.from('aud'), originalName: 'a.m4a' },
        VIDEO: { buffer: Buffer.from('vid'), originalName: 'a.mp4' },
      },
    );

    const attachments = await prisma.complaintAttachment.findMany({
      where: { complaintId: complaint.id },
    });
    expect(attachments.map((a) => a.kind).sort()).toEqual(['PHOTO', 'VIDEO', 'VOICE']);
    // A voice note goes up cloudinary's video pipeline, so it comes back with resourceType
    // "video" and a duration — which is exactly why `kind` cannot be derived from resourceType.
    const voice = attachments.find((a) => a.kind === 'VOICE');
    expect(voice?.resourceType).toBe('video');
    expect(voice?.durationSec).toBe(12);
  });

  it('creates no attachment when no evidence is supplied', async () => {
    const complaint = await create(driver1UserId, { title: 'No photo', description: 'x' });
    const attachments = await prisma.complaintAttachment.findMany({
      where: { complaintId: complaint.id },
    });
    expect(attachments).toHaveLength(0);
  });
});

describe('complaints.service — list', () => {
  it('scopes a driver to their own complaints only', async () => {
    await create(driver1UserId, { title: 'A', description: 'a' });
    await create(driver1UserId, { title: 'B', description: 'b' });
    await create(driver2UserId, { title: 'C', description: 'c' });

    const res = await list(driverActor(driver1UserId), q());
    expect(res.meta.total).toBe(2);
    expect(res.data.every((c) => c.driverId === driver1Id)).toBe(true);
  });

  it('lets an admin see everything and filter by driver', async () => {
    const mine = await create(driver1UserId, { title: 'A', description: 'a' });
    const theirs = await create(driver2UserId, { title: 'C', description: 'c' });

    // Asserted by membership, not by meta.total: an admin's unfiltered list spans the whole
    // table, which in a dev database also holds seed and manually-created rows. Counting it
    // makes the test fail for reasons that have nothing to do with admin scoping.
    const all = await list(adminActor(), q({ pageSize: 100 }));
    const ids = all.data.map((c) => c.id);
    expect(ids).toContain(mine.id);
    expect(ids).toContain(theirs.id);

    const onlyD2 = await list(adminActor(), q({ driverId: driver2Id }));
    expect(onlyD2.meta.total).toBe(1);
    expect(onlyD2.data[0]?.driverId).toBe(driver2Id);
  });

  it('supports free-text search across the title', async () => {
    await create(driver1UserId, { title: 'Windshield crack ZZZUNIQUE', description: 'x' });
    await create(driver1UserId, { title: 'Unrelated', description: 'y' });

    const res = await list(adminActor(), q({ search: 'zzzunique' }));
    expect(res.meta.total).toBe(1);
    expect(res.data[0]?.title).toContain('ZZZUNIQUE');
  });

  it('filters by status', async () => {
    const open = await create(driver1UserId, { title: 'stays new', description: 'x' });
    const moved = await create(driver1UserId, { title: 'goes in progress', description: 'y' });
    await updateStatus(adminUserId, moved.id, { status: 'IN_PROGRESS' });

    const res = await list(adminActor(), q({ status: 'NEW' }));
    expect(res.data.map((c) => c.id)).toContain(open.id);
    expect(res.data.map((c) => c.id)).not.toContain(moved.id);
  });
});

describe('complaints.service — getOne', () => {
  it('returns the detail view with driver summary and timeline', async () => {
    const created = await create(driver1UserId, { title: 'Detail me', description: 'x' });
    const detail = await getOne(driverActor(driver1UserId), created.id);

    expect(detail.id).toBe(created.id);
    expect(detail.driver.driverId).toBe(driver1Id);
    expect(detail.driver.licenseNumber).toBe('CTEST-DL-1');
    expect(detail.attachments).toEqual([]);
    expect(detail.updates.length).toBeGreaterThanOrEqual(1);
  });

  it('names the author of each timeline entry', async () => {
    const created = await create(driver1UserId, { title: 'Who did this', description: 'x' });
    await updateStatus(adminUserId, created.id, { status: 'IN_PROGRESS', note: 'On it' });

    const detail = await getOne(adminActor(), created.id);
    // Opened by the driver, moved on by the admin — the audit trail must show both by name.
    const authors = detail.updates.map((u) => u.author.employeeId);
    expect(authors).toEqual([D1, A1]);
    expect(detail.updates[1]?.author.firstName).toBe('Admin');
  });

  it('forbids a driver from reading another driver’s complaint', async () => {
    const created = await create(driver1UserId, { title: 'Private', description: 'x' });
    await expect(getOne(driverActor(driver2UserId), created.id)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('404s for a non-existent complaint', async () => {
    await expect(
      getOne(adminActor(), '11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('complaints.service — updateStatus', () => {
  it('records the transition, stamps resolvedAt, and notifies the driver', async () => {
    const created = await create(driver1UserId, { title: 'Resolve me', description: 'x' });
    const updated = await updateStatus(adminUserId, created.id, {
      status: 'RESOLVED',
      note: 'Fixed on site',
    });

    expect(updated.status).toBe('RESOLVED');
    expect(updated.resolvedAt).not.toBeNull();

    const transition = await prisma.complaintUpdate.findFirst({
      where: { complaintId: created.id, toStatus: 'RESOLVED' },
    });
    expect(transition?.fromStatus).toBe('NEW');
    expect(transition?.note).toBe('Fixed on site');

    const note = await prisma.notification.findFirst({
      where: { complaintId: created.id, type: 'STATUS_CHANGED', userId: driver1UserId },
    });
    expect(note).not.toBeNull();
  });

  it('clears resolvedAt when a complaint is reopened', async () => {
    const created = await create(driver1UserId, { title: 'Reopen me', description: 'x' });
    await updateStatus(adminUserId, created.id, { status: 'RESOLVED' });
    const reopened = await updateStatus(adminUserId, created.id, { status: 'IN_PROGRESS' });
    expect(reopened.status).toBe('IN_PROGRESS');
    expect(reopened.resolvedAt).toBeNull();
  });
});

describe('complaints.service — assign', () => {
  it('assigns to an active admin and notifies them', async () => {
    const created = await create(driver1UserId, { title: 'Assign me', description: 'x' });
    const updated = await assign(adminUserId, created.id, { assignedToId: adminUserId });

    expect(updated.assignedToId).toBe(adminUserId);
    const note = await prisma.notification.findFirst({
      where: { complaintId: created.id, type: 'ASSIGNED', userId: adminUserId },
    });
    expect(note).not.toBeNull();
  });

  it('rejects assignment to a non-admin', async () => {
    const created = await create(driver1UserId, { title: 'Bad assign', description: 'x' });
    await expect(
      assign(adminUserId, created.id, { assignedToId: driver1UserId }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
