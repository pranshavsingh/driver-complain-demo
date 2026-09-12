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
  await workbook.commit();
}

export function exportFleetReportFilename(now = new Date()): string {
  return `fleet-full-report-${now.toISOString().slice(0, 10)}.xlsx`;
}

export async function writeFleetFullReportXlsx(
  out: Writable,
  fleetData: import('./reports.service').FleetFullReportItem[],
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });

  // -------------------------------------------------------------
  // Sheet 1: Master Consolidated Operational Report (A-Z Details)
  // -------------------------------------------------------------
  const masterSheet = workbook.addWorksheet('Fleet Master Report (A-Z)', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  masterSheet.columns = [
    { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
    { header: 'Make & Model', key: 'makeModel', width: 22 },
    { header: 'Year', key: 'year', width: 10 },
    { header: 'VIN / Chassis', key: 'vin', width: 20 },
    { header: 'Agreement', key: 'agreementStatus', width: 15 },
    { header: 'Assigned Driver', key: 'driverName', width: 22 },
    { header: 'Driver Emp ID', key: 'driverEmployeeId', width: 14 },
    { header: 'Driver License', key: 'driverLicense', width: 18 },
    { header: 'Trip ID / Status', key: 'tripStatus', width: 20 },
    { header: 'Loading Arrival Time', key: 'reachedAt', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Loading Dock Location', key: 'reachedAddress', width: 32 },
    { header: 'Loading Done Time', key: 'completedAt', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Dock Wait (min)', key: 'waitingTimeMinutes', width: 16 },
    { header: 'Highway Departure Time', key: 'tripStartedAt', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Departure Location', key: 'tripStartAddress', width: 32 },
    { header: 'Destination Reached Time', key: 'tripCompletedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Destination Location', key: 'tripCompletedAddress', width: 32 },
    { header: 'Transit Duration (min)', key: 'tripDurationMinutes', width: 20 },
    { header: 'Unloading Done Time', key: 'unloadingCompletedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Unloading Wait (min)', key: 'unloadingDurationMinutes', width: 18 },
    { header: 'Total Trip Cycle (min)', key: 'totalCycleMinutes', width: 20 },
    { header: 'Issues On Trip (Qty)', key: 'tripComplaintsCount', width: 18 },
    { header: 'Breakdown On Trip?', key: 'hasBreakdown', width: 18 },
    { header: 'Trip Complaints / Incidents Detail', key: 'complaintsDetail', width: 50 },
    { header: 'Trip Incident Photo Proofs', key: 'complaintPhotos', width: 35 },
    { header: 'Trip Incident Voice Notes', key: 'complaintVoices', width: 35 },
    { header: 'Fuel Filled on Trip (L)', key: 'tripFuelQty', width: 18 },
    { header: 'Fuel Cost on Trip (₹)', key: 'tripFuelCost', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'DEF Filled on Trip (L)', key: 'tripDefQty', width: 18 },
    { header: 'DEF Cost on Trip (₹)', key: 'tripDefCost', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'Total Refuel Cost on Trip (₹)', key: 'tripTotalRefuelCost', width: 22, style: { numFmt: '₹#,##0.00' } },
    { header: 'Refuel Receipts / Details', key: 'tripRefuelDetails', width: 35 },
    { header: 'Loading Arrival Proof URL', key: 'reachedPhotoUrl', width: 35 },
    { header: 'Loaded Cargo Proof URL', key: 'completedPhotoUrl', width: 35 },
    { header: 'Destination Arrival Proof URL', key: 'tripCompletedPhotoUrl', width: 35 },
    { header: 'Unloaded Cargo Proof URL', key: 'unloadingPhotoUrl', width: 35 },
    { header: 'Vehicle All-Time Spend (₹)', key: 'vehicleTotalSpend', width: 22, style: { numFmt: '₹#,##0.00' } },
  ];
  masterSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  masterSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0D5C3A' }, // Rich dark green
  };
  masterSheet.getRow(1).commit();

  for (const item of fleetData) {
    const v = item.vehicle;
    const d = item.driver;
    const u = item.driverUser;
    const makeModel = [v.make, v.model].filter(Boolean).join(' ') || 'Standard Vehicle';
    const driverName = u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';
    const driverEmpId = u?.employeeId ?? 'N/A';
    const driverLicense = d?.licenseNumber ?? 'N/A';

    const totalFuelCost = item.fuelRecords.reduce((s, f) => s + f.totalPrice, 0);
    const totalMaintCost = item.maintenanceRecords.reduce((s, m) => s + (m.cost ?? 0), 0);
    const vehicleTotalSpend = totalFuelCost + totalMaintCost;

    if (item.trips.length === 0) {
      // Vehicle with no trips logged yet - write a vehicle summary row
      const complaintsSummary = item.complaints
        .map((c) => `[${c.complaintNo}] ${c.category} - ${c.title} (${c.status})`)
        .join(' | ');
      const hasBreakdown = item.complaints.some((c) => c.category === 'BREAKDOWN') ? 'YES' : 'NO';
      const complaintPhotos = item.complaints
        .flatMap((c) => c.attachments.filter((a) => a.kind === 'PHOTO').map((a) => a.url))
        .join(', ');
      const complaintVoices = item.complaints
        .flatMap((c) => c.attachments.filter((a) => a.kind === 'VOICE').map((a) => a.url))
        .join(', ');

      const totalFuelLtr = item.fuelRecords.filter((f) => f.type === 'FUEL').reduce((s, f) => s + f.quantityLtr, 0);
      const totalFuelPrice = item.fuelRecords.filter((f) => f.type === 'FUEL').reduce((s, f) => s + f.totalPrice, 0);
      const totalDefLtr = item.fuelRecords.filter((f) => f.type === 'DEF').reduce((s, f) => s + f.quantityLtr, 0);
      const totalDefPrice = item.fuelRecords.filter((f) => f.type === 'DEF').reduce((s, f) => s + f.totalPrice, 0);

      masterSheet.addRow({
        plateNumber: v.plateNumber,
        makeModel,
        year: v.year ?? '',
        vin: v.vin ?? '',
        agreementStatus: v.agreementStatus ?? '',
        driverName,
        driverEmployeeId: driverEmpId,
        driverLicense,
        tripStatus: 'NO TRIPS RECORDED',
        reachedAt: '',
        reachedAddress: '',
        completedAt: '',
        waitingTimeMinutes: '',
        tripStartedAt: '',
        tripStartAddress: '',
        tripCompletedAt: '',
        tripCompletedAddress: '',
        tripDurationMinutes: '',
        unloadingCompletedAt: '',
        unloadingDurationMinutes: '',
        totalCycleMinutes: '',
        tripComplaintsCount: item.complaints.length,
        hasBreakdown,
        complaintsDetail: complaintsSummary || 'No issues reported',
        complaintPhotos,
        complaintVoices,
        tripFuelQty: totalFuelLtr,
        tripFuelCost: totalFuelPrice,
        tripDefQty: totalDefLtr,
        tripDefCost: totalDefPrice,
        tripTotalRefuelCost: totalFuelPrice + totalDefPrice,
        tripRefuelDetails: item.fuelRecords.map((f) => `${f.type}: ${f.quantityLtr}L (₹${f.totalPrice})`).join('; '),
        reachedPhotoUrl: '',
        completedPhotoUrl: '',
        tripCompletedPhotoUrl: '',
        unloadingPhotoUrl: '',
        vehicleTotalSpend,
      }).commit();
    } else {
      // Iterate trips and correlate complaints and fuel
      for (const t of item.trips) {
        const reachMs = new Date(t.reachedAt).getTime();
        const endMs = t.unloadingCompletedAt
          ? new Date(t.unloadingCompletedAt).getTime()
          : t.tripCompletedAt
            ? new Date(t.tripCompletedAt).getTime() + 2 * 3600 * 1000
            : Date.now();

        // 30 min buffer around trip window
        const matchedComplaints = item.complaints.filter((c) => {
          const cMs = new Date(c.createdAt).getTime();
          return cMs >= reachMs - 30 * 60 * 1000 && cMs <= endMs + 30 * 60 * 1000;
        });

        const matchedFuel = item.fuelRecords.filter((f) => {
          const fMs = new Date(f.createdAt).getTime();
          return fMs >= reachMs - 30 * 60 * 1000 && fMs <= endMs + 30 * 60 * 1000;
        });

        const totalCycleMinutes =
          (t.waitingTimeMinutes ?? 0) +
          (t.tripDurationMinutes ?? 0) +
          (t.unloadingDurationMinutes ?? 0);

        const hasBreakdown = matchedComplaints.some((c) => c.category === 'BREAKDOWN') ? 'YES' : 'NO';
        const complaintsDetail = matchedComplaints
          .map((c) => `[${c.complaintNo}] ${c.category} - ${c.title} (${c.status}/${c.priority})${c.description ? `: ${c.description}` : ''}`)
          .join(' | ');

        const complaintPhotos = matchedComplaints
          .flatMap((c) => c.attachments.filter((a) => a.kind === 'PHOTO').map((a) => a.url))
          .join(', ');
        const complaintVoices = matchedComplaints
          .flatMap((c) => c.attachments.filter((a) => a.kind === 'VOICE').map((a) => a.url))
          .join(', ');

        const tripFuelList = matchedFuel.filter((f) => f.type === 'FUEL');
        const tripDefList = matchedFuel.filter((f) => f.type === 'DEF');

        const tripFuelQty = tripFuelList.reduce((s, f) => s + f.quantityLtr, 0);
        const tripFuelCost = tripFuelList.reduce((s, f) => s + f.totalPrice, 0);
        const tripDefQty = tripDefList.reduce((s, f) => s + f.quantityLtr, 0);
        const tripDefCost = tripDefList.reduce((s, f) => s + f.totalPrice, 0);
        const tripTotalRefuelCost = tripFuelCost + tripDefCost;

        const tripRefuelDetails = matchedFuel
          .map((f) => `${f.type}: ${f.quantityLtr}L (₹${f.totalPrice})${f.receiptUrl ? ` [Proof: ${f.receiptUrl}]` : ''}`)
          .join('; ');

        masterSheet.addRow({
          plateNumber: v.plateNumber,
          makeModel,
          year: v.year ?? '',
          vin: v.vin ?? '',
          agreementStatus: v.agreementStatus ?? '',
          driverName,
          driverEmployeeId: driverEmpId,
          driverLicense,
          tripStatus: t.status,
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
          totalCycleMinutes: totalCycleMinutes || '',
          tripComplaintsCount: matchedComplaints.length,
          hasBreakdown,
          complaintsDetail: complaintsDetail || 'None',
          complaintPhotos,
          complaintVoices,
          tripFuelQty,
          tripFuelCost,
          tripDefQty,
          tripDefCost,
          tripTotalRefuelCost,
          tripRefuelDetails,
          reachedPhotoUrl: t.reachedPhotoUrl ?? '',
          completedPhotoUrl: t.completedPhotoUrl ?? '',
          tripCompletedPhotoUrl: t.tripCompletedPhotoUrl ?? '',
          unloadingPhotoUrl: t.unloadingPhotoUrl ?? '',
          vehicleTotalSpend,
        }).commit();
      }
    }
  }
  masterSheet.commit();

  // -------------------------------------------------------------
  // Sheet 2: Fleet Vehicles Executive Summary
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Fleet Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  summarySheet.columns = [
    { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
    { header: 'Make & Model', key: 'makeModel', width: 22 },
    { header: 'Year', key: 'year', width: 10 },
    { header: 'VIN / Chassis', key: 'vin', width: 20 },
    { header: 'Agreement', key: 'agreementStatus', width: 15 },
    { header: 'Assigned Driver', key: 'driverName', width: 22 },
    { header: 'Driver Emp ID', key: 'driverEmployeeId', width: 14 },
    { header: 'Driver Phone', key: 'driverPhone', width: 16 },
    { header: 'Total Trips', key: 'totalTrips', width: 14 },
    { header: 'Completed Trips', key: 'completedTrips', width: 16 },
    { header: 'Active Status', key: 'activeStatus', width: 18 },
    { header: 'Total Issues', key: 'totalComplaints', width: 14 },
    { header: 'Breakdowns', key: 'breakdownCount', width: 14 },
    { header: 'Total Fuel (L)', key: 'totalFuelLtr', width: 16 },
    { header: 'Total Fuel Cost (₹)', key: 'totalFuelCost', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'Total DEF (L)', key: 'totalDefLtr', width: 16 },
    { header: 'Total DEF Cost (₹)', key: 'totalDefCost', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'Total Maintenance (₹)', key: 'totalMaintenanceCost', width: 20, style: { numFmt: '₹#,##0.00' } },
    { header: 'Total Spend (₹)', key: 'totalSpend', width: 20, style: { numFmt: '₹#,##0.00' } },
  ];
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' }, // Dark steel navy
  };
  summarySheet.getRow(1).commit();

  for (const item of fleetData) {
    const v = item.vehicle;
    const u = item.driverUser;
    const makeModel = [v.make, v.model].filter(Boolean).join(' ') || 'Standard Vehicle';
    const driverName = u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';
    const completedTrips = item.trips.filter((t) => t.status === 'TRIP_COMPLETED').length;
    const activeTrip = item.trips.find((t) => t.status !== 'TRIP_COMPLETED');
    const breakdownCount = item.complaints.filter((c) => c.category === 'BREAKDOWN').length;

    const fuelLogs = item.fuelRecords.filter((f) => f.type === 'FUEL');
    const defLogs = item.fuelRecords.filter((f) => f.type === 'DEF');

    const totalFuelLtr = fuelLogs.reduce((s, f) => s + f.quantityLtr, 0);
    const totalFuelCost = fuelLogs.reduce((s, f) => s + f.totalPrice, 0);
    const totalDefLtr = defLogs.reduce((s, f) => s + f.quantityLtr, 0);
    const totalDefCost = defLogs.reduce((s, f) => s + f.totalPrice, 0);
    const totalMaintenanceCost = item.maintenanceRecords.reduce((s, m) => s + (m.cost ?? 0), 0);
    const totalSpend = totalFuelCost + totalDefCost + totalMaintenanceCost;

    summarySheet.addRow({
      plateNumber: v.plateNumber,
      makeModel,
      year: v.year ?? '',
      vin: v.vin ?? '',
      agreementStatus: v.agreementStatus ?? '',
      driverName,
      driverEmployeeId: u?.employeeId ?? 'N/A',
      driverPhone: u?.phone ?? 'N/A',
      totalTrips: item.trips.length,
      completedTrips,
      activeStatus: activeTrip ? activeTrip.status : 'IDLE / READY',
      totalComplaints: item.complaints.length,
      breakdownCount,
      totalFuelLtr,
      totalFuelCost,
      totalDefLtr,
      totalDefCost,
      totalMaintenanceCost,
      totalSpend,
    }).commit();
  }
  summarySheet.commit();

  // -------------------------------------------------------------
  // Sheet 3: All Fleet Trips Detail
  // -------------------------------------------------------------
  const tripsSheet = workbook.addWorksheet('All Trips Detail', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  tripsSheet.columns = [
    { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
    { header: 'Driver', key: 'driverName', width: 22 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Loading Arrival Time', key: 'reachedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Loading Dock Location', key: 'reachedAddress', width: 35 },
    { header: 'Loading Done Time', key: 'completedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Loading Wait (min)', key: 'waitingTimeMinutes', width: 18 },
    { header: 'Trip Departure Time', key: 'tripStartedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Departure Location', key: 'tripStartAddress', width: 35 },
    { header: 'Destination Reached Time', key: 'tripCompletedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Destination Location', key: 'tripCompletedAddress', width: 35 },
    { header: 'Transit Duration (min)', key: 'tripDurationMinutes', width: 20 },
    { header: 'Unloading Completed Time', key: 'unloadingCompletedAt', width: 24, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Unloading Wait (min)', key: 'unloadingDurationMinutes', width: 20 },
    { header: 'Total Cycle (min)', key: 'totalCycleMinutes', width: 18 },
    { header: 'Loading Photo Proof', key: 'reachedPhotoUrl', width: 40 },
    { header: 'Loaded Photo Proof', key: 'completedPhotoUrl', width: 40 },
    { header: 'Destination Photo Proof', key: 'tripCompletedPhotoUrl', width: 40 },
    { header: 'Unloaded Photo Proof', key: 'unloadingPhotoUrl', width: 40 },
  ];
  tripsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tripsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0E7490' }, // Teal
  };
  tripsSheet.getRow(1).commit();

  for (const item of fleetData) {
    const v = item.vehicle;
    const u = item.driverUser;
    const driverName = u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';

    for (const t of item.trips) {
      const totalCycleMinutes =
        (t.waitingTimeMinutes ?? 0) +
        (t.tripDurationMinutes ?? 0) +
        (t.unloadingDurationMinutes ?? 0);

      tripsSheet.addRow({
        plateNumber: v.plateNumber,
        driverName: `${driverName} (${u?.employeeId ?? 'N/A'})`,
        status: t.status,
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
        totalCycleMinutes: totalCycleMinutes || '',
        reachedPhotoUrl: t.reachedPhotoUrl ?? '',
        completedPhotoUrl: t.completedPhotoUrl ?? '',
        tripCompletedPhotoUrl: t.tripCompletedPhotoUrl ?? '',
        unloadingPhotoUrl: t.unloadingPhotoUrl ?? '',
      }).commit();
    }
  }
  tripsSheet.commit();

  // -------------------------------------------------------------
  // Sheet 4: All Complaints & Incidents
  // -------------------------------------------------------------
  const complaintsSheet = workbook.addWorksheet('All Complaints & Incidents', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  complaintsSheet.columns = [
    { header: 'Complaint No', key: 'complaintNo', width: 18 },
    { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
    { header: 'Driver', key: 'driverName', width: 22 },
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

  for (const item of fleetData) {
    const v = item.vehicle;
    const u = item.driverUser;
    const driverName = u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';

    for (const c of item.complaints) {
      const photos = c.attachments.filter((a) => a.kind === 'PHOTO').map((a) => a.url);
      const voice = c.attachments.find((a) => a.kind === 'VOICE');

      complaintsSheet.addRow({
        complaintNo: c.complaintNo,
        plateNumber: v.plateNumber,
        driverName: `${driverName} (${u?.employeeId ?? 'N/A'})`,
        category: c.category,
        priority: c.priority,
        status: c.status,
        title: c.title,
        description: c.description,
        createdAt: new Date(c.createdAt),
        resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : '',
        voiceUrl: voice?.url ?? '',
        photoUrls: photos.join(', '),
      }).commit();
    }
  }
  complaintsSheet.commit();

  // -------------------------------------------------------------
  // Sheet 5: All Fuel & DEF Refills
  // -------------------------------------------------------------
  const fuelSheet = workbook.addWorksheet('Fuel & DEF Logs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  fuelSheet.columns = [
    { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
    { header: 'Driver', key: 'driverName', width: 22 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Quantity (L)', key: 'quantityLtr', width: 16 },
    { header: 'Total Cost (₹)', key: 'totalPrice', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'Rate per Litre (₹/L)', key: 'ratePerLtr', width: 20 },
    { header: 'Odometer (km)', key: 'odometerKm', width: 16 },
    { header: 'Notes', key: 'notes', width: 35 },
    { header: 'Date Logged', key: 'createdAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Receipt / Bill URL', key: 'receiptUrl', width: 40 },
  ];
  fuelSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fuelSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF374151' }, // Slate gray
  };
  fuelSheet.getRow(1).commit();

  for (const item of fleetData) {
    const v = item.vehicle;
    const u = item.driverUser;
    const driverName = u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';

    for (const f of item.fuelRecords) {
      fuelSheet.addRow({
        plateNumber: v.plateNumber,
        driverName: `${driverName} (${u?.employeeId ?? 'N/A'})`,
        type: f.type,
        quantityLtr: f.quantityLtr,
        totalPrice: f.totalPrice,
        ratePerLtr: f.ratePerLtr ? `₹${f.ratePerLtr}/L` : '',
        odometerKm: f.odometerKm ?? '',
        notes: f.notes ?? '',
        createdAt: new Date(f.createdAt),
        receiptUrl: f.receiptUrl ?? '',
      }).commit();
    }
  }
  fuelSheet.commit();

  // -------------------------------------------------------------
  // Sheet 6: All Maintenance & Tyre/Battery Records
  // -------------------------------------------------------------
  const maintenanceSheet = workbook.addWorksheet('Maintenance Logs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  maintenanceSheet.columns = [
    { header: 'Vehicle Plate', key: 'plateNumber', width: 16 },
    { header: 'Driver', key: 'driverName', width: 22 },
    { header: 'Service Type', key: 'type', width: 16 },
    { header: 'Item / Serial No', key: 'itemNumber', width: 24 },
    { header: 'Quantity', key: 'quantity', width: 14 },
    { header: 'Brand', key: 'brand', width: 18 },
    { header: 'Position', key: 'position', width: 18 },
    { header: 'Cost (₹)', key: 'cost', width: 18, style: { numFmt: '₹#,##0.00' } },
    { header: 'Odometer (km)', key: 'odometerKm', width: 16 },
    { header: 'Notes', key: 'notes', width: 35 },
    { header: 'Date Logged', key: 'createdAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Photo Proof URL', key: 'photoUrl', width: 40 },
  ];
  maintenanceSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  maintenanceSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF581C87' }, // Deep purple
  };
  maintenanceSheet.getRow(1).commit();

  for (const item of fleetData) {
    const v = item.vehicle;
    const u = item.driverUser;
    const driverName = u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';

    for (const m of item.maintenanceRecords) {
      maintenanceSheet.addRow({
        plateNumber: v.plateNumber,
        driverName: `${driverName} (${u?.employeeId ?? 'N/A'})`,
        type: m.type,
        itemNumber: m.itemNumber,
        quantity: m.quantity,
        brand: m.brand ?? '',
        position: m.position ?? '',
        cost: m.cost ?? 0,
        odometerKm: m.odometerKm ?? '',
        notes: m.notes ?? '',
        createdAt: new Date(m.createdAt),
        photoUrl: m.photoUrl ?? '',
      }).commit();
    }
  }
  maintenanceSheet.commit();

  await workbook.commit();
}

