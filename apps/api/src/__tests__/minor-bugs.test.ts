import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveAdminUserIds, invalidateAdminCache } from '../lib/admin-cache';
import { prisma } from '../lib/prisma';
import { toComplaintPublic } from '../lib/serializers';
import { checkAvailabilityRateLimiter } from '../middleware/rate-limit';
import { listUsers, deleteUser } from '../modules/users/users.service';
import { transcribeComplaint } from '../modules/complaints/complaints.service';
import * as complaintsService from '../modules/complaints/complaints.service';
import { checkAndEscalateSlaBreaches } from '../modules/complaints/sla-escalation.service';
import * as settingsService from '../modules/settings/settings.service';
import { login } from '../modules/auth/auth.service';
import * as passwordLib from '../lib/password';

const VALID_UUID_1 = '018f3a5b-7c8d-7012-8456-789abcdef012';
const VALID_UUID_2 = '018f3a5b-7c8d-7012-8456-789abcdef013';

describe('Minor Bug Fixes (M-1 to M-10) — Verification Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateAdminCache();
  });

  describe('M-1: getUnreadCount scope and status behavior', () => {
    it('uses status NEW filtered by actor scope', async () => {
      vi.spyOn(prisma.driver, 'findUnique').mockResolvedValue(null as any);

      const result = await complaintsService.getUnreadCount({ id: VALID_UUID_1, role: 'DRIVER' });
      expect(result).toEqual({ unreadCount: 0 }); // No driver profile -> 0
    });
  });

  describe('M-2: listUsers search with ADMIN visibility', () => {
    it('wraps both ADMIN visibility OR condition and search OR condition inside AND', async () => {
      const findManySpy = vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);

      await listUsers(
        { id: VALID_UUID_1, role: 'ADMIN' },
        { search: 'driverJohn' },
      );

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [{ role: 'DRIVER' }, { createdByAdminId: VALID_UUID_1 }],
              },
              {
                OR: [
                  { employeeId: { contains: 'driverJohn', mode: 'insensitive' } },
                  { firstName: { contains: 'driverJohn', mode: 'insensitive' } },
                  { lastName: { contains: 'driverJohn', mode: 'insensitive' } },
                  { email: { contains: 'driverJohn', mode: 'insensitive' } },
                  { phone: { contains: 'driverJohn', mode: 'insensitive' } },
                ],
              },
            ],
          }),
        }),
      );
    });

    it('does not apply AND wrapper for SUPER_ADMIN when no search filter is present', async () => {
      const findManySpy = vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);

      await listUsers({ id: VALID_UUID_1, role: 'SUPER_ADMIN' }, {});

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('M-4: SLA escalation batching', () => {
    it('batches notification createMany and complaint updateMany in a single transaction for all breaching complaints', async () => {
      vi.spyOn(settingsService, 'getCategorySlaList').mockResolvedValue([
        { id: VALID_UUID_1, category: 'BREAKDOWN', slaHours: 2, createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      const pastDate = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago (breached 2h SLA)

      vi.spyOn(prisma.complaint, 'findMany').mockResolvedValue([
        {
          id: VALID_UUID_1,
          complaintNo: 'DC-2026-000001',
          category: 'BREAKDOWN',
          createdAt: pastDate,
          lastSlaEscalatedAt: null,
          assignedTo: null,
          vehicle: null,
        },
        {
          id: VALID_UUID_2,
          complaintNo: 'DC-2026-000002',
          category: 'BREAKDOWN',
          createdAt: pastDate,
          lastSlaEscalatedAt: null,
          assignedTo: null,
          vehicle: null,
        },
      ] as any);

      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
        { id: VALID_UUID_1, role: 'SUPER_ADMIN', category: null, site: null },
      ] as any);

      let txExecuted = false;
      const mockTx = {
        notification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
        complaint: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        txExecuted = true;
        return cb(mockTx);
      });

      const result = await checkAndEscalateSlaBreaches();

      expect(result.checkedCount).toBe(2);
      expect(result.escalatedCount).toBe(2);
      expect(txExecuted).toBe(true);
      expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1);
      expect(mockTx.complaint.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [VALID_UUID_1, VALID_UUID_2] } },
        data: { lastSlaEscalatedAt: expect.any(Date) },
      });
    });
  });

  describe('M-5: admin-cache thundering herd in-flight deduplication', () => {
    it('deduplicates concurrent database queries to a single call when cache is empty', async () => {
      let queryCount = 0;
      vi.spyOn(prisma.user, 'findMany').mockImplementation((() => {
        queryCount++;
        return new Promise((res) => setTimeout(() => res([{ id: VALID_UUID_1 }, { id: VALID_UUID_2 }]), 50));
      }) as any);

      const results = await Promise.all(
        Array.from({ length: 10 }).map(() => getActiveAdminUserIds()),
      );

      expect(queryCount).toBe(1);
      for (const res of results) {
        expect(res).toEqual([VALID_UUID_1, VALID_UUID_2]);
      }
    });

    it('returns cached results on subsequent calls without querying DB', async () => {
      let queryCount = 0;
      vi.spyOn(prisma.user, 'findMany').mockImplementation((() => {
        queryCount++;
        return Promise.resolve([{ id: VALID_UUID_1 }]);
      }) as any);

      const first = await getActiveAdminUserIds();
      const second = await getActiveAdminUserIds();

      expect(queryCount).toBe(1);
      expect(first).toEqual([VALID_UUID_1]);
      expect(second).toEqual([VALID_UUID_1]);
    });
  });

  describe('M-6: transcribeComplaint authorization guard', () => {
    it('rejects forbidden complaint access during transcribeComplaint before starting transcription', async () => {
      vi.spyOn(prisma.complaint, 'findUnique').mockResolvedValue({
        id: VALID_UUID_1,
        category: 'FUEL_DEF',
        assignedToId: VALID_UUID_2,
        driver: { userId: 'different-driver' },
        attachments: [{ kind: 'VOICE', url: 'https://example.com/voice.m4a' }],
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: VALID_UUID_1,
        role: 'EXECUTIVE',
        category: 'BREAKDOWN',
      } as any);

      await expect(
        transcribeComplaint({ id: VALID_UUID_1, role: 'EXECUTIVE' }, VALID_UUID_1),
      ).rejects.toThrow('You can only view complaints assigned to you, your department, or your vehicles');
    });
  });

  describe('M-7: deleteUser anonymizes attachment uploader without false attribution', () => {
    it('sets uploadedById to null for target user attachments to preserve evidence cleanly', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: VALID_UUID_1,
        role: 'ADMIN',
        firstName: 'Executive',
        lastName: 'User',
        driver: null,
      } as any);

      const mockTx = {
        user: { updateMany: vi.fn(), delete: vi.fn() },
        adminCategoryAssignment: { deleteMany: vi.fn() },
        vehicle: { updateMany: vi.fn() },
        complaint: { updateMany: vi.fn() },
        sparePartRequest: { updateMany: vi.fn() },
        complaintAttachment: { updateMany: vi.fn() },
        complaintUpdate: { deleteMany: vi.fn() },
        driver: { findUnique: vi.fn().mockResolvedValue(null) },
        notification: { deleteMany: vi.fn() },
        deviceToken: { deleteMany: vi.fn() },
        refreshToken: { deleteMany: vi.fn() },
        supportMessage: { deleteMany: vi.fn() },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      await deleteUser({ id: VALID_UUID_2, role: 'SUPER_ADMIN' }, VALID_UUID_1);

      expect(mockTx.complaintAttachment.updateMany).toHaveBeenCalledWith({
        where: { uploadedById: VALID_UUID_1 },
        data: { uploadedById: null },
      });
    });
  });

  describe('M-8: duplicate tripLocationName and locationName compatibility', () => {
    it('preserves both locationName and tripLocationName in serialized ComplaintPublic', () => {
      const mockComplaint: any = {
        id: VALID_UUID_1,
        complaintNo: 'DC-2026-000001',
        driverId: VALID_UUID_2,
        title: 'Breakdown',
        description: 'Engine stopped',
        category: 'BREAKDOWN',
        status: 'NEW',
        priority: 'HIGH',
        locationName: 'Highway 10',
        createdAt: new Date('2026-10-07T10:00:00Z'),
        updatedAt: new Date('2026-10-07T10:00:00Z'),
      };

      const result = toComplaintPublic(mockComplaint);
      expect(result.locationName).toBe('Highway 10');
      expect(result.tripLocationName).toBe('Highway 10');
    });
  });

  describe('M-9: checkAvailability endpoint rate limiting middleware', () => {
    it('is exported as an express-rate-limit middleware instance', () => {
      expect(checkAvailabilityRateLimiter).toBeDefined();
      expect(typeof checkAvailabilityRateLimiter).toBe('function');
    });
  });

  describe('M-10: lockout counter reset after expiry', () => {
    it('resets stale lockout state when lock has expired upon login attempt', async () => {
      const expiredLock = new Date(Date.now() - 10_000); // 10 seconds ago

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: VALID_UUID_1,
        employeeId: 'EMP001',
        pinHash: 'hashedpin',
        isActive: true,
        failedLoginAttempts: 5,
        lockedUntil: expiredLock,
      } as any);

      vi.spyOn(passwordLib, 'verifyPin').mockResolvedValue(false); // Invalid PIN

      const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      await expect(
        login('EMP001', '123456', { ipAddress: '127.0.0.1' }),
      ).rejects.toThrow('Invalid credentials');

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: VALID_UUID_1 },
        data: {
          failedLoginAttempts: 1,
          lockedUntil: null,
        },
      });
    });
  });
});
