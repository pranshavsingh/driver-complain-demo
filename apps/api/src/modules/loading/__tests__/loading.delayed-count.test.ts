import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDelayedLoadingCount } from '../loading.service';
import { handleGetDelayedCount } from '../loading.controller';
import { prisma } from '../../../lib/prisma';
import { resolveUserScope } from '../../../lib/user-scope';
import type { Request, Response } from 'express';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    loadingRecord: {
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/user-scope', () => ({
  resolveUserScope: vi.fn(),
}));

describe('getDelayedLoadingCount - Authorization & Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SUPER_ADMIN: receives authorized global delayed loading count without vehicle/site scoping', async () => {
    vi.mocked(prisma.loadingRecord.count).mockResolvedValue(12);

    const count = await getDelayedLoadingCount({ id: 'super-1', role: 'SUPER_ADMIN' });

    expect(count).toBe(12);
    expect(prisma.loadingRecord.count).toHaveBeenCalledTimes(1);

    const callArg = vi.mocked(prisma.loadingRecord.count).mock.calls[0]![0] as any;
    expect(callArg.where.OR).toBeDefined(); // Contains delay status conditions
    expect(callArg.where.AND).toBeUndefined(); // No site/vehicle scoping
  });

  it('ADMIN: receives authorized global delayed loading count without vehicle/site scoping', async () => {
    vi.mocked(prisma.loadingRecord.count).mockResolvedValue(8);

    const count = await getDelayedLoadingCount({ id: 'admin-1', role: 'ADMIN' });

    expect(count).toBe(8);
    const callArg = vi.mocked(prisma.loadingRecord.count).mock.calls[0]![0] as any;
    expect(callArg.where.AND).toBeUndefined();
  });

  it('EXECUTIVE: strictly scoped to permitted vehicles (siteInchargeId) and site', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: ['BREAKDOWN'],
      site: 'West-Hub',
    });
    vi.mocked(prisma.loadingRecord.count).mockResolvedValue(3);

    const count = await getDelayedLoadingCount({ id: 'exec-user-1', role: 'EXECUTIVE' });

    expect(count).toBe(3);
    expect(prisma.loadingRecord.count).toHaveBeenCalledTimes(1);

    const callArg = vi.mocked(prisma.loadingRecord.count).mock.calls[0]![0] as any;
    expect(callArg.where.AND).toBeDefined();

    const [delayCondition, scopeCondition] = callArg.where.AND;
    expect(delayCondition.OR).toBeDefined(); // Delay conditions

    // Scope conditions must contain siteInchargeId matching actor and site matching West-Hub
    expect(scopeCondition.OR).toEqual(
      expect.arrayContaining([
        { driver: { vehicles: { some: { siteInchargeId: 'exec-user-1' } } } },
        { complaint: { vehicle: { siteInchargeId: 'exec-user-1' } } },
        { driver: { vehicles: { some: { siteIncharge: { site: { equals: 'West-Hub', mode: 'insensitive' } } } } } },
        { complaint: { vehicle: { siteIncharge: { site: { equals: 'West-Hub', mode: 'insensitive' } } } } },
      ]),
    );
  });

  it('EXECUTIVE without configured site: scopes strictly by siteInchargeId only', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: [],
      site: null,
    });
    vi.mocked(prisma.loadingRecord.count).mockResolvedValue(1);

    const count = await getDelayedLoadingCount({ id: 'exec-no-site', role: 'EXECUTIVE' });

    expect(count).toBe(1);

    const callArg = vi.mocked(prisma.loadingRecord.count).mock.calls[0]![0] as any;
    const [, scopeCondition] = callArg.where.AND;

    expect(scopeCondition.OR).toEqual([
      { driver: { vehicles: { some: { siteInchargeId: 'exec-no-site' } } } },
      { complaint: { vehicle: { siteInchargeId: 'exec-no-site' } } },
    ]);
  });

  it('EXECUTIVE cannot receive global count: query strictly excludes fleet records outside permitted scope', async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({
      role: 'EXECUTIVE',
      categories: [],
      site: 'Site-Alpha',
    });
    vi.mocked(prisma.loadingRecord.count).mockResolvedValue(0);

    await getDelayedLoadingCount({ id: 'exec-alpha', role: 'EXECUTIVE' });

    const callArg = vi.mocked(prisma.loadingRecord.count).mock.calls[0]![0] as any;
    // Verify the query cannot match all records; it MUST contain scoping AND condition
    expect(callArg.where.AND).toBeDefined();
    const scopeOr = callArg.where.AND[1].OR;

    // None of the clauses allow unrestricted global fleet matching
    for (const cond of scopeOr) {
      if (cond.driver?.vehicles?.some?.siteInchargeId) {
        expect(cond.driver.vehicles.some.siteInchargeId).toBe('exec-alpha');
      }
      if (cond.complaint?.vehicle?.siteInchargeId) {
        expect(cond.complaint.vehicle.siteInchargeId).toBe('exec-alpha');
      }
      if (cond.driver?.vehicles?.some?.siteIncharge?.site) {
        expect(cond.driver.vehicles.some.siteIncharge.site.equals).toBe('Site-Alpha');
      }
    }
  });

  it('DRIVER or unknown role: receives 0 count', async () => {
    const count = await getDelayedLoadingCount({ id: 'driver-1', role: 'DRIVER' });
    expect(count).toBe(0);
    expect(prisma.loadingRecord.count).not.toHaveBeenCalled();
  });

  it('absent or invalid actor: fails closed and returns 0 without querying database', async () => {
    const countNull = await getDelayedLoadingCount(null as any);
    expect(countNull).toBe(0);
    const countUndefined = await getDelayedLoadingCount(undefined as any);
    expect(countUndefined).toBe(0);
    const countNoRole = await getDelayedLoadingCount({ id: 'bad-user' } as any);
    expect(countNoRole).toBe(0);
    expect(prisma.loadingRecord.count).not.toHaveBeenCalled();
  });

  describe('handleGetDelayedCount Controller', () => {
    it('passes authenticated actor to service and does not trust client-supplied site query', async () => {
      vi.mocked(resolveUserScope).mockResolvedValue({
        role: 'EXECUTIVE',
        categories: [],
        site: 'Real-Site',
      });
      vi.mocked(prisma.loadingRecord.count).mockResolvedValue(2);

      const req = {
        user: { id: 'exec-auth-id', role: 'EXECUTIVE' },
        query: { siteId: 'attacker-supplied-site-id', site: 'Fake-Site' },
      } as unknown as Request;

      let responseData: any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          responseData = data;
        }),
      } as unknown as Response;

      await handleGetDelayedCount(req, res);

      expect(responseData).toEqual({ success: true, data: { delayedCount: 2 } });
      expect(resolveUserScope).toHaveBeenCalledWith('exec-auth-id', 'EXECUTIVE');

      // The count where clause must use 'Real-Site' from resolveUserScope, NOT 'Fake-Site' or 'attacker-supplied-site-id'
      const callArg = vi.mocked(prisma.loadingRecord.count).mock.calls[0]![0] as any;
      const scopeOr = callArg.where.AND[1].OR;
      const siteCond = scopeOr.find((c: any) => c.driver?.vehicles?.some?.siteIncharge?.site);
      expect(siteCond.driver.vehicles.some.siteIncharge.site.equals).toBe('Real-Site');
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const req = { user: undefined } as unknown as Request;
      const res = {} as unknown as Response;

      await expect(handleGetDelayedCount(req, res)).rejects.toThrow();
    });
  });
});

