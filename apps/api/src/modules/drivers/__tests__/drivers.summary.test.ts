import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSummary } from '../drivers.service';
import { prisma } from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    driver: {
      count: vi.fn(),
    },
    vehicle: {
      count: vi.fn(),
    },
  },
}));

describe('drivers.service - getSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SUPER_ADMIN: returns global driver counts without siteInchargeId filter', async () => {
    vi.mocked(prisma.driver.count).mockResolvedValue(40);
    vi.mocked(prisma.vehicle.count).mockResolvedValue(25);

    const result = await getSummary({ id: 'super-admin', role: 'SUPER_ADMIN' });

    expect(result).toEqual({
      total: 40,
      assignedCount: 25,
      freeCount: 15,
    });
    expect(prisma.driver.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.vehicle.count).toHaveBeenCalledWith({ where: { driverId: { not: null } } });
  });

  it('EXECUTIVE: strictly scopes driver and vehicle queries to siteInchargeId', async () => {
    vi.mocked(prisma.driver.count).mockResolvedValue(10);
    vi.mocked(prisma.vehicle.count).mockResolvedValue(8);

    const result = await getSummary({ id: 'exec-site-incharge', role: 'EXECUTIVE' });

    expect(result).toEqual({
      total: 10,
      assignedCount: 8,
      freeCount: 2,
    });
    expect(prisma.driver.count).toHaveBeenCalledWith({
      where: { vehicles: { some: { siteInchargeId: 'exec-site-incharge' } } },
    });
    expect(prisma.vehicle.count).toHaveBeenCalledWith({
      where: { siteInchargeId: 'exec-site-incharge', driverId: { not: null } },
    });
  });
});

