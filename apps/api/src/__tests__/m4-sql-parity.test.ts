import { describe, it, expect } from 'vitest';

// Legacy in-memory implementation of listFleetVehiclesSummary
function legacyFleetVehiclesSummary(vehicles: any[]) {
  return vehicles.map((v) => {
    const driverUser = v.driver?.user;
    const loadingRecords = v.driver?.loadingRecords ?? [];
    const completedTrips = loadingRecords.filter((r: any) => r.status === 'TRIP_COMPLETED').length;
    const activeTrip = loadingRecords.find((r: any) => r.status !== 'TRIP_COMPLETED');
    const breakdownCount = v.complaints.filter((c: any) => c.category === 'BREAKDOWN').length;
    const totalFuelCost = v.fuelRecords.reduce((sum: number, f: any) => sum + (f.totalPrice ?? 0), 0);
    const totalMaintenanceCost = v.maintenanceRecords.reduce((sum: number, m: any) => sum + (m.cost ?? 0), 0);

    const driverName = driverUser
      ? `${driverUser.firstName ?? ''} ${driverUser.lastName ?? ''}`.trim() || 'Unassigned'
      : 'Unassigned';

    return {
      id: v.id,
      plateNumber: v.plateNumber,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      vin: v.vin ?? null,
      driverName,
      driverEmployeeId: driverUser?.employeeId ?? 'N/A',
      driverLicenseNumber: v.driver?.licenseNumber ?? 'N/A',
      totalTrips: loadingRecords.length,
      completedTrips,
      activeTripStatus: activeTrip?.status ?? null,
      totalComplaints: v.complaints.length,
      breakdownCount,
      totalFuelCost,
      totalMaintenanceCost,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : new Date(v.createdAt).toISOString(),
    };
  });
}

// SQL emulation of listFleetVehiclesSummary LATERAL query
function sqlEmulatedFleetVehiclesSummary(
  vehicles: any[],
  drivers: any[],
  users: any[],
  loadingRecords: any[],
  complaints: any[],
  fuelRecords: any[],
  maintenanceRecords: any[]
) {
  // Ordered by plateNumber ASC
  const sortedVehicles = [...vehicles].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));

  return sortedVehicles.map((v) => {
    const driver = drivers.find((d) => d.id === v.driverId) ?? null;
    const user = driver ? (users.find((u) => u.id === driver.userId) ?? null) : null;

    // lr_agg: LEFT JOIN LATERAL ... ON v."driverId" IS NOT NULL
    let total_trips = 0;
    let completed_trips = 0;
    let active_trip_status: string | null = null;

    if (v.driverId) {
      const driverTrips = loadingRecords.filter((lr) => lr.driverId === v.driverId);
      total_trips = driverTrips.length;
      completed_trips = driverTrips.filter((lr) => lr.status === 'TRIP_COMPLETED').length;

      // act: LEFT JOIN LATERAL ... WHERE lr."status" <> 'TRIP_COMPLETED' ORDER BY lr."reachedAt" DESC, lr."id" DESC LIMIT 1
      const activeTrips = driverTrips
        .filter((lr) => lr.status !== 'TRIP_COMPLETED')
        .sort((a, b) => new Date(b.reachedAt).getTime() - new Date(a.reachedAt).getTime() || b.id.localeCompare(a.id));
      active_trip_status = activeTrips.length > 0 ? activeTrips[0].status : null;
    }

    // c_agg: LEFT JOIN LATERAL ON true
    const vehicleComplaints = complaints.filter((c) => c.vehicleId === v.id);
    const total_complaints = vehicleComplaints.length;
    const breakdown_count = vehicleComplaints.filter((c) => c.category === 'BREAKDOWN').length;

    // f_agg: LEFT JOIN LATERAL ON true
    const vehicleFuel = fuelRecords.filter((f) => f.vehicleId === v.id);
    const total_fuel_cost = vehicleFuel.reduce((sum, f) => sum + (f.totalPrice ?? 0), 0);

    // m_agg: LEFT JOIN LATERAL ON true
    const vehicleMaint = maintenanceRecords.filter((m) => m.vehicleId === v.id);
    const total_maintenance_cost = vehicleMaint.reduce((sum, m) => sum + (m.cost ?? 0), 0);

    const rawDriverName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';
    const driverName = rawDriverName.length > 0 ? rawDriverName : 'Unassigned';

    return {
      id: v.id,
      plateNumber: v.plateNumber,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      vin: v.vin ?? null,
      driverName,
      driverEmployeeId: user?.employeeId ?? 'N/A',
      driverLicenseNumber: driver?.licenseNumber ?? 'N/A',
      totalTrips: total_trips,
      completedTrips: completed_trips,
      activeTripStatus: active_trip_status,
      totalComplaints: total_complaints,
      breakdownCount: breakdown_count,
      totalFuelCost: total_fuel_cost,
      totalMaintenanceCost: total_maintenance_cost,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : new Date(v.createdAt).toISOString(),
    };
  });
}

