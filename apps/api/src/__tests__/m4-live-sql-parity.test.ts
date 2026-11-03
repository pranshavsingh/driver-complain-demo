import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

const DISPOSABLE_DB_URL = 'postgresql://app:app@127.0.0.1:5432/driver_complaint_m4_disposable';

describe('M4 — Live PostgreSQL 17 Aggregation Parity Tests', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: DISPOSABLE_DB_URL });
    await db.$connect();

    // Clean operational tables in disposable database
    await db.$executeRawUnsafe(`
      TRUNCATE TABLE "LoadingRecord", "ComplaintAttachment", "ComplaintUpdate", "Complaint", 
                     "FuelRecord", "MaintenanceRecord", "Vehicle", "Driver", "User" 
      CASCADE;
    `);
  });

  afterAll(async () => {
    if (db) {
      await db.$executeRawUnsafe(`
        TRUNCATE TABLE "LoadingRecord", "ComplaintAttachment", "ComplaintUpdate", "Complaint", 
                       "FuelRecord", "MaintenanceRecord", "Vehicle", "Driver", "User" 
        CASCADE;
      `);
      await db.$disconnect();
    }
  });

  it('verifies real PostgreSQL listFleetVehiclesSummary query parity against legacy calculation', async () => {
    // 1. Insert fixtures
    // Admin user who creates driver/vehicles
    await db.user.create({
      data: {
        id: '11111111-1111-4000-8000-111111111111',
        email: 'admin-live@example.com',
        phone: '9999999990',
        firstName: 'System',
        lastName: 'Admin',
        employeeId: 'ADM-001',
        role: 'ADMIN',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    // Driver 1 with User
    const driverUser1 = await db.user.create({
      data: {
        id: '22222222-2222-4000-8000-222222222222',
        email: 'driver1@example.com',
        phone: '9999999991',
        firstName: 'Rajesh',
        lastName: 'Kumar',
        employeeId: 'EMP-001',
        role: 'DRIVER',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    const driver1 = await db.driver.create({
      data: {
        id: '33333333-3333-4000-8000-333333333333',
        userId: driverUser1.id,
        licenseNumber: 'DL-IND-001',
      },
    });

    // Vehicle 1: Assigned to Driver 1
    const v1 = await db.vehicle.create({
      data: {
        id: '44444444-4444-4000-8000-444444444441',
        plateNumber: 'KA-01-M4-1001',
        make: 'Tata',
        model: 'Prima',
        year: 2023,
        vin: 'VIN001',
        driverId: driver1.id,
      },
    });

    // Vehicle 2: Also assigned to Driver 1 (multi-vehicle per driver)
    await db.vehicle.create({
      data: {
        id: '44444444-4444-4000-8000-444444444442',
        plateNumber: 'KA-01-M4-1002',
        make: 'BharatBenz',
        model: '1617',
        year: 2022,
        vin: 'VIN002',
        driverId: driver1.id,
      },
    });

    // Vehicle 3: Unassigned (no driver)
    const v3 = await db.vehicle.create({
      data: {
        id: '44444444-4444-4000-8000-444444444443',
        plateNumber: 'KA-01-M4-1003',
        make: 'Ashok Leyland',
        model: 'Captain',
        year: 2021,
        vin: 'VIN003',
        driverId: null,
      },
    });

    // Trips for Driver 1:
    // 1 completed trip
    await db.loadingRecord.create({
      data: {
        id: '55555555-5555-4000-8000-555555555551',
        driverId: driver1.id,
        status: 'TRIP_COMPLETED',
        reachedAt: new Date('2026-03-01T08:00:00Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p1.jpg',
        tripDurationMinutes: 120,
        waitingTimeMinutes: 30,
      },
    });

    // 1 active trip in progress (TRIP_STARTED) - reached more recently
    await db.loadingRecord.create({
      data: {
        id: '55555555-5555-4000-8000-555555555552',
        driverId: driver1.id,
        status: 'TRIP_STARTED',
        reachedAt: new Date('2026-03-02T10:00:00Z'),
        reachedLatitude: 12.9716,
        reachedLongitude: 77.5946,
        reachedPhotoUrl: 'https://example.com/p2.jpg',
        tripDurationMinutes: null,
        waitingTimeMinutes: 15,
      },
    });

    // Complaints:
    // v1 has 1 BREAKDOWN and 1 TYRE issue
    await db.complaint.create({
      data: {
        id: '66666666-6666-4000-8000-666666666661',
        complaintNo: 'CMP-001',
        title: 'Engine overheating',
        description: 'Overheating on highway',
        category: 'BREAKDOWN',
        priority: 'HIGH',
        status: 'NEW',
        vehicleId: v1.id,
        driverId: driver1.id,
      },
    });

    await db.complaint.create({
      data: {
        id: '66666666-6666-4000-8000-666666666662',
        complaintNo: 'CMP-002',
        title: 'Front tyre puncture',
        description: 'Low pressure',
        category: 'TYRE_ISSUE',
        priority: 'MEDIUM',
        status: 'NEW',
        vehicleId: v1.id,
        driverId: driver1.id,
      },
    });

    // v3 (unassigned) has 1 general complaint
    await db.complaint.create({
      data: {
        id: '66666666-6666-4000-8000-666666666663',
        complaintNo: 'CMP-003',
        title: 'Cabin cleaning required',
        description: 'Cabin dirty',
        category: 'VEHICLE_MAINTENANCE',
        priority: 'LOW',
        status: 'NEW',
        vehicleId: v3.id,
        driverId: driver1.id,
      },
    });

    // Fuel Records:
    await db.fuelRecord.create({
      data: {
        id: '77777777-7777-4000-8000-777777777771',
        vehicleId: v1.id,
        driverId: driver1.id,
        type: 'FUEL',
        quantityLtr: 50,
        totalPrice: 4750.0,
      },
    });

    // Maintenance Records:
    await db.maintenanceRecord.create({
      data: {
        id: '88888888-8888-4000-8000-888888888881',
        vehicleId: v1.id,
        driverId: driver1.id,
        type: 'TYRE',
        itemNumber: 'TYRE-001',
        photoUrl: 'https://example.com/tyre.jpg',
        cost: 15000.0,
        quantity: 1,
      },
    });

    // 2. Execute the actual SQL query from reports.service.ts
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
        WHERE lr."driverId" = v."driverId"
      ) lr_agg ON v."driverId" IS NOT NULL
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
        SELECT
          COALESCE(SUM(fr."totalPrice"), 0)::float8 AS total_fuel_cost
        FROM "FuelRecord" fr
        WHERE fr."vehicleId" = v."id"
      ) f_agg ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(mr."cost"), 0)::float8 AS total_maintenance_cost
        FROM "MaintenanceRecord" mr
        WHERE mr."vehicleId" = v."id"
      ) m_agg ON true
      ORDER BY v."plateNumber" ASC
    `);

    // 3. Execute legacy calculation for comparison
    const vehiclesLegacy = await db.vehicle.findMany({
      orderBy: { plateNumber: 'asc' },
      include: {
        driver: {
          include: {
            user: true,
            loadingRecords: {
              orderBy: { reachedAt: 'desc' },
            },
          },
        },
        complaints: true,
        fuelRecords: true,
        maintenanceRecords: true,
      },
    });

    const legacyResults = vehiclesLegacy.map((v) => {
      const driverUser = v.driver?.user;
      const loadingRecords = v.driver?.loadingRecords ?? [];
      const completedTrips = loadingRecords.filter((r) => r.status === 'TRIP_COMPLETED').length;
      const activeTrip = loadingRecords.find((r) => r.status !== 'TRIP_COMPLETED');
      const breakdownCount = v.complaints.filter((c) => c.category === 'BREAKDOWN').length;
      const totalFuelCost = v.fuelRecords.reduce((sum, f) => sum + (f.totalPrice ?? 0), 0);
      const totalMaintenanceCost = v.maintenanceRecords.reduce((sum, m) => sum + (m.cost ?? 0), 0);

      return {
        id: v.id,
        plateNumber: v.plateNumber,
        driverName: driverUser ? `${driverUser.firstName} ${driverUser.lastName}`.trim() : 'Unassigned',
        driverEmployeeId: driverUser?.employeeId ?? 'N/A',
        driverLicenseNumber: v.driver?.licenseNumber ?? 'N/A',
        totalTrips: loadingRecords.length,
        completedTrips,
        activeTripStatus: activeTrip?.status ?? null,
        totalComplaints: v.complaints.length,
        breakdownCount,
        totalFuelCost,
        totalMaintenanceCost,
      };
    });

    // 4. Assert 100% equivalence on actual database execution
    expect(rows).toHaveLength(3);

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

  it('verifies real PostgreSQL getDriverMonthlyTripSummaries query parity against legacy calculation', async () => {
    // 1. Fetch records using legacy findMany query
    const fromDate = new Date(2026, 0, 1, 0, 0, 0, 0);
    const toDate = new Date(2026, 11, 31, 23, 59, 59, 999);

    const records = await db.loadingRecord.findMany({
      where: {
        status: { in: ['TRIP_COMPLETED', 'COMPLETED'] },
        reachedAt: { gte: fromDate, lte: toDate },
      },
      include: {
        driver: {
          include: {
            user: true,
            vehicles: true,
          },
        },
      },
      orderBy: { reachedAt: 'desc' },
    });

    // Legacy aggregation
    const groupMap = new Map<string, any>();
    for (const rec of records) {
      const d = rec.reachedAt;
      const recYear = d.getFullYear();
      const recMonth = d.getMonth() + 1;
      const key = `${rec.driverId}_${recYear}_${recMonth}`;

      const driverUser = rec.driver?.user;
      const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Unknown Driver';
      const licenseNumber = rec.driver?.licenseNumber ?? 'N/A';
      const vehiclePlate = rec.driver?.vehicles?.[0]?.plateNumber ?? 'N/A';

      if (!groupMap.has(key)) {
        groupMap.set(key, {
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

      const group = groupMap.get(key)!;
      group.completedTripsCount += 1;
      group.totalTripDurationMinutes += rec.tripDurationMinutes ?? 0;
      group.totalWaitingTimeMinutes += rec.waitingTimeMinutes ?? 0;
    }

    const legacyResults = Array.from(groupMap.values()).map((g) => ({
      ...g,
      avgTripDurationMinutes: g.completedTripsCount > 0 ? Math.round(g.totalTripDurationMinutes / g.completedTripsCount) : 0,
    }));

    // 2. Execute the actual SQL query from loading.service.ts
    const conditions = [
      Prisma.sql`1=1`,
      Prisma.sql`lr."status"::text IN ('TRIP_COMPLETED', 'COMPLETED')`,
      Prisma.sql`lr."reachedAt" >= ${fromDate} AND lr."reachedAt" <= ${toDate}`,
    ];
    const whereClause = Prisma.join(conditions, ' AND ');

    const rows = await db.$queryRaw<any[]>(Prisma.sql`
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
      WHERE ${whereClause}
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

    expect(rows).toHaveLength(legacyResults.length);
    expect(rows[0]!.completed_trips_count).toBe(legacyResults[0]!.completedTripsCount);
    expect(rows[0]!.total_trip_duration_minutes).toBe(legacyResults[0]!.totalTripDurationMinutes);
    expect(rows[0]!.total_waiting_time_minutes).toBe(legacyResults[0]!.totalWaitingTimeMinutes);
  });
});
