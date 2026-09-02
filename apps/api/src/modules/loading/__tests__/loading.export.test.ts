import { PassThrough, Readable } from 'node:stream';
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { formatDurationText } from '../loading.service';
import { exportTripFilename, writeTripsXlsx } from '../loading.export';

// No database and no Cloudinary: this file exercises the pure duration formatter and the
// streamed XLSX writer by feeding it hand-built rows in the shape iterateTripRecords yields.
// The lifecycle itself is covered by loading.service.test.ts, which does need Postgres.

/** One row in the shape `iterateTripRecords` yields (Prisma record + driver/user/vehicles). */
function tripRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'trip-1',
    status: 'TRIP_COMPLETED',
    driver: {
      licenseNumber: 'DL-1',
      user: { firstName: 'Dana', lastName: 'Driver', employeeId: 'EMP-1' },
      vehicles: [{ plateNumber: 'WB-01-AA-1111' }],
    },
    reachedAt: new Date('2026-09-01T06:00:00Z'),
    reachedAddress: 'Warehouse gate',
    tripStartedAt: new Date('2026-09-01T07:00:00Z'),
    tripStartAddress: 'Warehouse, Kolkata',
    tripStartLatitude: 22.5726,
    tripStartLongitude: 88.3639,
    tripCompletedAt: new Date('2026-09-01T07:40:00Z'),
    tripCompletedAddress: 'Plant, Durgapur',
    tripCompletedLatitude: 23.52,
    tripCompletedLongitude: 87.31,
    tripCompletedPhotoUrl: 'https://cdn.test/trip-end.jpg',
    tripDurationMinutes: 40,
    waitingTimeMinutes: 60,
    unloadingCompletedAt: new Date('2026-09-01T09:10:00Z'),
    unloadingAddress: 'Plant bay 4, Durgapur',
    unloadingPhotoUrl: 'https://cdn.test/unloaded.jpg',
    unloadingDurationMinutes: 90,
    ...overrides,
  };
}

/** Render the workbook to a buffer, exactly as the HTTP response would receive it. */
async function render(rows: any[]): Promise<ExcelJS.Worksheet> {
  const chunks: Buffer[] = [];
  const out = new PassThrough();
  out.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    out.on('end', () => resolve());
    out.on('error', reject);
  });

  await writeTripsXlsx(out, (async function* () {
    yield rows;
  })());
  await finished;

  const workbook = new ExcelJS.Workbook();
  // Read back through a stream rather than xlsx.load(buffer): exceljs's bundled types
  // predate the generic Buffer<ArrayBuffer> in @types/node 24, so load() rejects it.
  await workbook.xlsx.read(Readable.from(Buffer.concat(chunks)));
  const sheet = workbook.getWorksheet('Trip Details');
  if (!sheet) throw new Error('Trip Details sheet missing from workbook');
  return sheet;
}

describe('formatDurationText', () => {
  it('returns null for a duration that was never recorded', () => {
    expect(formatDurationText(null)).toBeNull();
    expect(formatDurationText(undefined)).toBeNull();
  });

  it('formats minutes into HH:MM:SS format', () => {
    expect(formatDurationText(0)).toBe('00:00:00');
    expect(formatDurationText(0.5)).toBe('00:00:30');
    expect(formatDurationText(45)).toBe('00:45:00');
    expect(formatDurationText(60)).toBe('01:00:00');
    expect(formatDurationText(125)).toBe('02:05:00');
  });
});

describe('exportTripFilename', () => {
  it('stamps the download with the export date', () => {
    expect(exportTripFilename(new Date('2026-09-02T10:30:00Z'))).toBe('trip-details-2026-09-02.xlsx');
  });
});

describe('trips XLSX export', () => {
  it('writes the unloading columns in the documented positions', async () => {
    const sheet = await render([tripRow()]);
    const header = sheet.getRow(1);

    expect(header.getCell(9).value).toBe('Trip Duration (min)');
    expect(header.getCell(10).value).toBe('Loading Wait (min)');
    expect(header.getCell(11).value).toBe('Unloading Done');
    expect(header.getCell(12).value).toBe('Unloading Duration (min)');
    expect(header.getCell(15).value).toBe('Completion Proof');
    expect(header.getCell(16).value).toBe('Unloading Proof');
    expect(header.font?.bold).toBe(true);
  });

  it('carries the unloading timestamp, duration and proof through to the row', async () => {
    const sheet = await render([tripRow()]);
    const row = sheet.getRow(2);

    expect(row.getCell(4).value).toBe('Completed');
    // Transit stays 40 min — the 90-minute unloading wait is additive, not folded in.
    expect(row.getCell(9).value).toBe(40);
    expect(row.getCell(12).value).toBe(90);
    // A real Date, so Excel can sort and filter chronologically.
    expect(row.getCell(11).value).toBeInstanceOf(Date);
    expect(row.getCell(16).value).toBe('https://cdn.test/unloaded.jpg');
  });

  it('labels a vehicle still at the unloading bay as "Unloading", not "In progress"', async () => {
    const sheet = await render([
      tripRow({
        status: 'UNLOADING',
        unloadingCompletedAt: null,
        unloadingAddress: null,
        unloadingPhotoUrl: null,
        unloadingDurationMinutes: null,
      }),
    ]);
    const row = sheet.getRow(2);

    expect(row.getCell(4).value).toBe('Unloading');
    // Transit is already known at this point; the unloading total is not.
    expect(row.getCell(9).value).toBe(40);
    expect(row.getCell(12).value ?? '').toBe('');
    expect(row.getCell(16).value ?? '').toBe('');
  });

  it('still labels a mid-transit row "In progress"', async () => {
    const sheet = await render([tripRow({ status: 'TRIP_STARTED' })]);
    expect(sheet.getRow(2).getCell(4).value).toBe('In progress');
  });

  it('writes a header-only sheet when nothing matches', async () => {
    const sheet = await render([]);
    expect(sheet.getRow(1).getCell(1).value).toBe('Driver');
    expect(sheet.actualRowCount).toBe(1);
  });
});
