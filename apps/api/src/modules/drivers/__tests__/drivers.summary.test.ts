import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSummary } from '../drivers.service';
import { prisma } from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    driver: {
      count: vi.fn(),
    },
    vehicle: {
      groupBy: vi.fn(),
    },
  },
}));

describe('drivers.service - getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SUPER_ADMIN: returns global driver counts counting distinct assigned driver IDs', async () => {
    vi.mocked(prisma.driver.count).mockResolvedValue(40);
    vi.mocked(prisma.vehicle.groupBy).mockResolvedValue([
      ...Array.from({ length: 25 }, (_, i) => ({ driverId: `driver-${i + 1}` })),
    ] as any);

    const result = await getSummary({ id: 'super-admin', role: 'SUPER_ADMIN' });

    expect(result).toEqual({
      total: 40,
      assignedCount: 25,
      freeCount: 15,
    });
    expect(prisma.driver.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.vehicle.groupBy).toHaveBeenCalledWith({
      by: ['driverId'],
      where: { driverId: { not: null } },
    });
  });

  it('EXECUTIVE: strictly scopes driver and vehicle queries to siteInchargeId', async () => {
    vi.mocked(prisma.driver.count).mockResolvedValue(10);
    vi.mocked(prisma.vehicle.groupBy).mockResolvedValue([
      ...Array.from({ length: 8 }, (_, i) => ({ driverId: `exec-driver-${i + 1}` })),
    ] as any);

    const result = await getSummary({ id: 'exec-site-incharge', role: 'EXECUTIVE' });

    expect(result).toEqual({
      total: 10,
      assignedCount: 8,
      freeCount: 2,
    });
    expect(prisma.driver.count).toHaveBeenCalledWith({
      where: { vehicles: { some: { siteInchargeId: 'exec-site-incharge' } } },
    });
    expect(prisma.vehicle.groupBy).toHaveBeenCalledWith({
      by: ['driverId'],
      where: { siteInchargeId: 'exec-site-incharge', driverId: { not: null } },
    });
  });

  it('correctly handles multiple vehicles referencing the same driver (distinct driver counting)', async () => {
    // 5 total drivers in the fleet
    vi.mocked(prisma.driver.count).mockResolvedValue(5);

    // Fleet has 10 assigned vehicles, but they only reference 2 distinct drivers
    // (Driver D1 has 6 vehicles, Driver D2 has 4 vehicles)
    vi.mocked(prisma.vehicle.groupBy).mockResolvedValue([
      { driverId: 'driver-d1' },
      { driverId: 'driver-d2' },
    ] as any);

    const result = await getSummary({ id: 'admin-1', role: 'ADMIN' });

    // Distinct assignedCount is 2 (NOT 10 vehicles)
    expect(result.assignedCount).toBe(2);
    expect(result.total).toBe(5);
    // freeCount = 5 - 2 = 3
    expect(result.freeCount).toBe(3);
  });

  it('executive scope: counts distinct drivers when an executive vehicle set has multiple vehicles per driver', async () => {
    vi.mocked(prisma.driver.count).mockResolvedValue(2);
    // Executive has 3 vehicles assigned to the same driver
    vi.mocked(prisma.vehicle.groupBy).mockResolvedValue([
      { driverId: 'exec-shared-driver' },
    ] as any);

    const result = await getSummary({ id: 'exec-incharge-99', role: 'EXECUTIVE' });

    expect(result.assignedCount).toBe(1);
    expect(result.total).toBe(2);
    expect(result.freeCount).toBe(1);
    expect(prisma.vehicle.groupBy).toHaveBeenCalledWith({
      by: ['driverId'],
      where: { siteInchargeId: 'exec-incharge-99', driverId: { not: null } },
    });
  });

  it('never returns negative freeCount even if assignedCount exceeds total', async () => {
    vi.mocked(prisma.driver.count).mockResolvedValue(1);
    vi.mocked(prisma.vehicle.groupBy).mockResolvedValue([
      { driverId: 'driver-1' },
      { driverId: 'driver-2' },
    ] as any);

    const result = await getSummary({ id: 'admin-1', role: 'ADMIN' });

    expect(result.total).toBe(1);
    expect(result.assignedCount).toBe(2);
    expect(result.freeCount).toBe(0); // Clamped at 0
  });
});

