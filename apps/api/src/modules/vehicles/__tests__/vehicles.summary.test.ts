import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSummary, getAssignments, list } from '../vehicles.service';
import { prisma } from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    vehicle: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('Vehicles Service - Scoping & Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSummary', () => {
    it('SUPER_ADMIN: sees lightweight fleet-wide metrics without unbounded driver lists or siteInchargeId filter', async () => {
      vi.mocked(prisma.vehicle.count)
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(35)  // assignedCount
        .mockResolvedValueOnce(45); // activeAgreementsCount

      const res = await getSummary({ id: 'sa-1', role: 'SUPER_ADMIN' });

      expect(res).toEqual({
        total: 50,
        assignedCount: 35,
        freeCount: 15,
        activeAgreementsCount: 45,
        utilizationPct: 70,
      });

      // Verify no findMany call made during summary (strictly O(1) lightweight counts)
      expect(prisma.vehicle.findMany).not.toHaveBeenCalled();

      // Verify no siteInchargeId restriction in count calls
      const firstCountCall = vi.mocked(prisma.vehicle.count).mock.calls[0]![0];
      expect(firstCountCall?.where?.siteInchargeId).toBeUndefined();
    });

    it('EXECUTIVE: strictly scoped to siteInchargeId matching actor id', async () => {
      vi.mocked(prisma.vehicle.count)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(9);

      const res = await getSummary({ id: 'exec-123', role: 'EXECUTIVE' });

      expect(res.total).toBe(10);
      expect(res.assignedCount).toBe(8);
      expect(res.freeCount).toBe(2);

      // Verify strict role scoping across all count calls
      const countCalls = vi.mocked(prisma.vehicle.count).mock.calls;
      for (const call of countCalls) {
        expect(call[0]?.where?.siteInchargeId).toBe('exec-123');
      }
    });
  });

  describe('getAssignments', () => {
    it('SUPER_ADMIN: returns driver assignments without siteInchargeId restriction', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([
        {
          id: 'v1',
          plateNumber: 'WB-01-1111',
          driverId: 'd1',
          driver: { user: { firstName: 'John', lastName: 'Doe' } },
        } as any,
      ]);

      const res = await getAssignments({ driverIds: ['d1', 'd2'] }, { id: 'sa-1', role: 'SUPER_ADMIN' });

      expect(res).toEqual([
        {
          vehicleId: 'v1',
          plateNumber: 'WB-01-1111',
          driverId: 'd1',
          driverName: 'John Doe',
        },
      ]);

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.where.driverId).toEqual({ in: ['d1', 'd2'] });
      expect(findManyCall.where.siteInchargeId).toBeUndefined();
    });

    it('EXECUTIVE: strictly enforces siteInchargeId in assignments lookup', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([]);

      await getAssignments({ driverId: 'd-target' }, { id: 'exec-site', role: 'EXECUTIVE' });

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.where.siteInchargeId).toBe('exec-site');
      expect(findManyCall.where.driverId).toBe('d-target');
    });
  });

  describe('list pagination and filters', () => {
    it('applies pagination skip/take and assignmentFilter = ASSIGNED', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.vehicle.count).mockResolvedValueOnce(25);

      const res = await list(
        { page: 2, pageSize: 10, assignmentFilter: 'ASSIGNED', search: 'WB-01' },
        { id: 'admin-1', role: 'ADMIN' },
      );

      expect(res.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(10);
      expect(findManyCall.where.driverId).toEqual({ not: null });
      expect(findManyCall.where.OR).toBeDefined();
    });

    it('EXECUTIVE list: strictly enforces siteInchargeId in where clause', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.vehicle.count).mockResolvedValueOnce(0);

      await list(
        { page: 1, pageSize: 15, assignmentFilter: 'FREE' },
        { id: 'exec-site-incharge', role: 'EXECUTIVE' },
      );

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.where.siteInchargeId).toBe('exec-site-incharge');
      expect(findManyCall.where.driverId).toBeNull();
    });
  });
});

