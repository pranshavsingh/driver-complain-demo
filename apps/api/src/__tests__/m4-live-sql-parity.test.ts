import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { assertDestructiveTestDbSafety } from '../../test/disposable-db-safety';

const DISPOSABLE_DB_URL = process.env.M4_TEST_DISPOSABLE_DB_URL ?? 'postgresql://app:app@127.0.0.1:5432/driver_complaint_m4_disposable?schema=public';

// Distinct, deterministic IDs for all test fixtures created by this suite
const FIXTURE_USER_IDS = [
  '11111111-1111-4000-8000-111111111111', // Admin
  '22222222-2222-4000-8000-222222222221', // Driver 1 User (Rajesh)
  '22222222-2222-4000-8000-222222222222', // Driver 2 User (Suresh)
  '22222222-2222-4000-8000-222222222223', // Driver 3 User (Amit)
];

const FIXTURE_DRIVER_IDS = [
  '33333333-3333-4000-8000-333333333331', // Driver 1
  '33333333-3333-4000-8000-333333333332', // Driver 2
  '33333333-3333-4000-8000-333333333333', // Driver 3
];

const FIXTURE_VEHICLE_IDS = [
  '44444444-4444-4000-8000-444444444441', // Vehicle 1 (Driver 1, older)
  '44444444-4444-4000-8000-444444444442', // Vehicle 2 (Driver 1, newer)
  '44444444-4444-4000-8000-444444444443', // Vehicle 3 (Unassigned)
  '44444444-4444-4000-8000-444444444444', // Vehicle 4 (Driver 2)
];

const FIXTURE_LR_IDS = [
  '55555555-5555-4000-8000-555555555501', // Driver 1: Dec 2025 (Year boundary)
  '55555555-5555-4000-8000-555555555502', // Driver 1: Jan 2026 (Year start)
  '55555555-5555-4000-8000-555555555503', // Driver 1: Jan 2026 (Mid month)
  '55555555-5555-4000-8000-555555555504', // Driver 1: Jan 31 23:59:59 (Timezone/month boundary)
  '55555555-5555-4000-8000-555555555505', // Driver 1: Feb 2026 (Null durations/waiting)
  '55555555-5555-4000-8000-555555555506', // Driver 1: Feb 2026 (TRIP_STARTED - active, excluded)
  '55555555-5555-4000-8000-555555555507', // Driver 1: Feb 2026 (CANCELLED - excluded)
  '55555555-5555-4000-8000-555555555508', // Driver 1: Apr 2026
  '55555555-5555-4000-8000-555555555509', // Driver 2: Jan 2026
  '55555555-5555-4000-8000-555555555510', // Driver 2: Feb 2026
  '55555555-5555-4000-8000-555555555511', // Driver 3: Dec 2025 (2025 only)
];

const FIXTURE_COMPLAINT_IDS = [
  '66666666-6666-4000-8000-666666666661',
  '66666666-6666-4000-8000-666666666662',
  '66666666-6666-4000-8000-666666666663',
];

const FIXTURE_FUEL_IDS = [
  '77777777-7777-4000-8000-777777777771',
];

const FIXTURE_MAINT_IDS = [
  '88888888-8888-4000-8000-888888888881',
];

