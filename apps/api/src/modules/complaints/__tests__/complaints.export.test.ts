import { PassThrough, Readable } from 'node:stream';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import type { ComplaintExportQuery } from '@driver-complaint/shared-types';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { create, updateStatus, iterateForExport, type Actor } from '../complaints.service';
import { writeComplaintsXlsx, exportFilename } from '../complaints.export';

// Self-contained integration test — requires a migrated database (docker compose up -d db).
const D1 = 'XTEST_D1';
const D2 = 'XTEST_D2';
const A1 = 'XTEST_A1';

let driver1UserId: string;
let driver1Id: string;
let driver2UserId: string;
let driver2Id: string;
let adminUserId: string;
let vehicle1Id: string;

const driverActor = (userId: string): Actor => ({ id: userId, role: 'DRIVER' });
const adminActor = (): Actor => ({ id: adminUserId, role: 'ADMIN' });

function f(extra: Partial<ComplaintExportQuery> = {}): ComplaintExportQuery {
  return { ...extra };
}

/** Drain the batch generator into one flat array of rows. */
async function collect(actor: Actor, filter: ComplaintExportQuery): Promise<string[]> {
  const numbers: string[] = [];
  for await (const batch of iterateForExport(actor, filter)) {
    for (const row of batch) numbers.push(row.complaintNo);
  }
  return numbers;
}

/** Render the workbook to a buffer, exactly as the HTTP response would receive it. */
async function render(actor: Actor, filter: ComplaintExportQuery): Promise<ExcelJS.Workbook> {
  const chunks: Buffer[] = [];
  const out = new PassThrough();
  out.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    out.on('end', () => resolve());
    out.on('error', reject);
  });

  await writeComplaintsXlsx(out, iterateForExport(actor, filter));
  await finished;

  const workbook = new ExcelJS.Workbook();
  // Read back through a stream rather than xlsx.load(buffer): exceljs's bundled types
  // predate the generic Buffer<ArrayBuffer> in @types/node 24, so load() rejects it.
  await workbook.xlsx.read(Readable.from(Buffer.concat(chunks)));
  return workbook;
}

async function cleanupComplaints(): Promise<void> {
  const complaints = await prisma.complaint.findMany({
    where: { driverId: { in: [driver1Id, driver2Id] } },
    select: { id: true },
  });
  const ids = complaints.map((c) => c.id);
  if (ids.length === 0) return;
  await prisma.notification.deleteMany({ where: { complaintId: { in: ids } } });
  await prisma.complaint.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const pinHash = await hashPin('9999');

  const admin = await prisma.user.upsert({
    where: { employeeId: A1 },
    update: { pinHash, isActive: true, role: 'ADMIN' },
    create: { employeeId: A1, pinHash, role: 'ADMIN', firstName: 'Ada', lastName: 'Admin' },
  });
  adminUserId = admin.id;

  const u1 = await prisma.user.upsert({
    where: { employeeId: D1 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: D1, pinHash, role: 'DRIVER', firstName: 'Dana', lastName: 'Driver' },
  });
  driver1UserId = u1.id;
  const d1 = await prisma.driver.upsert({
    where: { userId: u1.id },
    update: {},
    create: { userId: u1.id, licenseNumber: 'XTEST-DL-1' },
  });
  driver1Id = d1.id;
  const v1 = await prisma.vehicle.upsert({
    where: { plateNumber: 'XTEST-PLATE-1' },
    update: { driverId: d1.id },
    create: { driverId: d1.id, plateNumber: 'XTEST-PLATE-1', make: 'Test', model: 'Van' },
  });
  vehicle1Id = v1.id;

  const u2 = await prisma.user.upsert({
    where: { employeeId: D2 },
    update: { pinHash, isActive: true, role: 'DRIVER' },
    create: { employeeId: D2, pinHash, role: 'DRIVER', firstName: 'Dev', lastName: 'Two' },
  });
  driver2UserId = u2.id;
  const d2 = await prisma.driver.upsert({
    where: { userId: u2.id },
    update: {},
    create: { userId: u2.id, licenseNumber: 'XTEST-DL-2' },
  });
  driver2Id = d2.id;
});

beforeEach(cleanupComplaints);

afterAll(async () => {
  await cleanupComplaints();
  await prisma.user.deleteMany({ where: { employeeId: { in: [D1, D2, A1] } } });
  await prisma.$disconnect();
});

