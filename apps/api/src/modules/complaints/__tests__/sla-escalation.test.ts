import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { checkAndEscalateSlaBreaches } from '../sla-escalation.service';

const TEST_EXECUTIVE_ID = 'SLA_EXEC_01';
const TEST_ADMIN_ID = 'SLA_ADMIN_01';
const TEST_SUPER_ADMIN_ID = 'SLA_SA_01';
const TEST_DRIVER_ID = 'SLA_DRIVER_01';

let adminUserId: string;
let superAdminUserId: string;
let execUserId: string;
let driverUserId: string;
let driverId: string;

describe('SLA Breach Escalation Service', () => {
  beforeAll(async () => {
    // Clean previous test users
    await prisma.notification.deleteMany({
      where: {
        user: { employeeId: { in: [TEST_EXECUTIVE_ID, TEST_ADMIN_ID, TEST_SUPER_ADMIN_ID, TEST_DRIVER_ID] } },
      },
    });
    await prisma.complaint.deleteMany({
      where: {
        driver: { user: { employeeId: TEST_DRIVER_ID } },
      },
    });
    await prisma.user.deleteMany({
      where: { employeeId: { in: [TEST_EXECUTIVE_ID, TEST_ADMIN_ID, TEST_SUPER_ADMIN_ID, TEST_DRIVER_ID] } },
    });

    const pinHash = await hashPin('1234');

    // Create SuperAdmin
    const sa = await prisma.user.create({
      data: {
        employeeId: TEST_SUPER_ADMIN_ID,
        pinHash,
        role: 'SUPER_ADMIN',
        firstName: 'Super',
        lastName: 'Admin',
        approvalStatus: 'APPROVED',
      },
    });
    superAdminUserId = sa.id;

    // Create Category Admin (BREAKDOWN category)
    const admin = await prisma.user.create({
      data: {
        employeeId: TEST_ADMIN_ID,
        pinHash,
        role: 'ADMIN',
        category: 'BREAKDOWN',
        firstName: 'Category',
        lastName: 'Admin',
        approvalStatus: 'APPROVED',
      },
    });
    adminUserId = admin.id;

    // Create Executive under Admin
    const exec = await prisma.user.create({
      data: {
        employeeId: TEST_EXECUTIVE_ID,
        pinHash,
        role: 'EXECUTIVE',
        createdByAdminId: adminUserId,
        firstName: 'Site',
        lastName: 'Executive',
        approvalStatus: 'APPROVED',
      },
    });
    execUserId = exec.id;

    // Create Driver
    const driverUser = await prisma.user.create({
      data: {
        employeeId: TEST_DRIVER_ID,
        pinHash,
        role: 'DRIVER',
        firstName: 'Test',
        lastName: 'Driver',
        approvalStatus: 'APPROVED',
      },
    });
    driverUserId = driverUser.id;

    const driverRow = await prisma.driver.create({
      data: {
        userId: driverUserId,
        licenseNumber: 'LIC_SLA_TEST_01',
      },
    });
    driverId = driverRow.id;
  });

  afterAll(async () => {
    const userIds = [adminUserId, superAdminUserId, execUserId, driverUserId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { userId: { in: userIds } },
      });
    }
    if (driverId) {
      await prisma.complaint.deleteMany({
        where: { driverId },
      });
      await prisma.driver.deleteMany({ where: { id: driverId } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  it('escalates SLA breached complaint to Category Admin and SuperAdmin', async () => {
    // 3 hours ago (BREAKDOWN SLA is 2 hours)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const complaint = await prisma.complaint.create({
      data: {
        complaintNo: `SLA-TEST-${Date.now()}`,
        driverId,
        title: 'Breakdown Test',
        description: 'Engine stalled',
        category: 'BREAKDOWN',
        status: 'NEW',
        priority: 'URGENT',
        assignedToId: execUserId,
        createdAt: threeHoursAgo,
      },
    });

    const res = await checkAndEscalateSlaBreaches();
    expect(res.escalatedCount).toBeGreaterThanOrEqual(1);

    // Verify Notification records created for Category Admin and SuperAdmin
    const notifications = await prisma.notification.findMany({
      where: { complaintId: complaint.id },
    });

    const recipientUserIds = notifications.map((n) => n.userId);
    expect(recipientUserIds).toContain(adminUserId);
    expect(recipientUserIds).toContain(superAdminUserId);

    // Check complaint lastSlaEscalatedAt updated
    const updatedComplaint = await prisma.complaint.findUnique({
      where: { id: complaint.id },
    });
    expect(updatedComplaint?.lastSlaEscalatedAt).not.toBeNull();
  }, 30000);

  it('does not re-escalate within 24 hours if action is still pending', async () => {
    const result = await checkAndEscalateSlaBreaches();
    // The previously escalated complaint should not escalate again immediately
    expect(result.escalatedCount).toBe(0);
  }, 30000);
});
