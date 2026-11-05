import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSummary, getAssignments, list } from '../vehicles.service';
import { assignments } from '../vehicles.controller';
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
      expect(findManyCall.take).toBe(2);
      expect(findManyCall.where.siteInchargeId).toBeUndefined();
    });

    it('handles 100 requested driver IDs and sets take limit to 100', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([]);

      const driverIds = Array.from({ length: 100 }, (_, i) => `driver-${i + 1}`);
      await getAssignments({ driverIds }, { id: 'admin-1', role: 'ADMIN' });

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.where.driverId).toEqual({ in: driverIds });
      expect(findManyCall.take).toBe(100);
    });

    it('caps requested IDs and limit at maximum 100 even if more are passed', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([]);

      const driverIds = Array.from({ length: 120 }, (_, i) => `driver-${i + 1}`);
      await getAssignments({ driverIds, limit: 150 }, { id: 'admin-1', role: 'ADMIN' });

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.where.driverId.in).toHaveLength(100);
      expect(findManyCall.take).toBe(100);
    });

    it('single driver lookup sets default take limit to 1', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValueOnce([]);

      await getAssignments({ driverId: 'd-single' }, { id: 'admin-1', role: 'ADMIN' });

      const findManyCall = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.where.driverId).toBe('d-single');
      expect(findManyCall.take).toBe(1);
    });

    it('service safely handles invalid/malformed limits (NaN, zero, negative, decimal)', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([]);

      // NaN fallback to default
      await getAssignments({ limit: NaN });
      let call = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(call.take).toBe(50);

      // Negative fallback to default
      await getAssignments({ limit: -10 });
      call = vi.mocked(prisma.vehicle.findMany).mock.calls[1]![0] as any;
      expect(call.take).toBe(50);

      // Zero fallback to default
      await getAssignments({ limit: 0 });
      call = vi.mocked(prisma.vehicle.findMany).mock.calls[2]![0] as any;
      expect(call.take).toBe(50);

      // Decimal floored to integer
      await getAssignments({ limit: 12.8 });
      call = vi.mocked(prisma.vehicle.findMany).mock.calls[3]![0] as any;
      expect(call.take).toBe(12);
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

  describe('assignments controller input validation', () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    it('rejects non-integer, negative, zero, or malformed limit queries with 400', async () => {
      await expect(assignments({ query: { limit: '0' } } as any, mockRes as any)).rejects.toThrow('positive integer');
      await expect(assignments({ query: { limit: '-5' } } as any, mockRes as any)).rejects.toThrow('positive integer');
      await expect(assignments({ query: { limit: 'abc' } } as any, mockRes as any)).rejects.toThrow('positive integer');
      await expect(assignments({ query: { limit: '12.5' } } as any, mockRes as any)).rejects.toThrow('positive integer');
      await expect(assignments({ query: { limit: '' } } as any, mockRes as any)).rejects.toThrow('positive integer');
    });

    it('accepts valid positive integer limit and caps at 100 if > 100', async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([]);

      // Over 100 capped to 100
      await assignments({ query: { limit: '150' } } as any, mockRes as any);
      let call = vi.mocked(prisma.vehicle.findMany).mock.calls[0]![0] as any;
      expect(call.take).toBe(100);

      // Valid boundary 75
      await assignments({ query: { limit: '75' } } as any, mockRes as any);
      call = vi.mocked(prisma.vehicle.findMany).mock.calls[1]![0] as any;
      expect(call.take).toBe(75);

      // Valid boundary 100
      await assignments({ query: { limit: '100' } } as any, mockRes as any);
      call = vi.mocked(prisma.vehicle.findMany).mock.calls[2]![0] as any;
      expect(call.take).toBe(100);
    });
  });
});

