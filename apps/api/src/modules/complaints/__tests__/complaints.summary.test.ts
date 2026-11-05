import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSummary } from '../complaints.service';
import { prisma } from '../../../lib/prisma';
import { resolveUserScope } from '../../../lib/user-scope';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    driver: {
      findUnique: vi.fn(),
    },
    complaint: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    adminCategoryAssignment: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/user-scope', () => ({
  resolveUserScope: vi.fn(),
}));

describe('GET /complaints/summary - Security & Role Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SUPER_ADMIN: returns global summary counts without category restriction', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'SUPER_ADMIN',
      categories: null,
      site: null,
    });

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
      { status: 'NEW', _count: { id: 5 } } as any,
      { status: 'IN_PROGRESS', _count: { id: 10 } } as any,
      { status: 'RESOLVED', _count: { id: 20 } } as any,
      { status: 'CLOSED', _count: { id: 3 } } as any,
    ]);

    vi.mocked(prisma.complaint.count).mockResolvedValue(4);

    const summary = await getSummary({ id: 'super-admin-1', role: 'SUPER_ADMIN' });

    expect(summary).toEqual({
      total: 38,
      new: 5,
      inProgress: 10,
      resolved: 20,
      closed: 3,
      needsAction: 4,
    });

    // Check where clause sent to Prisma groupBy: no category restrictions for SUPER_ADMIN
    const lastGroupByCall = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = lastGroupByCall.where?.AND as any[];
    if (whereAnd) {
      const categoryConditions = whereAnd.filter((cond) => cond.category);
      expect(categoryConditions.length).toBe(0);
    }
  });

  it('EXECUTIVE: strictly restricted to assigned category and cannot infer out-of-scope counts', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: ['BREAKDOWN'],
      site: 'Bay-North',
    });

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
      { status: 'NEW', _count: { id: 2 } } as any,
      { status: 'IN_PROGRESS', _count: { id: 1 } } as any,
    ]);

    vi.mocked(prisma.complaint.count).mockResolvedValue(1);

    const summary = await getSummary({ id: 'exec-1', role: 'EXECUTIVE' });

    expect(summary).toEqual({
      total: 3,
      new: 2,
      inProgress: 1,
      resolved: 0,
      closed: 0,
      needsAction: 1,
    });

    const lastGroupByCall = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = lastGroupByCall.where?.AND as any[];
    expect(whereAnd).toBeDefined();

    // Verify hard category gate
    const hasCategoryGate = whereAnd.some(
      (cond) => cond.category && cond.category.in && cond.category.in.includes('BREAKDOWN'),
    );
    expect(hasCategoryGate).toBe(true);

    // Verify out-of-scope category FUEL_DEF is NOT in the allowed list
    const allowsFuel = whereAnd.some(
      (cond) => cond.category && cond.category.in && cond.category.in.includes('FUEL_DEF'),
    );
    expect(allowsFuel).toBe(false);
  });

  it('ADMIN: scoped to assigned department categories if set', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'ADMIN',
      categories: ['TYRE_ISSUE', 'VEHICLE_MAINTENANCE'],
      site: null,
    });

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
      { status: 'NEW', _count: { id: 1 } } as any,
      { status: 'RESOLVED', _count: { id: 4 } } as any,
    ]);

    vi.mocked(prisma.complaint.count).mockResolvedValue(0);

    const summary = await getSummary({ id: 'dept-admin-1', role: 'ADMIN' });

    expect(summary).toEqual({
      total: 5,
      new: 1,
      inProgress: 0,
      resolved: 4,
      closed: 0,
      needsAction: 0,
    });

    const lastGroupByCall = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = lastGroupByCall.where?.AND as any[];
    const categoryGate = whereAnd.find((cond) => cond.category && cond.category.in);
    expect(categoryGate.category.in).toEqual(['TYRE_ISSUE', 'VEHICLE_MAINTENANCE']);
  });

  it('DRIVER: strictly scoped to driver profile id', async () => {
    vi.mocked(prisma.driver.findUnique).mockResolvedValue({
      id: 'driver-profile-uuid',
    } as any);

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
      { status: 'NEW', _count: { id: 1 } } as any,
    ]);
    vi.mocked(prisma.complaint.count).mockResolvedValue(1);

    const summary = await getSummary({ id: 'driver-user-id', role: 'DRIVER' });

    expect(summary.total).toBe(1);
    expect(summary.new).toBe(1);

    const lastGroupByCall = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = lastGroupByCall.where?.AND as any[];
    const driverGate = whereAnd.find((cond) => cond.driverId === 'driver-profile-uuid');
    expect(driverGate).toBeDefined();
  });

  it('DRIVER without profile: returns zero counts immediately without query execution', async () => {
    vi.mocked(prisma.driver.findUnique).mockResolvedValue(null);

    const summary = await getSummary({ id: 'unregistered-driver-user-id', role: 'DRIVER' });

    expect(summary).toEqual({
      total: 0,
      new: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      needsAction: 0,
    });
    expect(prisma.complaint.groupBy).not.toHaveBeenCalled();
    expect(prisma.complaint.count).not.toHaveBeenCalled();
  });
});
