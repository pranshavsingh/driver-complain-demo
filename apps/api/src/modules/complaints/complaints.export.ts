import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import { ATTACHMENT_KINDS, type AttachmentKind } from '@driver-complaint/shared-types';
import type { ComplaintExportRow } from './complaints.service';

/** MIME type for .xlsx (OOXML spreadsheet). */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Excel's own date format — dates are written as real Dates so admins can sort and filter. */
const DATE_FORMAT = 'yyyy-mm-dd hh:mm';

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Complaint No', key: 'complaintNo', width: 18 },
  { header: 'Title', key: 'title', width: 32 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Priority', key: 'priority', width: 10 },
  { header: 'Driver', key: 'driver', width: 22 },
  { header: 'Driver ID', key: 'driverEmployeeId', width: 12 },
  { header: 'License No', key: 'licenseNumber', width: 16 },
  { header: 'Vehicle', key: 'vehicle', width: 14 },
  { header: 'Assigned To', key: 'assignedTo', width: 22 },
  { header: 'Evidence', key: 'evidence', width: 26 },
  { header: 'Created', key: 'createdAt', width: 18, style: { numFmt: DATE_FORMAT } },
  { header: 'Resolved', key: 'resolvedAt', width: 18, style: { numFmt: DATE_FORMAT } },
  { header: 'Description', key: 'description', width: 60 },
];

const EVIDENCE_LABELS: Record<AttachmentKind, [singular: string, plural: string]> = {
  PHOTO: ['photo', 'photos'],
  VOICE: ['voice note', 'voice notes'],
  VIDEO: ['video', 'videos'],
};

/**
 * "1 photo, 1 voice note" — what evidence came in, in a fixed kind order so the column sorts
 * consistently. Files themselves are not linked: Cloudinary URLs are long-lived and a
 * spreadsheet gets forwarded, so the export stays a summary and the dashboard stays the place
 * evidence is opened.
 */
function describeEvidence(attachments: { kind: AttachmentKind }[]): string {
  return ATTACHMENT_KINDS.flatMap((kind) => {
    const count = attachments.filter((a) => a.kind === kind).length;
    if (count === 0) return [];
    const [singular, plural] = EVIDENCE_LABELS[kind];
    return [`${count} ${count === 1 ? singular : plural}`];
  }).join(', ');
}

/** Filename for the download, e.g. complaints-2026-08-22.xlsx. */
export function exportFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `complaints-${date}.xlsx`;
}

/** Flatten one complaint (plus relations) into the sheet's column shape. */
function toCells(row: ComplaintExportRow): Record<string, string | number | Date | null> {
  const { user } = row.driver;
  return {
    complaintNo: row.complaintNo,
    title: row.title,
    status: row.status,
    priority: row.priority,
    driver: `${user.firstName} ${user.lastName}`,
    driverEmployeeId: user.employeeId,
    licenseNumber: row.driver.licenseNumber,
    // Optional relations render as blank cells rather than the string "null".
    vehicle: row.vehicle?.plateNumber ?? '',
    assignedTo: row.assignedTo ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}` : '',
    evidence: describeEvidence(row.attachments),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    description: row.description,
  };
}

/**
 * Write the complaints workbook straight to a writable stream (the HTTP response).
 *
 * Uses exceljs's streaming WorkbookWriter and commits each row as it goes, so neither the
 * full result set nor the full spreadsheet is ever held in memory. The stream is ended by
 * workbook.commit().
 */
export async function writeComplaintsXlsx(
  out: Writable,
  batches: AsyncIterable<ComplaintExportRow[]>,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  const sheet = workbook.addWorksheet('Complaints', {
    // Keep the header visible while scrolling a long export.
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.commit();

  for await (const batch of batches) {
    for (const row of batch) {
      sheet.addRow(toCells(row)).commit();
    }
  }

  sheet.commit();
  await workbook.commit();
}
