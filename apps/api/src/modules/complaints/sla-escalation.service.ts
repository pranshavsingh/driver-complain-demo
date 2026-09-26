import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getCategorySlaList, EXCLUDED_SLA_CATEGORIES } from '../settings/settings.service';
import { emitEventToUsers } from '../../realtime/socket';

function formatEnum(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface SlaEscalationResult {
  checkedCount: number;
  escalatedCount: number;
  notifiedUserCount: number;
}

/**
 * Checks all open complaints against their Category SLA target durations.
 * If an open complaint has crossed SLA target time without resolution, sends notifications
 * to the Category Admin & SuperAdmins, and repeats every 24 hours until action is taken.
 */
export async function checkAndEscalateSlaBreaches(): Promise<SlaEscalationResult> {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // 1. Fetch active category SLA settings
  const categorySlas = await getCategorySlaList();
  const slaMap = new Map<string, number>(categorySlas.map((s) => [s.category, s.slaHours]));

  // 2. Fetch all open complaints (NEW or IN_PROGRESS)
  const openComplaints = await prisma.complaint.findMany({
    where: {
      status: { in: ['NEW', 'IN_PROGRESS'] },
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          role: true,
          category: true,
          site: true,
          createdByAdminId: true,
        },
      },
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          siteInchargeId: true,
          siteIncharge: {
            select: {
              id: true,
              createdByAdminId: true,
            },
          },
        },
      },
    },
  });

  // 3. Pre-fetch all active Category Admins & SuperAdmins
  const adminsAndSuperAdmins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      isActive: true,
    },
    select: {
      id: true,
      role: true,
      category: true,
      site: true,
    },
  });

  const superAdminIds = adminsAndSuperAdmins
    .filter((u) => u.role === 'SUPER_ADMIN')
    .map((u) => u.id);

  let escalatedCount = 0;
  let totalNotifiedUsers = 0;

  for (const complaint of openComplaints) {
    // Skip excluded categories (SUPPORT & COMPLAINT_STATUS)
    if (EXCLUDED_SLA_CATEGORIES.has(complaint.category)) continue;

    const targetSlaHours = slaMap.get(complaint.category) ?? 12;
    const elapsedMs = now.getTime() - complaint.createdAt.getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    // Check if complaint crossed its Category SLA duration
    if (elapsedHours <= targetSlaHours) continue;

    // Check 24-hour repeat rule: if already escalated, repeat only if 24 hours have elapsed
    if (complaint.lastSlaEscalatedAt) {
      const msSinceLastEscalation = now.getTime() - complaint.lastSlaEscalatedAt.getTime();
      if (msSinceLastEscalation < ONE_DAY_MS) {
        continue;
      }
    }

    // Identify target Category Admins for this complaint:
    // a) Admins with matching category
    // b) Admin who created the assigned Executive (createdByAdminId)
    // c) Admin who created the vehicle site incharge
    const categoryAdminIds = new Set<string>();

    for (const admin of adminsAndSuperAdmins) {
      if (admin.role === 'ADMIN') {
        if (admin.category && admin.category === complaint.category) {
          categoryAdminIds.add(admin.id);
        }
        if (complaint.assignedTo?.createdByAdminId && admin.id === complaint.assignedTo.createdByAdminId) {
          categoryAdminIds.add(admin.id);
        }
        if (complaint.vehicle?.siteIncharge?.createdByAdminId && admin.id === complaint.vehicle.siteIncharge.createdByAdminId) {
          categoryAdminIds.add(admin.id);
        }
      }
    }

    // Combine Category Admins & SuperAdmins
    const recipientUserIds = Array.from(new Set([...categoryAdminIds, ...superAdminIds]));
    if (recipientUserIds.length === 0) continue;

    const formattedCategory = formatEnum(complaint.category);
    const roundedElapsed = Math.round(elapsedHours);

    const title = `🚨 SLA Breached: Action Required (${complaint.complaintNo})`;
    const body = `Complaint #${complaint.complaintNo} (${formattedCategory}) passed SLA target of ${targetSlaHours}h (${roundedElapsed}h elapsed) with no action from Site Incharge. Immediate attention required.`;

    // Dispatch notifications in DB & Realtime
    await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: recipientUserIds.map((userId) => ({
          userId,
          type: 'SLA_BREACH_ESCALATION' as any,
          title,
          body,
          complaintId: complaint.id,
          data: {
            complaintId: complaint.id,
            complaintNo: complaint.complaintNo,
            category: complaint.category,
            slaHours: targetSlaHours,
            elapsedHours: roundedElapsed,
          },
        })),
      });

      await tx.complaint.update({
        where: { id: complaint.id },
        data: { lastSlaEscalatedAt: now },
      });
    });

    // Realtime notification broadcast
    for (const userId of recipientUserIds) {
      emitEventToUsers([userId], 'notification:new', {
        id: `notif-sla-${complaint.id}-${now.getTime()}`,
        userId,
        type: 'SLA_BREACH_ESCALATION',
        title,
        body,
        complaintId: complaint.id,
        createdAt: now.toISOString(),
        isRead: false,
      });
    }

    escalatedCount++;
    totalNotifiedUsers += recipientUserIds.length;

    logger.warn(
      {
        complaintNo: complaint.complaintNo,
        category: complaint.category,
        slaHours: targetSlaHours,
        elapsedHours: roundedElapsed,
        recipientsCount: recipientUserIds.length,
      },
      `SLA Breach Escalation triggered for ${complaint.complaintNo}`,
    );
  }

  return {
    checkedCount: openComplaints.length,
    escalatedCount,
    notifiedUserCount: totalNotifiedUsers,
  };
}