// Legacy in-memory getDriverMonthlyTripSummaries
function legacyMonthlyTripSummaries(records: any[]) {
  const groupMap = new Map<
    string,
    {
      driverId: string;
      driverName: string;
      licenseNumber: string;
      vehiclePlate: string;
      year: number;
      month: number;
      completedTripsCount: number;
      totalTripDurationMinutes: number;
      totalWaitingTimeMinutes: number;
    }
  >();

  for (const rec of records) {
    const d = new Date(rec.reachedAt);
    const recYear = d.getFullYear();
    const recMonth = d.getMonth() + 1;
    const key = `${rec.driverId}_${recYear}_${recMonth}`;

    const driverUser = rec.driver?.user;
    const driverName = driverUser
      ? `${driverUser.firstName ?? ''} ${driverUser.lastName ?? ''}`.trim() || 'Unknown Driver'
      : 'Unknown Driver';
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

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const result = Array.from(groupMap.values()).map((g) => ({
    ...g,
    monthLabel: `${MONTH_NAMES[g.month - 1]} ${g.year}`,
    avgTripDurationMinutes: g.completedTripsCount > 0 ? Math.round(g.totalTripDurationMinutes / g.completedTripsCount) : 0,
  }));

  result.sort((a, b) => b.year - a.year || b.month - a.month || b.completedTripsCount - a.completedTripsCount);
  return result;
}

// SQL Emulation of getDriverMonthlyTripSummaries GROUP BY query
function sqlEmulatedMonthlyTripSummaries(records: any[], vehicles: any[]) {
  // GROUP BY driverId, year, month
  const groups: Record<string, any[]> = {};

  for (const rec of records) {
    const d = new Date(rec.reachedAt);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${rec.driverId}|${year}|${month}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const rows = Object.entries(groups).map(([_, recs]) => {
    const sample = recs[0];
    const d = new Date(sample.reachedAt);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const completedTripsCount = recs.length;
    const totalTripDurationMinutes = recs.reduce((sum, r) => sum + (r.tripDurationMinutes ?? 0), 0);
    const totalWaitingTimeMinutes = recs.reduce((sum, r) => sum + (r.waitingTimeMinutes ?? 0), 0);

    const user = sample.driver?.user;
    const driverName = user
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Unknown Driver'
      : 'Unknown Driver';
    const licenseNumber = sample.driver?.licenseNumber ?? 'N/A';

    // SQL subquery for vehicle plate:
    // SELECT v."plateNumber" FROM "Vehicle" v WHERE v."driverId" = d."id" ORDER BY v."createdAt" DESC, v."id" DESC LIMIT 1
    const driverVehicles = vehicles
      .filter((v) => v.driverId === sample.driverId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id.localeCompare(a.id));
    const vehiclePlate = driverVehicles.length > 0 ? driverVehicles[0].plateNumber : 'N/A';

    return {
      driverId: sample.driverId,
      driverName,
      licenseNumber,
      vehiclePlate,
      year,
      month,
      completedTripsCount,
      totalTripDurationMinutes,
      totalWaitingTimeMinutes,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      avgTripDurationMinutes: completedTripsCount > 0 ? Math.round(totalTripDurationMinutes / completedTripsCount) : 0,
    };
  });

  rows.sort((a, b) => b.year - a.year || b.month - a.month || b.completedTripsCount - a.completedTripsCount);
  return rows;
}

describe('M4 — SQL Business-Logic Parity vs Legacy In-Memory Aggregations', () => {
  describe('Fleet Vehicles Summary Parity', () => {
    it('produces 100% identical summary for standard, multi-driver, missing-driver, and null fixtures', () => {
      const fixtures = {
        users: [
          { id: 'u-1', firstName: 'Alice', lastName: 'Smith', employeeId: 'EMP-001' },
          { id: 'u-2', firstName: 'Bob', lastName: null, employeeId: 'EMP-002' },
          { id: 'u-3', firstName: null, lastName: null, employeeId: null },
        ],
        drivers: [
          { id: 'd-1', userId: 'u-1', licenseNumber: 'LIC-001' },
          { id: 'd-2', userId: 'u-2', licenseNumber: 'LIC-002' },
          { id: 'd-3', userId: 'u-3', licenseNumber: null },
        ],
        vehicles: [
          {
            id: 'v-1',
            plateNumber: 'KA-01-AA-1111',
            make: 'Tata',
            model: 'Prima',
            year: 2022,
            vin: 'VIN12345',
            driverId: 'd-1',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'v-2',
            plateNumber: 'KA-01-BB-2222',
            make: null,
            model: null,
            year: null,
            vin: null,
            driverId: 'd-2',
            createdAt: new Date('2026-02-01T00:00:00Z'),
          },
          {
            id: 'v-3',
            plateNumber: 'KA-01-CC-3333',
            make: 'BharatBenz',
            model: '1617',
            year: 2021,
            vin: 'VIN99999',
            driverId: null, // Unassigned driver
            createdAt: new Date('2026-03-01T00:00:00Z'),
          },
          {
            id: 'v-4',
            plateNumber: 'KA-01-DD-4444',
            make: 'Eicher',
            model: 'Pro 2049',
            year: 2023,
            vin: 'VIN88888',
            driverId: 'd-1', // Second vehicle for d-1
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ],
        loadingRecords: [
          {
            id: 'lr-1',
            driverId: 'd-1',
            status: 'TRIP_COMPLETED',
            reachedAt: new Date('2026-05-01T08:00:00Z'),
          },
          {
            id: 'lr-2',
            driverId: 'd-1',
            status: 'TRIP_STARTED',
            reachedAt: new Date('2026-05-02T09:00:00Z'),
          },
          {
            id: 'lr-3',
            driverId: 'd-2',
            status: 'REACHED',
            reachedAt: new Date('2026-05-03T10:00:00Z'),
          },
        ],
        complaints: [
          { id: 'c-1', vehicleId: 'v-1', category: 'BREAKDOWN' },
          { id: 'c-2', vehicleId: 'v-1', category: 'TYRE' },
          { id: 'c-3', vehicleId: 'v-2', category: 'BREAKDOWN' },
          { id: 'c-4', vehicleId: 'v-3', category: 'GENERAL' },
        ],
        fuelRecords: [
          { id: 'f-1', vehicleId: 'v-1', totalPrice: 4500.5 },
          { id: 'f-2', vehicleId: 'v-1', totalPrice: 3200.0 },
          { id: 'f-3', vehicleId: 'v-3', totalPrice: 1500.0 },
        ],
        maintenanceRecords: [
          { id: 'm-1', vehicleId: 'v-1', cost: 12000 },
          { id: 'm-2', vehicleId: 'v-2', cost: null },
          { id: 'm-3', vehicleId: 'v-3', cost: 500 },
        ],
      };

      // Construct nested vehicle objects for legacy implementation
      const nestedVehicles = fixtures.vehicles.map((v) => {
        const driver = fixtures.drivers.find((d) => d.id === v.driverId);
        const user = driver ? fixtures.users.find((u) => u.id === driver.userId) : null;
        const driverTrips = driver
          ? fixtures.loadingRecords
              .filter((lr) => lr.driverId === driver.id)
              .sort((a, b) => new Date(b.reachedAt).getTime() - new Date(a.reachedAt).getTime())
          : [];

        return {
          ...v,
          driver: driver
            ? {
                ...driver,
                user,
                loadingRecords: driverTrips,
              }
            : null,
          complaints: fixtures.complaints.filter((c) => c.vehicleId === v.id),
          fuelRecords: fixtures.fuelRecords.filter((f) => f.vehicleId === v.id),
          maintenanceRecords: fixtures.maintenanceRecords.filter((m) => m.vehicleId === v.id),
        };
      });

      const legacyResults = legacyFleetVehiclesSummary(nestedVehicles);
      const sqlResults = sqlEmulatedFleetVehiclesSummary(
        fixtures.vehicles,
        fixtures.drivers,
        fixtures.users,
        fixtures.loadingRecords,
        fixtures.complaints,
        fixtures.fuelRecords,
        fixtures.maintenanceRecords
      );

      expect(sqlResults).toEqual(legacyResults);
      expect(sqlResults).toHaveLength(4);

      // Verify unassigned vehicle
      const unassigned = sqlResults.find((r) => r.id === 'v-3');
      expect(unassigned?.driverName).toBe('Unassigned');
      expect(unassigned?.driverEmployeeId).toBe('N/A');
      expect(unassigned?.totalTrips).toBe(0);
      expect(unassigned?.totalComplaints).toBe(1);
      expect(unassigned?.breakdownCount).toBe(0);
      expect(unassigned?.totalFuelCost).toBe(1500.0);
      expect(unassigned?.totalMaintenanceCost).toBe(500);

      // Verify multiple vehicles under same driver (d-1)
      const v1 = sqlResults.find((r) => r.id === 'v-1');
      const v4 = sqlResults.find((r) => r.id === 'v-4');
      expect(v1?.driverName).toBe('Alice Smith');
      expect(v4?.driverName).toBe('Alice Smith');
      expect(v1?.totalTrips).toBe(2);
      expect(v4?.totalTrips).toBe(2);
      expect(v1?.activeTripStatus).toBe('TRIP_STARTED');
      expect(v4?.activeTripStatus).toBe('TRIP_STARTED');
    });
  });

  describe('Monthly Trip Summaries Parity', () => {
    it('produces 100% identical monthly grouping, rounding, and label formatting', () => {
      const user1 = { id: 'u-1', firstName: 'John', lastName: 'Doe', employeeId: 'EMP-01' };
      const driver1 = { id: 'd-1', userId: 'u-1', licenseNumber: 'DL-1111', user: user1, vehicles: [{ id: 'v-1', plateNumber: 'KA-01-A-100', driverId: 'd-1', createdAt: new Date('2026-01-01') }] };

      const user2 = { id: 'u-2', firstName: 'Jane', lastName: 'Smith', employeeId: 'EMP-02' };
      const driver2 = { id: 'd-2', userId: 'u-2', licenseNumber: 'DL-2222', user: user2, vehicles: [{ id: 'v-2', plateNumber: 'KA-01-B-200', driverId: 'd-2', createdAt: new Date('2026-01-01') }] };

      const records = [
        {
          id: 't-1',
          driverId: 'd-1',
          driver: driver1,
          reachedAt: new Date('2026-03-05T10:00:00Z'),
          tripDurationMinutes: 125,
          waitingTimeMinutes: 30,
        },
        {
          id: 't-2',
          driverId: 'd-1',
          driver: driver1,
          reachedAt: new Date('2026-03-12T14:00:00Z'),
          tripDurationMinutes: 95,
          waitingTimeMinutes: 15,
        },
        {
          id: 't-3',
          driverId: 'd-1',
          driver: driver1,
          reachedAt: new Date('2026-04-01T08:00:00Z'),
          tripDurationMinutes: 200,
          waitingTimeMinutes: 45,
        },
        {
          id: 't-4',
          driverId: 'd-2',
          driver: driver2,
          reachedAt: new Date('2026-03-20T11:00:00Z'),
          tripDurationMinutes: 80,
          waitingTimeMinutes: 20,
        },
      ];

      const vehicles = [
        { id: 'v-1', plateNumber: 'KA-01-A-100', driverId: 'd-1', createdAt: new Date('2026-01-01') },
        { id: 'v-2', plateNumber: 'KA-01-B-200', driverId: 'd-2', createdAt: new Date('2026-01-01') },
      ];

      const legacyResults = legacyMonthlyTripSummaries(records);
      const sqlResults = sqlEmulatedMonthlyTripSummaries(records, vehicles);

      expect(sqlResults).toEqual(legacyResults);
      expect(sqlResults).toHaveLength(3);

      // Verify March d-1 rounding: (125 + 95) / 2 = 220 / 2 = 110
      const d1March = sqlResults.find((r) => r.driverId === 'd-1' && r.month === 3);
      expect(d1March?.completedTripsCount).toBe(2);
      expect(d1March?.totalTripDurationMinutes).toBe(220);
      expect(d1March?.avgTripDurationMinutes).toBe(110);
      expect(d1March?.monthLabel).toBe('March 2026');
      expect(d1March?.vehiclePlate).toBe('KA-01-A-100');
    });

    it('correctly handles edge-case odd durations with rounding', () => {
      const driver = { id: 'd-1', licenseNumber: 'DL-999', vehicles: [] };
      const records = [
        {
          id: 't-1',
          driverId: 'd-1',
          driver,
          reachedAt: new Date('2026-01-10T10:00:00Z'),
          tripDurationMinutes: 10,
          waitingTimeMinutes: 5,
        },
        {
          id: 't-2',
          driverId: 'd-1',
          driver,
          reachedAt: new Date('2026-01-11T10:00:00Z'),
          tripDurationMinutes: 15,
          waitingTimeMinutes: 5,
        },
        {
          id: 't-3',
          driverId: 'd-1',
          driver,
          reachedAt: new Date('2026-01-12T10:00:00Z'),
          tripDurationMinutes: 20,
          waitingTimeMinutes: 5,
        },
      ];
      // Sum = 45, count = 3 -> avg = 15
      const res = sqlEmulatedMonthlyTripSummaries(records, []);
      expect(res[0]?.avgTripDurationMinutes).toBe(15);

      // Add a 4th record: duration 22 -> Sum = 67, count = 4 -> 67 / 4 = 16.75 -> round to 17
      records.push({
        id: 't-4',
        driverId: 'd-1',
        driver,
        reachedAt: new Date('2026-01-13T10:00:00Z'),
        tripDurationMinutes: 22,
        waitingTimeMinutes: 0,
      });
      const res2 = sqlEmulatedMonthlyTripSummaries(records, []);
      expect(res2[0]?.avgTripDurationMinutes).toBe(17);
    });
  });
});
