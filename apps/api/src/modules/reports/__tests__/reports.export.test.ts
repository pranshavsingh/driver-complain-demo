import { PassThrough, Readable } from 'node:stream';
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { VehicleFullReportResponse } from '@driver-complaint/shared-types';
import { exportVehicleReportFilename, writeVehicleReportXlsx } from '../reports.export';

describe('Vehicle Reports Excel Exporter', () => {
  it('generates filename correctly from plate number', () => {
    const filename = exportVehicleReportFilename('MH-12-AB-1234', new Date('2026-09-09T00:00:00Z'));
    expect(filename).toBe('vehicle-report-MH-12-AB-1234-2026-09-09.xlsx');
  });

  it('renders all 4 worksheets with appropriate columns and rows', async () => {
    const mockReport: VehicleFullReportResponse = {
      vehicle: {
        id: 'v-1',
        driverId: 'd-1',
        plateNumber: 'DL-01-AX-9999',
        make: 'Tata',
        model: 'Prima 5530.S',
        year: 2024,
        vin: 'TATAP5530123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      driver: {
        id: 'd-1',
        userId: 'u-1',
        employeeId: 'EMP-1001',
        firstName: 'John',
        lastName: 'Doe',
        licenseNumber: 'DL-IND-999',
      },
      summary: {
        totalTrips: 1,
        completedTrips: 1,
        totalLoadingWaitMinutes: 45,
        totalTripDurationMinutes: 180,
        totalUnloadingWaitMinutes: 60,
        totalComplaints: 2,
        breakdownCount: 1,
        tyreIssueCount: 1,
        fuelIssueCount: 0,
        totalFuelLtr: 150,
        totalFuelCost: 13500,
        totalMaintenanceCost: 8500,
      },
      timeline: [],
      trips: [
        {
          id: 'trip-1',
          status: 'TRIP_COMPLETED',
          reachedAt: '2026-09-01T08:00:00Z',
          reachedAddress: 'Warehouse A, Delhi',
          completedAt: '2026-09-01T08:45:00Z',
          completedAddress: 'Warehouse A, Delhi',
          waitingTimeMinutes: 45,
          tripStartedAt: '2026-09-01T09:00:00Z',
          tripStartAddress: 'Delhi Outer Ring',
          tripCompletedAt: '2026-09-01T12:00:00Z',
          tripCompletedAddress: 'Jaipur Logistics Hub',
          tripDurationMinutes: 180,
          unloadingCompletedAt: '2026-09-01T13:00:00Z',
          unloadingAddress: 'Jaipur Dock 2',
          unloadingDurationMinutes: 60,
          driverName: 'John Doe',
          driverEmployeeId: 'EMP-1001',
        },
      ],
      complaints: [
        {
          id: 'c-1',
          complaintNo: 'CMP-2026-001',
          category: 'TYRE_ISSUE',
          title: 'Rear Right Tyre Puncture',
          description: 'Puncture near highway toll plaza',
          status: 'RESOLVED',
          priority: 'HIGH',
          driverName: 'John Doe',
          driverEmployeeId: 'EMP-1001',
          createdAt: '2026-09-01T10:15:00Z',
          resolvedAt: '2026-09-01T11:00:00Z',
          photoUrls: ['https://cdn.example.com/tyre.jpg'],
        },
      ],
      fuelRecords: [
        {
          id: 'f-1',
          type: 'FUEL',
          quantityLtr: 150,
          totalPrice: 13500,
          ratePerLtr: 90,
          odometerKm: 45200,
          receiptUrl: 'https://cdn.example.com/receipt.jpg',
          notes: 'HPCL Highway Pump',
          createdAt: '2026-09-01T07:30:00Z',
          driverName: 'John Doe',
        },
      ],
      maintenanceRecords: [
        {
          id: 'm-1',
          type: 'TYRE',
          itemNumber: 'TYRE-APOLLO-295',
          quantity: 1,
          brand: 'Apollo',
          position: 'Rear Right Outer',
          cost: 8500,
          odometerKm: 45350,
          photoUrl: 'https://cdn.example.com/tyre-new.jpg',
          notes: 'New tyre replaced at roadside workshop',
          createdAt: '2026-09-01T10:45:00Z',
          driverName: 'John Doe',
        },
      ],
    };

    const chunks: Buffer[] = [];
    const out = new PassThrough();
    out.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<void>((resolve, reject) => {
      out.on('end', () => resolve());
      out.on('error', reject);
    });

    await writeVehicleReportXlsx(out, mockReport);
    await finished;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(Buffer.concat(chunks)));

    expect(workbook.worksheets.length).toBe(4);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Vehicle Overview',
      'Trip & Loading Milestones',
      'Issues & Complaints',
      'Fuel & Maintenance',
    ]);

    // Check Summary Sheet
    const overviewSheet = workbook.getWorksheet('Vehicle Overview');
    expect(overviewSheet).toBeDefined();
    expect(overviewSheet?.rowCount).toBeGreaterThan(10);

    // Check Trips Sheet
    const tripsSheet = workbook.getWorksheet('Trip & Loading Milestones');
    expect(tripsSheet).toBeDefined();
    expect(tripsSheet?.rowCount).toBe(2); // Header + 1 row

    // Check Complaints Sheet
    const complaintsSheet = workbook.getWorksheet('Issues & Complaints');
    expect(complaintsSheet).toBeDefined();
    expect(complaintsSheet?.rowCount).toBe(2);

    // Check Maintenance Sheet
    const maintSheet = workbook.getWorksheet('Fuel & Maintenance');
    expect(maintSheet).toBeDefined();
    expect(maintSheet?.rowCount).toBe(3); // Header + 1 fuel + 1 maintenance
  });
});
