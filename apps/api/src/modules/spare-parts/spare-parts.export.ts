import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { SparePartRequestPublic } from '@driver-complaint/shared-types';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DATE_FORMAT = 'yyyy-mm-dd hh:mm';

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Request No', key: 'requestNo', width: 18 },
  { header: 'Date', key: 'createdAt', width: 18, style: { numFmt: DATE_FORMAT } },
  { header: 'Driver Name', key: 'driverName', width: 22 },
  { header: 'Driver ID', key: 'employeeId', width: 12 },
  { header: 'Driver Phone', key: 'phone', width: 15 },
  { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Type', key: 'type', width: 14 },
  { header: 'Part Requested', key: 'partName', width: 24 },
  { header: 'Qty Req', key: 'quantity', width: 10 },
  { header: 'Description / Note', key: 'description', width: 40 },
  { header: 'Evidence Attached', key: 'evidence', width: 20 },
  { header: 'Warehouse', key: 'warehouseName', width: 20 },
  { header: 'Issued Part Name', key: 'issuedPartName', width: 24 },
  { header: 'Issued Part No / S.N.', key: 'issuedPartNo', width: 22 },
  { header: 'Issued Qty', key: 'issuedQty', width: 12 },
  { header: 'Returned Part No (Old)', key: 'returnedPartNo', width: 24 },
  { header: 'Returned Condition', key: 'returnedPartCondition', width: 20 },
  { header: 'Approved / Issued By', key: 'approvedBy', width: 22 },
  { header: 'Issued At', key: 'issuedAt', width: 18, style: { numFmt: DATE_FORMAT } },
  { header: 'Admin Remarks', key: 'adminNotes', width: 30 },
  { header: 'Rejection Reason', key: 'rejectionReason', width: 30 },
];

export function exportFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `spare-parts-requisitions-${date}.xlsx`;
}

function describeEvidence(row: SparePartRequestPublic): string {
  const items: string[] = [];
  if (row.photoUrl) items.push('Photo');
  if (row.voiceUrl) items.push('Voice Note');
  return items.length > 0 ? items.join(', ') : 'None';
}

function toCells(row: SparePartRequestPublic): Record<string, any> {
  const user = row.driver?.user;
  const approvedUser = row.approvedBy;

  return {
    requestNo: row.requestNo,
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    driverName: user ? `${user.firstName} ${user.lastName}` : '',
    employeeId: user?.employeeId ?? '',
    phone: user?.phone ?? '',
    plateNumber: row.vehicle?.plateNumber ?? '',
    status: row.status.replace(/_/g, ' '),
    type: row.type,
    partName: row.partName ?? '',
    quantity: row.quantity,
    description: row.description,
    evidence: describeEvidence(row),
    warehouseName: row.warehouse?.name ?? '',
    issuedPartName: row.issuedPartName ?? '',
    issuedPartNo: row.issuedPartNo ?? '',
    issuedQty: row.issuedQty ?? '',
    returnedPartNo: row.returnedPartNo ?? '',
    returnedPartCondition: row.returnedPartCondition ?? '',
    approvedBy: approvedUser ? `${approvedUser.firstName} ${approvedUser.lastName} (${approvedUser.employeeId})` : '',
    issuedAt: row.issuedAt ? new Date(row.issuedAt) : null,
    adminNotes: row.adminNotes ?? '',
    rejectionReason: row.rejectionReason ?? '',
  };
}

export async function writeSparePartsXlsx(
  out: Writable,
  batches: AsyncIterable<SparePartRequestPublic[]>,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  const sheet = workbook.addWorksheet('Spare Parts Requisitions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };
  header.commit();

  for await (const batch of batches) {
    for (const row of batch) {
      sheet.addRow(toCells(row)).commit();
    }
  }

  sheet.commit();
  await workbook.commit();
}