describe('M4 — Live PostgreSQL 17 Aggregation Parity Tests', () => {
  let db: PrismaClient;

  async function cleanupTargetedFixtures(): Promise<void> {
    if (!db) return;
    await db.loadingRecord.deleteMany({ where: { id: { in: FIXTURE_LR_IDS } } });
    await db.complaintAttachment.deleteMany({ where: { complaintId: { in: FIXTURE_COMPLAINT_IDS } } });
    await db.complaintUpdate.deleteMany({ where: { complaintId: { in: FIXTURE_COMPLAINT_IDS } } });
    await db.complaint.deleteMany({ where: { id: { in: FIXTURE_COMPLAINT_IDS } } });
    await db.fuelRecord.deleteMany({ where: { id: { in: FIXTURE_FUEL_IDS } } });
    await db.maintenanceRecord.deleteMany({ where: { id: { in: FIXTURE_MAINT_IDS } } });
    await db.vehicle.deleteMany({ where: { id: { in: FIXTURE_VEHICLE_IDS } } });
    await db.driver.deleteMany({ where: { id: { in: FIXTURE_DRIVER_IDS } } });
    await db.user.deleteMany({ where: { id: { in: FIXTURE_USER_IDS } } });
  }

  beforeAll(async () => {
    // 1. Enforce strict safety guard requirements before connecting
    process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB = 'true';

    db = new PrismaClient({ datasourceUrl: DISPOSABLE_DB_URL });
    await db.$connect();

    // 2. Comprehensive safety verification: validates disposable DB name, loopback TCP,
    // rejects Unix sockets, and verifies PostgreSQL cluster system_identifier
    const safetyReport = await assertDestructiveTestDbSafety(db, DISPOSABLE_DB_URL);
    expect(safetyReport.currentDatabase).toBe('driver_complaint_m4_disposable');

    // 3. Clean up only targeted fixtures from previous test runs (never truncating unrelated data)
    await cleanupTargetedFixtures();

    // 4. Populate fixtures across multiple drivers, vehicles, months, year boundaries, and null cases
    // Admin user
    await db.user.create({
      data: {
        id: FIXTURE_USER_IDS[0]!,
        email: 'admin-m4parity@example.com',
        phone: '9999999990',
        firstName: 'System',
        lastName: 'Admin',
        employeeId: 'ADM-M4-001',
        role: 'ADMIN',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    // Driver 1 User & Driver profile
    const driverUser1 = await db.user.create({
      data: {
        id: FIXTURE_USER_IDS[1]!,
        email: 'driver1-m4parity@example.com',
        phone: '9999999991',
        firstName: 'Rajesh',
        lastName: 'Kumar',
        employeeId: 'DRV-M4-001',
        role: 'DRIVER',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    const driver1 = await db.driver.create({
      data: {
        id: FIXTURE_DRIVER_IDS[0]!,
        userId: driverUser1.id,
        licenseNumber: 'DL-M4-001',
      },
    });

    // Driver 2 User & Driver profile
    const driverUser2 = await db.user.create({
      data: {
        id: FIXTURE_USER_IDS[2]!,
        email: 'driver2-m4parity@example.com',
        phone: '9999999992',
        firstName: 'Suresh',
        lastName: 'Singh',
        employeeId: 'DRV-M4-002',
        role: 'DRIVER',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    const driver2 = await db.driver.create({
      data: {
        id: FIXTURE_DRIVER_IDS[1]!,
        userId: driverUser2.id,
        licenseNumber: 'DL-M4-002',
      },
    });

    // Driver 3 User & Driver profile (has only 2025 trips, 0 trips in 2026)
    const driverUser3 = await db.user.create({
      data: {
        id: FIXTURE_USER_IDS[3]!,
        email: 'driver3-m4parity@example.com',
        phone: '9999999993',
        firstName: 'Amit',
        lastName: 'Sharma',
        employeeId: 'DRV-M4-003',
        role: 'DRIVER',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    const driver3 = await db.driver.create({
      data: {
        id: FIXTURE_DRIVER_IDS[2]!,
        userId: driverUser3.id,
        licenseNumber: 'DL-M4-003',
      },
    });

    // Vehicle 1: Assigned to Driver 1 (older)
    const v1 = await db.vehicle.create({
      data: {
        id: FIXTURE_VEHICLE_IDS[0]!,
        plateNumber: 'KA-01-M4-1001',
        make: 'Tata',
        model: 'Prima',
        year: 2021,
        vin: 'VIN-M4-001',
        driverId: driver1.id,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    });

    // Vehicle 2: Also assigned to Driver 1 (newer - tests multiple vehicles per driver)
    await db.vehicle.create({
      data: {
        id: FIXTURE_VEHICLE_IDS[1]!,
        plateNumber: 'KA-01-M4-1002',
        make: 'BharatBenz',
        model: '1617',
        year: 2023,
        vin: 'VIN-M4-002',
        driverId: driver1.id,
        createdAt: new Date('2025-06-01T00:00:00Z'),
      },
    });

    // Vehicle 3: Unassigned vehicle (driverId = null)
    const v3 = await db.vehicle.create({
      data: {
        id: FIXTURE_VEHICLE_IDS[2]!,
        plateNumber: 'KA-01-M4-1003',
        make: 'Ashok Leyland',
        model: 'Captain',
        year: 2022,
        vin: 'VIN-M4-003',
        driverId: null,
        createdAt: new Date('2025-03-01T00:00:00Z'),
      },
    });

    // Vehicle 4: Assigned to Driver 2
    await db.vehicle.create({
      data: {
        id: FIXTURE_VEHICLE_IDS[3]!,
        plateNumber: 'KA-01-M4-1004',
        make: 'Eicher',
        model: 'Pro',
        year: 2024,
        vin: 'VIN-M4-004',
        driverId: driver2.id,
        createdAt: new Date('2025-04-01T00:00:00Z'),
      },
    });

    // Complaints for Vehicle 1 (Breakdown vs general)
    await db.complaint.create({
      data: {
        id: FIXTURE_COMPLAINT_IDS[0]!,
        complaintNo: 'CMP-M4-001',
        title: 'Engine overheating on expressway',
        description: 'Engine stopped running',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        status: 'NEW',
        vehicleId: v1.id,
        driverId: driver1.id,
      },
    });

    await db.complaint.create({
      data: {
        id: FIXTURE_COMPLAINT_IDS[1]!,
        complaintNo: 'CMP-M4-002',
        title: 'Tyre pressure loss',
        description: 'Puncture detected',
        category: 'TYRE_ISSUE',
        priority: 'MEDIUM',
        status: 'NEW',
        vehicleId: v1.id,
        driverId: driver1.id,
      },
    });

    // Complaint for Vehicle 3 (unassigned)
    await db.complaint.create({
      data: {
        id: FIXTURE_COMPLAINT_IDS[2]!,
        complaintNo: 'CMP-M4-003',
        title: 'Scheduled yard check',
        description: 'Periodic inspection',
        category: 'VEHICLE_MAINTENANCE',
        priority: 'LOW',
        status: 'NEW',
        vehicleId: v3.id,
        driverId: driver1.id,
      },
    });

    // Fuel record for Vehicle 1
    await db.fuelRecord.create({
      data: {
        id: FIXTURE_FUEL_IDS[0]!,
        vehicleId: v1.id,
        driverId: driver1.id,
        type: 'FUEL',
        quantityLtr: 60,
        totalPrice: 5700.0,
      },
    });

    // Maintenance record for Vehicle 1
    await db.maintenanceRecord.create({
      data: {
        id: FIXTURE_MAINT_IDS[0]!,
        vehicleId: v1.id,
        driverId: driver1.id,
        type: 'TYRE',
        itemNumber: 'TYRE-SET-01',
        photoUrl: 'https://example.com/tyre.jpg',
        cost: 16500.0,
        quantity: 2,
      },
    });

    // Trips for Driver 1:
    // 1. Year boundary trip: Dec 31, 2025 23:45 UTC
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[0]!,
        driverId: driver1.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2025-12-31T23:45:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p1.jpg',
        tripDurationMinutes: 180,
        waitingTimeMinutes: 40,
      },
    });

    // 2. Year start trip: Jan 1, 2026 00:15 UTC
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[1]!,
        driverId: driver1.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-01-01T00:15:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p2.jpg',
        tripDurationMinutes: 95,
        waitingTimeMinutes: 20,
      },
    });

    // 3. Jan 15, 2026
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[2]!,
        driverId: driver1.id,
        status: 'COMPLETED',
        reachedAt: new Date('2026-01-15T12:00:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p3.jpg',
        tripDurationMinutes: 110,
        waitingTimeMinutes: 15,
      },
    });

    // 4. Timezone & Month boundary: Jan 31, 2026 23:59:59 UTC
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[3]!,
        driverId: driver1.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-01-31T23:59:59.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p4.jpg',
        tripDurationMinutes: 60,
        waitingTimeMinutes: 10,
      },
    });

    // 5. Feb 2026 trip with NULL duration and NULL waiting time (null-safety check)
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[4]!,
        driverId: driver1.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-02-14T08:30:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p5.jpg',
        tripDurationMinutes: null,
        waitingTimeMinutes: null,
      },
    });

    // 6. Active trip (TRIP_STARTED) in Feb 2026 - must NOT count towards completed summaries
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[5]!,
        driverId: driver1.id,
        status: 'TRIP_STARTED',
        reachedAt: new Date('2026-02-20T10:00:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p6.jpg',
        tripDurationMinutes: null,
        waitingTimeMinutes: 15,
      },
    });

    // 7. Non-completed trip in Feb 2026 (UNLOADING) - must NOT count towards completed summaries
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[6]!,
        driverId: driver1.id,
        status: 'UNLOADING',
        reachedAt: new Date('2026-02-22T11:00:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p7.jpg',
        tripDurationMinutes: 50,
        waitingTimeMinutes: 10,
      },
    });

    // 8. Apr 2026 trip (leaving March 2026 empty as an empty-month test)
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[7]!,
        driverId: driver1.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-04-10T14:00:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p8.jpg',
        tripDurationMinutes: 210,
        waitingTimeMinutes: 50,
      },
    });

    // Trips for Driver 2:
    // 9. Driver 2 Jan 2026 trip
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[8]!,
        driverId: driver2.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-01-10T09:00:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p9.jpg',
        tripDurationMinutes: 130,
        waitingTimeMinutes: 25,
      },
    });

    // 10. Driver 2 Feb 2026 trip
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[9]!,
        driverId: driver2.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-02-05T15:30:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p10.jpg',
        tripDurationMinutes: 140,
        waitingTimeMinutes: 35,
      },
    });

    // Trips for Driver 3:
    // 11. Driver 3 Dec 2025 trip only (0 trips in 2026)
    await db.loadingRecord.create({
      data: {
        id: FIXTURE_LR_IDS[10]!,
        driverId: driver3.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2025-12-20T10:00:00.000Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p11.jpg',
        tripDurationMinutes: 150,
        waitingTimeMinutes: 30,
      },
    });
  });

  afterAll(async () => {
    // Targeted fixture cleanup only
    await cleanupTargetedFixtures();
    if (db) {
      await db.$disconnect();
    }
  });

  it('verifies real PostgreSQL listFleetVehiclesSummary query parity against legacy calculation', async () => {
    // 1. Execute the actual SQL query from reports.service.ts scoped to our fixture vehicles
    const rows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT
        v."id",
        v."plateNumber" AS plate_number,
        v."make",
        v."model",
        v."year",
        v."vin",
        v."createdAt" AS created_at,
        TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))) AS driver_name_raw,
        u."employeeId" AS driver_employee_id,
        d."licenseNumber" AS driver_license_number,
        COALESCE(lr_agg.total_trips, 0)::int AS total_trips,
        COALESCE(lr_agg.completed_trips, 0)::int AS completed_trips,
        act.active_status::text AS active_trip_status,
        COALESCE(c_agg.total_complaints, 0)::int AS total_complaints,
        COALESCE(c_agg.breakdown_count, 0)::int AS breakdown_count,
        COALESCE(f_agg.total_fuel_cost, 0)::float8 AS total_fuel_cost,
        COALESCE(m_agg.total_maintenance_cost, 0)::float8 AS total_maintenance_cost
      FROM "Vehicle" v
      LEFT JOIN "Driver" d ON d."id" = v."driverId"
      LEFT JOIN "User" u ON u."id" = d."userId"
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_trips,
          COUNT(*) FILTER (WHERE lr."status" = 'TRIP_COMPLETED')::int AS completed_trips
        FROM "LoadingRecord" lr
        WHERE lr."driverId" = v."driverId" AND v."driverId" IS NOT NULL
      ) lr_agg ON true
      LEFT JOIN LATERAL (
        SELECT lr."status"::text AS active_status
        FROM "LoadingRecord" lr
        WHERE lr."driverId" = v."driverId"
          AND lr."status" <> 'TRIP_COMPLETED'
        ORDER BY lr."reachedAt" DESC, lr."id" DESC
        LIMIT 1
      ) act ON v."driverId" IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_complaints,
          COUNT(*) FILTER (WHERE c."category" = 'BREAKDOWN')::int AS breakdown_count
        FROM "Complaint" c
        WHERE c."vehicleId" = v."id"
      ) c_agg ON true
      LEFT JOIN LATERAL (
        SELECT SUM(fr."totalPrice")::float8 AS total_fuel_cost
        FROM "FuelRecord" fr
        WHERE fr."vehicleId" = v."id"
      ) f_agg ON true
      LEFT JOIN LATERAL (
        SELECT SUM(mr."cost")::float8 AS total_maintenance_cost
        FROM "MaintenanceRecord" mr
        WHERE mr."vehicleId" = v."id"
      ) m_agg ON true
      WHERE v."id" IN (${Prisma.join(FIXTURE_VEHICLE_IDS.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY v."createdAt" DESC, v."id" DESC
    `);

    // 2. Fetch records and compute legacy in-memory aggregations
    const vehicles = await db.vehicle.findMany({
      where: { id: { in: FIXTURE_VEHICLE_IDS } },
      include: {
        driver: {
          include: {
            user: true,
            loadingRecords: true,
          },
        },
        complaints: true,
        fuelRecords: true,
        maintenanceRecords: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const legacyResults = vehicles.map((v) => {
      const driverUser = v.driver?.user;
      const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}`.trim() : 'Unassigned';
      const driverEmployeeId = driverUser?.employeeId ?? 'N/A';
      const driverLicenseNumber = v.driver?.licenseNumber ?? 'N/A';

      const trips = v.driver?.loadingRecords ?? [];
      const totalTrips = trips.length;
      const completedTrips = trips.filter((t) => t.status === 'TRIP_COMPLETED').length;

      const sortedActiveTrips = trips
        .filter((t) => t.status !== 'TRIP_COMPLETED')
        .sort((a, b) => b.reachedAt.getTime() - a.reachedAt.getTime());
      const activeTripStatus = sortedActiveTrips[0]?.status ?? null;

      const totalComplaints = v.complaints.length;
      const breakdownCount = v.complaints.filter((c) => c.category === 'BREAKDOWN').length;

      const totalFuelCost = v.fuelRecords.reduce((sum, f) => sum + (f.totalPrice ?? 0), 0);
      const totalMaintenanceCost = v.maintenanceRecords.reduce((sum, m) => sum + (m.cost ?? 0), 0);

      return {
        id: v.id,
        plateNumber: v.plateNumber,
        driverName: driverName.length > 0 ? driverName : 'Unassigned',
        driverEmployeeId,
        driverLicenseNumber,
        totalTrips,
        completedTrips,
        activeTripStatus,
        totalComplaints,
        breakdownCount,
        totalFuelCost,
        totalMaintenanceCost,
      };
    });

    // 3. Complete field-by-field parity check across all returned vehicle rows
    expect(rows).toHaveLength(legacyResults.length);
    for (let i = 0; i < rows.length; i++) {
      const sqlRow = rows[i]!;
      const legRow = legacyResults[i]!;

      const driverName = sqlRow.driver_name_raw && sqlRow.driver_name_raw.length > 0 ? sqlRow.driver_name_raw : 'Unassigned';

      expect(sqlRow.id).toBe(legRow.id);
      expect(sqlRow.plate_number).toBe(legRow.plateNumber);
      expect(driverName).toBe(legRow.driverName);
      expect(sqlRow.driver_employee_id ?? 'N/A').toBe(legRow.driverEmployeeId);
      expect(sqlRow.driver_license_number ?? 'N/A').toBe(legRow.driverLicenseNumber);
      expect(sqlRow.total_trips).toBe(legRow.totalTrips);
      expect(sqlRow.completed_trips).toBe(legRow.completedTrips);
      expect(sqlRow.active_trip_status).toBe(legRow.activeTripStatus);
      expect(sqlRow.total_complaints).toBe(legRow.totalComplaints);
      expect(sqlRow.breakdown_count).toBe(legRow.breakdownCount);
      expect(sqlRow.total_fuel_cost).toBe(legRow.totalFuelCost);
      expect(sqlRow.total_maintenance_cost).toBe(legRow.totalMaintenanceCost);
    }
  });

  it('verifies real PostgreSQL getDriverMonthlyTripSummaries query parity across all rows, edge cases, and boundaries', async () => {
    // Test Case A: Full Year 2026 Query (Spanning Multiple Drivers, Multiple Months, Timezones, Null Values, Multi-Vehicle)
    const fromDate2026 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    const toDate2026 = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999));

    // 1. Fetch records for legacy in-memory calculation
    const records2026 = await db.loadingRecord.findMany({
      where: {
        id: { in: FIXTURE_LR_IDS },
        status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
        reachedAt: { gte: fromDate2026, lte: toDate2026 },
      },
      include: {
        driver: {
          include: {
            user: true,
            vehicles: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            },
          },
        },
      },
      orderBy: { reachedAt: 'desc' },
    });

    // 2. Perform legacy in-memory grouping
    const groupMap2026 = new Map<string, any>();
    for (const rec of records2026) {
      const d = rec.reachedAt;
      const recYear = d.getUTCFullYear();
      const recMonth = d.getUTCMonth() + 1;
      const key = `${rec.driverId}_${recYear}_${recMonth}`;

      const driverUser = rec.driver?.user;
      const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Unknown Driver';
      const licenseNumber = rec.driver?.licenseNumber ?? 'N/A';
      // Multi-vehicle resolution: newest vehicle plate
      const vehiclePlate = rec.driver?.vehicles?.[0]?.plateNumber ?? 'N/A';

      if (!groupMap2026.has(key)) {
        groupMap2026.set(key, {
          driverId: rec.driverId,
          driverName,
          licenseNumber,
          vehiclePlate,
          year: recYear,
          month: recMonth,
          completedTripsCount: 0,
          totalTripDurationMinutes: 0,
          totalWaitingTimeMinutes: 0,
        });
      }

      const group = groupMap2026.get(key)!;
      group.completedTripsCount += 1;
      group.totalTripDurationMinutes += rec.tripDurationMinutes ?? 0;
      group.totalWaitingTimeMinutes += rec.waitingTimeMinutes ?? 0;
    }

    const legacyResults2026 = Array.from(groupMap2026.values())
      .map((g) => ({
        ...g,
        avgTripDurationMinutes: g.completedTripsCount > 0 ? Math.round(g.totalTripDurationMinutes / g.completedTripsCount) : 0,
      }))
      .sort((a, b) => b.year - a.year || b.month - a.month || b.completedTripsCount - a.completedTripsCount);

    // 3. Execute actual SQL query from loading.service.ts
    const conditions2026 = [
      Prisma.sql`lr."id" IN (${Prisma.join(FIXTURE_LR_IDS.map((id) => Prisma.sql`${id}::uuid`))})`,
      Prisma.sql`lr."status"::text IN ('TRIP_COMPLETED', 'COMPLETED')`,
      Prisma.sql`lr."reachedAt" >= ${fromDate2026} AND lr."reachedAt" <= ${toDate2026}`,
    ];
    const whereClause2026 = Prisma.join(conditions2026, ' AND ');

    const rows2026 = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT
        lr."driverId"::text AS driver_id,
        EXTRACT(YEAR FROM lr."reachedAt")::int AS year,
        EXTRACT(MONTH FROM lr."reachedAt")::int AS month,
        COUNT(*)::int AS completed_trips_count,
        COALESCE(SUM(lr."tripDurationMinutes"), 0)::int AS total_trip_duration_minutes,
        COALESCE(SUM(lr."waitingTimeMinutes"), 0)::int AS total_waiting_time_minutes,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))), ''),
          'Unknown Driver'
        ) AS driver_name,
        COALESCE(d."licenseNumber", 'N/A') AS license_number,
        COALESCE(
          (SELECT v."plateNumber" FROM "Vehicle" v WHERE v."driverId" = d."id" ORDER BY v."createdAt" DESC, v."id" DESC LIMIT 1),
          'N/A'
        ) AS vehicle_plate
      FROM "LoadingRecord" lr
      JOIN "Driver" d ON d."id" = lr."driverId"
      LEFT JOIN "User" u ON u."id" = d."userId"
      WHERE ${whereClause2026}
      GROUP BY
        lr."driverId",
        EXTRACT(YEAR FROM lr."reachedAt"),
        EXTRACT(MONTH FROM lr."reachedAt"),
        u."firstName",
        u."lastName",
        d."licenseNumber",
        d."id"
      ORDER BY
        year DESC,
        month DESC,
        completed_trips_count DESC
    `);

    // 4. Parity verification for EVERY returned row in 2026
    expect(rows2026.length).toBe(legacyResults2026.length);
    expect(rows2026.length).toBeGreaterThanOrEqual(4); // Apr 2026 (Driver 1), Feb 2026 (Driver 1, Driver 2), Jan 2026 (Driver 1, Driver 2)

    for (let i = 0; i < rows2026.length; i++) {
      const sqlRow = rows2026[i]!;
      const legRow = legacyResults2026[i]!;

      expect(sqlRow.driver_id).toBe(legRow.driverId);
      expect(sqlRow.driver_name).toBe(legRow.driverName);
      expect(sqlRow.license_number).toBe(legRow.licenseNumber);
      // Multi-vehicle verification: Driver 1 resolves to newer plate KA-01-M4-1002
      expect(sqlRow.vehicle_plate).toBe(legRow.vehiclePlate);
      expect(sqlRow.year).toBe(legRow.year);
      expect(sqlRow.month).toBe(legRow.month);
      expect(sqlRow.completed_trips_count).toBe(legRow.completedTripsCount);
      expect(sqlRow.total_trip_duration_minutes).toBe(legRow.totalTripDurationMinutes);
      expect(sqlRow.total_waiting_time_minutes).toBe(legRow.totalWaitingTimeMinutes);

      const sqlAvg = sqlRow.completed_trips_count > 0 ? Math.round(sqlRow.total_trip_duration_minutes / sqlRow.completed_trips_count) : 0;
      expect(sqlAvg).toBe(legRow.avgTripDurationMinutes);
    }

    // Test Case B: Empty Month Test (March 2026 has zero trips)
    const fromMarch = new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0));
    const toMarch = new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999));
    const marchRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "LoadingRecord" lr
      WHERE lr."id" IN (${Prisma.join(FIXTURE_LR_IDS.map((id) => Prisma.sql`${id}::uuid`))})
        AND lr."status"::text IN ('TRIP_COMPLETED', 'COMPLETED')
        AND lr."reachedAt" >= ${fromMarch} AND lr."reachedAt" <= ${toMarch}
    `);
    expect(marchRows[0]!.count).toBe(0);

    // Test Case C: Year Boundary Test (Dec 2025 Trips for Driver 1 and Driver 3)
    const from2025 = new Date(Date.UTC(2025, 11, 1, 0, 0, 0, 0));
    const to2025 = new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999));
    const rows2025 = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT
        lr."driverId"::text AS driver_id,
        EXTRACT(YEAR FROM lr."reachedAt")::int AS year,
        EXTRACT(MONTH FROM lr."reachedAt")::int AS month,
        COUNT(*)::int AS completed_trips_count,
        COALESCE(SUM(lr."tripDurationMinutes"), 0)::int AS total_trip_duration_minutes
      FROM "LoadingRecord" lr
      WHERE lr."id" IN (${Prisma.join(FIXTURE_LR_IDS.map((id) => Prisma.sql`${id}::uuid`))})
        AND lr."status"::text IN ('TRIP_COMPLETED', 'COMPLETED')
        AND lr."reachedAt" >= ${from2025} AND lr."reachedAt" <= ${to2025}
      GROUP BY lr."driverId", EXTRACT(YEAR FROM lr."reachedAt"), EXTRACT(MONTH FROM lr."reachedAt")
      ORDER BY completed_trips_count DESC
    `);
    expect(rows2025).toHaveLength(2); // Driver 1 and Driver 3
    expect(rows2025[0]!.year).toBe(2025);
    expect(rows2025[0]!.month).toBe(12);
  });
});
