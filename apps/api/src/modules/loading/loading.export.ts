import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function exportTripFilename(now = new Date()): string {
  return `trip-details-${now.toISOString().slice(0, 10)}.xlsx`;
}

export async function writeTripsXlsx(out: Writable, batches: AsyncIterable<any[]>): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  const sheet = workbook.addWorksheet('Trip Details', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Driver', key: 'driver', width: 24 },
    { header: 'Employee ID', key: 'employeeId', width: 15 },
    { header: 'Vehicle', key: 'vehicle', width: 15 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Trip Started', key: 'startedAt', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Trip Completed', key: 'completedAt', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Start Location', key: 'startLocation', width: 45 },
    { header: 'Destination', key: 'destination', width: 45 },
    { header: 'Trip Duration (min)', key: 'tripDuration', width: 20 },
    { header: 'Loading Wait (min)', key: 'waitingTime', width: 20 },
    { header: 'Start GPS', key: 'startGps', width: 24 },
    { header: 'Destination GPS', key: 'destinationGps', width: 24 },
    { header: 'Completion Proof', key: 'proof', width: 45 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();

  for await (const rows of batches) {
    for (const row of rows) {
      const user = row.driver.user;
      sheet.addRow({
        driver: `${user.firstName} ${user.lastName}`,
        employeeId: user.employeeId,
        vehicle: row.driver.vehicles[0]?.plateNumber ?? '',
        status: row.status === 'TRIP_COMPLETED' ? 'Completed' : 'In progress',
        startedAt: row.tripStartedAt,
        completedAt: row.tripCompletedAt,
        startLocation: row.tripStartAddress ?? row.reachedAddress ?? '',
        destination: row.tripCompletedAddress ?? '',
        tripDuration: row.tripDurationMinutes,
        waitingTime: row.waitingTimeMinutes,
        startGps: row.tripStartLatitude != null ? `${row.tripStartLatitude}, ${row.tripStartLongitude}` : '',
        destinationGps: row.tripCompletedLatitude != null ? `${row.tripCompletedLatitude}, ${row.tripCompletedLongitude}` : '',
        proof: row.tripCompletedPhotoUrl ?? '',
      }).commit();
    }
  }
  sheet.commit();
  await workbook.commit();
}