describe('complaints export — row selection', () => {
  it('exports every matching row, ignoring the list endpoint’s pagination', async () => {
    for (let i = 0; i < 3; i += 1) {
      await create(driver1UserId, { title: `Export ${i}`, description: 'x' });
    }
    // Scoped to this file's driver: the export takes no pageSize, so an unfiltered count is
    // whatever the database happens to hold (seed rows, manual smoke-test rows) — not a
    // fixed number. beforeEach already cleared this driver's complaints.
    const numbers = await collect(adminActor(), f({ driverId: driver1Id }));
    expect(numbers).toHaveLength(3);
  });

  it('applies the same filters as the list endpoint', async () => {
    const stays = await create(driver1UserId, { title: 'stays new', description: 'x' });
    const moved = await create(driver1UserId, { title: 'moves on', description: 'y' });
    await updateStatus(adminUserId, moved.id, { status: 'IN_PROGRESS' });

    const numbers = await collect(adminActor(), f({ status: 'NEW' }));
    expect(numbers).toContain(stays.complaintNo);
    expect(numbers).not.toContain(moved.complaintNo);
  });

  it('honours free-text search', async () => {
    await create(driver1UserId, { title: 'Gearbox XPORTUNIQUE', description: 'x' });
    await create(driver1UserId, { title: 'Unrelated', description: 'y' });

    const numbers = await collect(adminActor(), f({ search: 'xportunique' }));
    expect(numbers).toHaveLength(1);
  });

  it('hard-scopes a driver to their own rows', async () => {
    const mine = await create(driver1UserId, { title: 'Mine', description: 'x' });
    await create(driver2UserId, { title: 'Theirs', description: 'y' });

    // The route is admin-only, but the scoping must hold at the service layer too.
    const numbers = await collect(driverActor(driver1UserId), f());
    expect(numbers).toEqual([mine.complaintNo]);
  });

  it('yields nothing for a caller with no driver profile', async () => {
    await create(driver1UserId, { title: 'Mine', description: 'x' });
    const numbers = await collect({ id: adminUserId, role: 'DRIVER' }, f());
    expect(numbers).toEqual([]);
  });
});

describe('complaints export — workbook', () => {
  it('writes a parseable sheet with a bold header row', async () => {
    await create(driver1UserId, { title: 'Header check', description: 'x' });

    const workbook = await render(adminActor(), f());
    const sheet = workbook.getWorksheet('Complaints');
    expect(sheet).toBeDefined();

    const header = sheet?.getRow(1);
    expect(header?.getCell(1).value).toBe('Complaint No');
    expect(header?.getCell(10).value).toBe('Evidence');
    expect(header?.getCell(13).value).toBe('Description');
    expect(header?.font?.bold).toBe(true);
  });

  it('renders relations as human-readable cells and dates as real dates', async () => {
    const created = await create(driver1UserId, {
      title: 'Brake noise',
      description: 'Grinding at low speed',
      vehicleId: vehicle1Id,
    });

    const workbook = await render(adminActor(), f({ driverId: driver1Id }));
    const row = workbook.getWorksheet('Complaints')?.getRow(2);

    expect(row?.getCell(1).value).toBe(created.complaintNo);
    expect(row?.getCell(2).value).toBe('Brake noise');
    expect(row?.getCell(3).value).toBe('NEW');
    expect(row?.getCell(5).value).toBe('Dana Driver');
    expect(row?.getCell(6).value).toBe(D1);
    expect(row?.getCell(7).value).toBe('XTEST-DL-1');
    expect(row?.getCell(8).value).toBe('XTEST-PLATE-1');
    // Unassigned, no evidence, and unresolved all render blank, never the string "null".
    expect(row?.getCell(9).value ?? '').toBe('');
    expect(row?.getCell(10).value ?? '').toBe('');
    expect(row?.getCell(12).value ?? '').toBe('');
    // A real Date, so Excel can sort and filter chronologically.
    expect(row?.getCell(11).value).toBeInstanceOf(Date);
    expect(row?.getCell(13).value).toBe('Grinding at low speed');
  });

  it('summarises attached evidence by kind', async () => {
    const created = await create(driver1UserId, { title: 'With evidence', description: 'x' });
    // Attachment rows are written directly: create()'s upload path needs Cloudinary, and this
    // test asserts the export's formatting, not the upload.
    await prisma.complaintAttachment.createMany({
      data: (
        [
          ['VOICE', 'voice'],
          ['PHOTO', 'one'],
          ['PHOTO', 'two'],
        ] as const
      ).map(([kind, slug]) => ({
        complaintId: created.id,
        uploadedById: driver1UserId,
        kind,
        url: `https://cdn.test/${slug}`,
        publicId: `xtest/${created.id}/${slug}`,
        resourceType: kind === 'PHOTO' ? 'image' : 'video',
      })),
    });

    const workbook = await render(adminActor(), f({ driverId: driver1Id }));
    const row = workbook.getWorksheet('Complaints')?.getRow(2);
    // Fixed kind order, not insertion order, so the column sorts consistently.
    expect(row?.getCell(10).value).toBe('2 photos, 1 voice note');
  });

  it('writes a header-only sheet when nothing matches', async () => {
    const workbook = await render(adminActor(), f({ search: 'nothing-matches-this' }));
    const sheet = workbook.getWorksheet('Complaints');
    expect(sheet?.getRow(1).getCell(1).value).toBe('Complaint No');
    expect(sheet?.actualRowCount).toBe(1);
  });
});

describe('exportFilename', () => {
  it('stamps the download with the export date', () => {
    expect(exportFilename(new Date('2026-08-22T10:30:00Z'))).toBe('complaints-2026-08-22.xlsx');
  });
});
