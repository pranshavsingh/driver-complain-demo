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
    categorySla: {
      findMany: vi.fn().mockResolvedValue([]),
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

    vi.mocked(prisma.complaint.groupBy)
      .mockResolvedValueOnce([
        { status: 'NEW', _count: { id: 5 } } as any,
        { status: 'IN_PROGRESS', _count: { id: 10 } } as any,
        { status: 'RESOLVED', _count: { id: 20 } } as any,
        { status: 'CLOSED', _count: { id: 3 } } as any,
      ])
      .mockResolvedValueOnce([
        { category: 'BREAKDOWN', _count: { id: 8 } } as any,
        { category: 'FUEL_DEF', _count: { id: 7 } } as any,
      ]);

    vi.mocked(prisma.complaint.count)
      .mockResolvedValueOnce(4) // needsAction
      .mockResolvedValueOnce(3) // escalated
      .mockResolvedValueOnce(6) // today
      .mockResolvedValueOnce(2); // overSla

    const summary = await getSummary({ id: 'super-admin-1', role: 'SUPER_ADMIN' });

    expect(summary).toMatchObject({
      total: 38,
      new: 5,
      inProgress: 10,
      resolved: 20,
      closed: 3,
      needsAction: 4,
      escalated: 3,
      today: 6,
      overSla: 2,
    });
    expect(summary.byCategory?.BREAKDOWN).toBe(8);
    expect(summary.byCategory?.FUEL_DEF).toBe(7);

    // Check where clause sent to Prisma groupBy: no category restrictions for SUPER_ADMIN
    const lastGroupByCall = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = lastGroupByCall.where?.AND as any[];
    if (whereAnd) {
      const categoryConditions = whereAnd.filter((cond) => cond.category);
      expect(categoryConditions.length).toBe(0);
    }
  });

  it('EXECUTIVE: strictly restricted to assigned category, site, and assignment scoping', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: ['BREAKDOWN'],
      site: 'Bay-North',
    });

    vi.mocked(prisma.complaint.groupBy)
      .mockResolvedValueOnce([
        { status: 'NEW', _count: { id: 2 } } as any,
        { status: 'IN_PROGRESS', _count: { id: 1 } } as any,
      ])
      .mockResolvedValueOnce([
        { category: 'BREAKDOWN', _count: { id: 3 } } as any,
      ]);

    vi.mocked(prisma.complaint.count)
      .mockResolvedValueOnce(1) // needsAction
      .mockResolvedValueOnce(1) // escalated
      .mockResolvedValueOnce(2) // today
      .mockResolvedValueOnce(0); // overSla

    const summary = await getSummary({ id: 'exec-1', role: 'EXECUTIVE' });

    expect(summary).toMatchObject({
      total: 3,
      new: 2,
      inProgress: 1,
      resolved: 0,
      closed: 0,
      needsAction: 1,
      escalated: 1,
      today: 2,
      overSla: 0,
    });
    expect(summary.byCategory?.BREAKDOWN).toBe(3);
    expect(summary.byCategory?.FUEL_DEF).toBe(0);

    const firstGroupByCall = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = firstGroupByCall.where?.AND as any[];
    expect(whereAnd).toBeDefined();

    // Verify hard category gate
    const categoryGate = whereAnd.find(
      (cond) => cond.category && cond.category.in && cond.category.in.includes('BREAKDOWN'),
    );
    expect(categoryGate).toBeDefined();
    expect(categoryGate.category.in).toEqual(['BREAKDOWN']);

    // Verify site/assignment scope OR conditions
    const scopeOrCond = whereAnd.find((cond) => cond.OR && Array.isArray(cond.OR));
    expect(scopeOrCond).toBeDefined();
    expect(scopeOrCond.OR).toEqual(
      expect.arrayContaining([
        { assignedToId: 'exec-1' },
        { vehicle: { siteInchargeId: 'exec-1' } },
        { driver: { vehicles: { some: { siteInchargeId: 'exec-1' } } } },
        { vehicle: { siteIncharge: { site: { equals: 'Bay-North', mode: 'insensitive' } } } },
      ]),
    );

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

    vi.mocked(prisma.complaint.groupBy)
      .mockResolvedValueOnce([
        { status: 'NEW', _count: { id: 1 } } as any,
        { status: 'RESOLVED', _count: { id: 4 } } as any,
      ])
      .mockResolvedValueOnce([
        { category: 'TYRE_ISSUE', _count: { id: 1 } } as any,
      ]);

    vi.mocked(prisma.complaint.count)
      .mockResolvedValueOnce(0) // needsAction
      .mockResolvedValueOnce(0) // escalated
      .mockResolvedValueOnce(1) // today
      .mockResolvedValueOnce(0); // overSla

    const summary = await getSummary({ id: 'dept-admin-1', role: 'ADMIN' });

    expect(summary).toMatchObject({
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

  it('DRIVER: strictly scoped to driver profile id and cannot view other drivers complaints', async () => {
    vi.mocked(prisma.driver.findUnique).mockResolvedValue({
      id: 'driver-profile-uuid',
    } as any);

    vi.mocked(prisma.complaint.groupBy)
      .mockResolvedValueOnce([
        { status: 'NEW', _count: { id: 1 } } as any,
      ])
      .mockResolvedValueOnce([
        { category: 'BREAKDOWN', _count: { id: 1 } } as any,
      ]);
    vi.mocked(prisma.complaint.count)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

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

  it('needsAction count strictly respects caller visibility and scoping conditions', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: ['BREAKDOWN'],
      site: 'Plant-East',
    });

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.complaint.count).mockResolvedValue(2);

    await getSummary({ id: 'exec-east', role: 'EXECUTIVE' });

    // The first prisma.complaint.count call calculates needsActionCount
    const needsActionCallArg = vi.mocked(prisma.complaint.count).mock.calls[0]![0] as any;
    const countWhereAnd = needsActionCallArg.where.AND;

    // Must include the caller's scoped category filter
    const hasCategoryScoping = countWhereAnd.some(
      (cond: any) => cond.category && cond.category.in && cond.category.in.includes('BREAKDOWN'),
    );
    expect(hasCategoryScoping).toBe(true);

    // Must include the caller's executive scope OR conditions
    const hasExecutiveScoping = countWhereAnd.some((cond: any) =>
      cond.OR && cond.OR.some((sub: any) => sub.assignedToId === 'exec-east' || sub.vehicle?.siteInchargeId === 'exec-east'),
    );
    expect(hasExecutiveScoping).toBe(true);

    // Must include the needsAction unassigned/unresponded NEW status filter
    const hasNeedsActionFilter = countWhereAnd.some(
      (cond: any) => cond.status === 'NEW' && cond.OR && cond.OR.some((sub: any) => sub.assignedToId === null),
    );
    expect(hasNeedsActionFilter).toBe(true);
  });

  it('Additional filters (driverId, vehicleId) are strictly honored across summary aggregations', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'SUPER_ADMIN',
      categories: null,
      site: null,
    });

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.complaint.count).mockResolvedValue(0);

    await getSummary(
      { id: 'super-admin', role: 'SUPER_ADMIN' },
      { driverId: 'filter-driver-uuid', vehicleId: 'filter-vehicle-uuid' } as any,
    );

    const groupByCallArg = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0] as any;
    const whereAnd = groupByCallArg.where.AND;

    expect(whereAnd).toEqual(
      expect.arrayContaining([
        { driverId: 'filter-driver-uuid' },
        { vehicleId: 'filter-vehicle-uuid' },
      ]),
    );

    // Also verify needsAction count received driverId and vehicleId filters
    const needsActionCallArg = vi.mocked(prisma.complaint.count).mock.calls[0]![0] as any;
    expect(needsActionCallArg.where.AND).toEqual(
      expect.arrayContaining([
        { driverId: 'filter-driver-uuid' },
        { vehicleId: 'filter-vehicle-uuid' },
      ]),
    );
  });

  it('Summary parity: cannot reveal counts from records excluded by normal complaint list endpoint', async () => {
    // Executive at North site assigned only to TYRE_ISSUE
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: ['TYRE_ISSUE'],
      site: 'North-Depot',
    });

    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.complaint.count).mockResolvedValue(0);

    await getSummary({ id: 'exec-north', role: 'EXECUTIVE' });

    // Inspect the where clause passed to all aggregate queries
    const groupByWhere = vi.mocked(prisma.complaint.groupBy).mock.calls[0]![0]!.where as any;
    const countWhere = vi.mocked(prisma.complaint.count).mock.calls[0]![0]!.where as any;

    // Both queries enforce the exact same restriction
    expect(groupByWhere.AND).toBeDefined();
    expect(countWhere.AND).toBeDefined();

    // Verifies no leak of BREAKDOWN or other categories
    const categoryIn = groupByWhere.AND.find((c: any) => c.category)?.category?.in;
    expect(categoryIn).toEqual(['TYRE_ISSUE']);

    // Verifies executive site boundary prevents seeing South-Depot or unassigned vehicles
    const orClauses = groupByWhere.AND.find((c: any) => c.OR)?.OR;
    expect(orClauses).toBeDefined();
    const siteMatches = orClauses.filter((c: any) => c.vehicle?.siteIncharge?.site);
    expect(siteMatches[0].vehicle.siteIncharge.site.equals).toBe('North-Depot');
  });

  describe('SLA threshold verification and canonical rules', () => {
    it('uses canonical SLA configuration (BREAKDOWN: 2h, TYRE_ISSUE: 4h, FUEL_DEF: 4h, LOADING: 12h, UNLOADING: 12h, VEHICLE_MAINTENANCE: 24h, ACCOUNTS: 24h)', async () => {
      vi.mocked(resolveUserScope).mockResolvedValue({
        role: 'SUPER_ADMIN',
        categories: [],
        site: null,
      });
      vi.mocked(prisma.categorySla.findMany).mockResolvedValue([]); // Canonical defaults
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const beforeCall = Date.now();
      await getSummary({ id: 'super-admin', role: 'SUPER_ADMIN' });
      const afterCall = Date.now();

      // Find the overSla count call (the 4th count call)
      const overSlaCall = vi.mocked(prisma.complaint.count).mock.calls[3]![0] as any;
      expect(overSlaCall.where.AND).toBeDefined();

      const overSlaFilter = overSlaCall.where.AND.find((clause: any) => clause.status && clause.OR);
      expect(overSlaFilter.status).toEqual({ in: ['NEW', 'IN_PROGRESS'] });

      const conditions = overSlaFilter.OR as Array<{ category: string; createdAt: { lte: Date } }>;
      expect(conditions).toHaveLength(7);

      const conditionMap = new Map(conditions.map((c) => [c.category, c.createdAt.lte.getTime()]));

      // Canonical expected hours:
      // BREAKDOWN: 2h, TYRE_ISSUE: 4h, FUEL_DEF: 4h, LOADING: 12h, UNLOADING: 12h, VEHICLE_MAINTENANCE: 24h, ACCOUNTS: 24h
      const expectedHours: Record<string, number> = {
        BREAKDOWN: 2,
        TYRE_ISSUE: 4,
        FUEL_DEF: 4,
        LOADING: 12,
        UNLOADING: 12,
        VEHICLE_MAINTENANCE: 24,
        ACCOUNTS: 24,
      };

      for (const [cat, hours] of Object.entries(expectedHours)) {
        const timestamp = conditionMap.get(cat);
        expect(timestamp).toBeDefined();
        const expectedMin = beforeCall - hours * 3600 * 1000;
        const expectedMax = afterCall - hours * 3600 * 1000;
        expect(timestamp).toBeGreaterThanOrEqual(expectedMin - 100);
        expect(timestamp).toBeLessThanOrEqual(expectedMax + 100);
      }
    });

    it('dynamically respects custom SLA overrides configured in database', async () => {
      vi.mocked(resolveUserScope).mockResolvedValue({
        role: 'SUPER_ADMIN',
        categories: [],
        site: null,
      });
      // Database has custom overrides: BREAKDOWN set to 6h, FUEL_DEF set to 8h
      vi.mocked(prisma.categorySla.findMany).mockResolvedValue([
        { id: '1', category: 'BREAKDOWN', slaHours: 6, updatedAt: new Date() },
        { id: '2', category: 'FUEL_DEF', slaHours: 8, updatedAt: new Date() },
      ] as any);

      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const beforeCall = Date.now();
      await getSummary({ id: 'super-admin', role: 'SUPER_ADMIN' });

      const overSlaCall = vi.mocked(prisma.complaint.count).mock.calls[3]![0] as any;
      const overSlaFilter = overSlaCall.where.AND.find((clause: any) => clause.status && clause.OR);
      const conditions = overSlaFilter.OR as Array<{ category: string; createdAt: { lte: Date } }>;
      const conditionMap = new Map(conditions.map((c) => [c.category, c.createdAt.lte.getTime()]));

      // BREAKDOWN should use overridden 6h instead of default 2h
      const breakdownTime = conditionMap.get('BREAKDOWN')!;
      expect(breakdownTime).toBeLessThanOrEqual(beforeCall - 6 * 3600 * 1000 + 100);
      expect(breakdownTime).toBeGreaterThanOrEqual(beforeCall - 6 * 3600 * 1000 - 1000);

      // FUEL_DEF should use overridden 8h instead of default 4h
      const fuelTime = conditionMap.get('FUEL_DEF')!;
      expect(fuelTime).toBeLessThanOrEqual(beforeCall - 8 * 3600 * 1000 + 100);
      expect(fuelTime).toBeGreaterThanOrEqual(beforeCall - 8 * 3600 * 1000 - 1000);

      // Unchanged category (e.g. TYRE_ISSUE) retains canonical default 4h
      const tyreTime = conditionMap.get('TYRE_ISSUE')!;
      expect(tyreTime).toBeLessThanOrEqual(beforeCall - 4 * 3600 * 1000 + 100);
    });
  });
});
