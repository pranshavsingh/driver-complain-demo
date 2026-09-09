import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { VehicleFullReportResponse } from '@driver-complaint/shared-types';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function exportVehicleReportFilename(plateNumber = 'vehicle', now = new Date()): string {
  const safePlate = plateNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `vehicle-report-${safePlate}-${now.toISOString().slice(0, 10)}.xlsx`;
}

export async function writeVehicleReportXlsx(
  out: Writable,
  report: VehicleFullReportResponse,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });

  const vehicle = report.vehicle;
  const driver = report.driver;
  const summary = report.summary;

  // -------------------------------------------------------------
  // Sheet 1: Executive Summary & Overview
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Vehicle Overview', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  summarySheet.columns = [
    { header: 'Metric / Attribute', key: 'metric', width: 35 },
    { header: 'Value / Information', key: 'value', width: 45 },
  ];
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0D5C3A' }, // Rich dark green
  };
  summarySheet.getRow(1).commit();

  const driverName = driver ? `${driver.firstName} ${driver.lastName}`.trim() : 'Unassigned';
  const driverEmpId = driver?.employeeId ?? 'N/A';
  const plateNo = vehicle?.plateNumber ?? 'N/A';
  const makeModel = vehicle ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') : 'N/A';

  const summaryRows = [
    { metric: 'Vehicle Plate Number', value: plateNo },
    { metric: 'Make / Model / Year', value: makeModel },
    { metric: 'VIN / Chassis Number', value: vehicle?.vin ?? 'N/A' },
    { metric: 'Assigned Driver', value: `${driverName} (${driverEmpId})` },
    { metric: 'Driver License Number', value: driver?.licenseNumber ?? 'N/A' },
    { metric: '---', value: '---' },
    { metric: 'Total Trips Logged', value: summary.totalTrips },
    { metric: 'Completed Trips', value: summary.completedTrips },
    { metric: 'Total Loading Wait Time (Minutes)', value: `${summary.totalLoadingWaitMinutes} mins` },
    { metric: 'Total Transit Duration (Minutes)', value: `${summary.totalTripDurationMinutes} mins` },
    { metric: 'Total Unloading Wait Time (Minutes)', value: `${summary.totalUnloadingWaitMinutes} mins` },
    { metric: '---', value: '---' },
    { metric: 'Total Issues & Complaints', value: summary.totalComplaints },
    { metric: 'Breakdowns Count', value: summary.breakdownCount },
    { metric: 'Tyre Issues Count', value: summary.tyreIssueCount },
    { metric: 'Fuel / DEF Issues Count', value: summary.fuelIssueCount },
    { metric: '---', value: '---' },
    { metric: 'Total Fuel / DEF Filled', value: `${summary.totalFuelLtr} Litres` },
    { metric: 'Total Fuel / DEF Cost', value: `₹${summary.totalFuelCost.toLocaleString()}` },
    { metric: 'Total Maintenance & Tyre Cost', value: `₹${summary.totalMaintenanceCost.toLocaleString()}` },
  ];

  for (const r of summaryRows) {
    summarySheet.addRow(r).commit();
  }
  summarySheet.commit();

  // -------------------------------------------------------------
  // Sheet 2: Trip & Loading Milestones
  // -------------------------------------------------------------
  const tripsSheet = workbook.addWorksheet('Trip & Loading Milestones', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  tripsSheet.columns = [
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Driver', key: 'driver', width: 22 },
    { header: 'Reached Loading Time', key: 'reachedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Loading Location / Address', key: 'reachedAddress', width: 35 },
    { header: 'Loading Completed Time', key: 'completedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Loading Wait (min)', key: 'waitingTimeMinutes', width: 18 },
    { header: 'Trip Started Time', key: 'tripStartedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Trip Departure Address', key: 'tripStartAddress', width: 35 },
    { header: 'Destination Reached Time', key: 'tripCompletedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Destination Address', key: 'tripCompletedAddress', width: 35 },
    { header: 'Transit Duration (min)', key: 'tripDurationMinutes', width: 20 },
    { header: 'Unloading Completed Time', key: 'unloadingCompletedAt', width: 24, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Unloading Duration (min)', key: 'unloadingDurationMinutes', width: 22 },
    { header: 'Loading Photo Proof', key: 'reachedPhotoUrl', width: 40 },
    { header: 'Loaded Photo Proof', key: 'completedPhotoUrl', width: 40 },
    { header: 'Destination Photo Proof', key: 'tripCompletedPhotoUrl', width: 40 },
    { header: 'Unloaded Photo Proof', key: 'unloadingPhotoUrl', width: 40 },
  ];
  tripsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tripsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' }, // Dark steel blue
  };
  tripsSheet.getRow(1).commit();

  for (const t of report.trips) {
    tripsSheet.addRow({
      status: t.status,
      driver: t.driverName ? `${t.driverName} (${t.driverEmployeeId})` : '',
      reachedAt: t.reachedAt ? new Date(t.reachedAt) : '',
      reachedAddress: t.reachedAddress ?? '',
      completedAt: t.completedAt ? new Date(t.completedAt) : '',
      waitingTimeMinutes: t.waitingTimeMinutes ?? '',
      tripStartedAt: t.tripStartedAt ? new Date(t.tripStartedAt) : '',
      tripStartAddress: t.tripStartAddress ?? '',
      tripCompletedAt: t.tripCompletedAt ? new Date(t.tripCompletedAt) : '',
      tripCompletedAddress: t.tripCompletedAddress ?? '',
      tripDurationMinutes: t.tripDurationMinutes ?? '',
      unloadingCompletedAt: t.unloadingCompletedAt ? new Date(t.unloadingCompletedAt) : '',
      unloadingDurationMinutes: t.unloadingDurationMinutes ?? '',
      reachedPhotoUrl: t.reachedPhotoUrl ?? '',
      completedPhotoUrl: t.completedPhotoUrl ?? '',
      tripCompletedPhotoUrl: t.tripCompletedPhotoUrl ?? '',
      unloadingPhotoUrl: t.unloadingPhotoUrl ?? '',
    }).commit();
  }
  tripsSheet.commit();

  // -------------------------------------------------------------
  // Sheet 3: Incidents & Complaints
  // -------------------------------------------------------------
  const complaintsSheet = workbook.addWorksheet('Issues & Complaints', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  complaintsSheet.columns = [
    { header: 'Complaint No', key: 'complaintNo', width: 18 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Description / Notes', key: 'description', width: 45 },
    { header: 'Reported At', key: 'createdAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Resolved At', key: 'resolvedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Voice Note URL', key: 'voiceUrl', width: 35 },
    { header: 'Photo Proof URLs', key: 'photoUrls', width: 50 },
  ];
  complaintsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  complaintsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF833C0C' }, // Dark burnt orange
  };
  complaintsSheet.getRow(1).commit();

  for (const c of report.complaints) {
    complaintsSheet.addRow({
      complaintNo: c.complaintNo,
      category: c.category,
      priority: c.priority,
      status: c.status,
      title: c.title,
      description: c.description,
      createdAt: new Date(c.createdAt),
      resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : '',
      voiceUrl: c.voiceUrl ?? '',
      photoUrls: (c.photoUrls ?? []).join(', '),
    }).commit();
  }
  complaintsSheet.commit();

  // -------------------------------------------------------------
  // Sheet 4: Fuel & Maintenance Ledger
  // -------------------------------------------------------------
  const maintenanceSheet = workbook.addWorksheet('Fuel & Maintenance', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  maintenanceSheet.columns = [
    { header: 'Type / Category', key: 'type', width: 18 },
    { header: 'Item / Fuel Description', key: 'item', width: 28 },
    { header: 'Quantity', key: 'quantity', width: 14 },
    { header: 'Total Amount (₹)', key: 'amount', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'Odometer (km)', key: 'odometerKm', width: 16 },
    { header: 'Brand / Position', key: 'details', width: 22 },
    { header: 'Notes', key: 'notes', width: 35 },
    { header: 'Date', key: 'createdAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Receipt / Photo Proof', key: 'photoUrl', width: 40 },
  ];
  maintenanceSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  maintenanceSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF374151' }, // Slate gray
  };
  maintenanceSheet.getRow(1).commit();

  // Add Fuel rows
  for (const f of report.fuelRecords) {
    maintenanceSheet.addRow({
      type: `${f.type} Refill`,
      item: `${f.quantityLtr} Litres`,
      quantity: f.quantityLtr,
      amount: f.totalPrice,
      odometerKm: f.odometerKm ?? '',
      details: f.ratePerLtr ? `₹${f.ratePerLtr}/L` : '',
      notes: f.notes ?? '',
      createdAt: new Date(f.createdAt),
      photoUrl: f.receiptUrl ?? '',
    }).commit();
  }

  // Add Tyre / Battery rows
  for (const m of report.maintenanceRecords) {
    maintenanceSheet.addRow({
      type: `${m.type} Service`,
      item: m.itemNumber,
      quantity: m.quantity,
      amount: m.cost ?? 0,
      odometerKm: m.odometerKm ?? '',
      details: [m.brand, m.position].filter(Boolean).join(' - '),
      notes: m.notes ?? '',
      createdAt: new Date(m.createdAt),
      photoUrl: m.photoUrl ?? '',
    }).commit();
  }
  maintenanceSheet.commit();

  await workbook.commit();
}
