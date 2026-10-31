import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getCategorySlaList } from '../settings/settings.service';
import { emitEventToUsers } from '../../realtime/socket';
import { tryAdvisoryXactLock, ADVISORY_LOCK_IDS } from '../../lib/advisory-lock';

function formatEnum(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface SlaEscalationResult {
  checkedCount: number;
  escalatedCount: number;
  notifiedUserCount: number;
  skipped?: boolean;
}

/**
 * Checks all open complaints against their Category SLA target durations.
 * Uses a PostgreSQL transaction-scoped advisory lock to guarantee only one replica
 * executes the escalation routine across the distributed cluster.
 *
 * Transaction safety rule:
 * ZERO external network calls (Socket.IO emits, FCM push, etc.) are executed
 * while holding the advisory lock. Notifications are dispatched only after the
 * transaction successfully commits.
 */
export async function checkAndEscalateSlaBreaches(): Promise<SlaEscalationResult> {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // 1. Fetch active category SLA settings outside the lock
  const categorySlas = await getCategorySlaList();
  const slaMap = new Map<string, number>(categorySlas.map((s) => [s.category, s.slaHours]));

  // 2. Execute lock acquisition and database updates inside short transaction
  const txResult = await prisma.$transaction(
    async (tx) => {
      // Acquire transaction-scoped advisory lock
      const acquired = await tryAdvisoryXactLock(tx, ADVISORY_LOCK_IDS.SLA_ESCALATION);
      if (!acquired) {
        logger.info('SLA escalation check skipped: lock held by another cluster instance');
        return null;
      }

      // Fetch all open complaints (NEW or IN_PROGRESS)
      const complaintClient = (tx as any).complaint?.findMany ? (tx as any).complaint : prisma.complaint;
      const openComplaints = await complaintClient.findMany({
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

      // Pre-fetch all active Category Admins & SuperAdmins
      const userClient = (tx as any).user?.findMany ? (tx as any).user : prisma.user;
      const adminsAndSuperAdmins: Array<{
        id: string;
        role: string;
        category: string | null;
        site: string | null;
      }> = await userClient.findMany({
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

      const notificationsToCreate: any[] = [];
      const escalatedComplaintIds: string[] = [];

      for (const complaint of openComplaints) {
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

        const recipientUserIds = Array.from(new Set([...categoryAdminIds, ...superAdminIds]));
        if (recipientUserIds.length === 0) continue;

        const formattedCategory = formatEnum(complaint.category);
        const roundedElapsed = Math.round(elapsedHours);

        const title = `🚨 SLA Breached: Action Required (${complaint.complaintNo})`;
        const body = `Complaint #${complaint.complaintNo} (${formattedCategory}) passed SLA target of ${targetSlaHours}h (${roundedElapsed}h elapsed) with no action from Site Incharge. Immediate attention required.`;

        escalatedComplaintIds.push(complaint.id);

        for (const userId of recipientUserIds) {
          notificationsToCreate.push({
            userId,
            type: 'SLA_BREACH_ESCALATION',
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

      const pendingEmits: { userId: string; payload: any }[] = [];

      // Batch DB writes inside the transaction
      if (notificationsToCreate.length > 0) {
        for (const n of notificationsToCreate) {
          const createdNotif = await tx.notification.create({ data: n });
          pendingEmits.push({
            userId: createdNotif.userId,
            payload: {
              id: createdNotif.id,
              userId: createdNotif.userId,
              type: createdNotif.type,
              title: createdNotif.title,
              body: createdNotif.body,
              complaintId: createdNotif.complaintId,
              createdAt: createdNotif.createdAt.toISOString(),
              isRead: createdNotif.isRead,
              data: createdNotif.data,
            },
          });
        }

        await tx.complaint.updateMany({
          where: { id: { in: escalatedComplaintIds } },
          data: { lastSlaEscalatedAt: now },
        });
      }

      return {
        checkedCount: openComplaints.length,
        escalatedCount,
        notifiedUserCount: totalNotifiedUsers,
        pendingEmits,
      };
    },
    { timeout: 10000 },
  );

  // If lock was not acquired, return clean skipped result
  if (!txResult) {
    return {
      checkedCount: 0,
      escalatedCount: 0,
      notifiedUserCount: 0,
      skipped: true,
    };
  }

  // 3. Dispatch realtime events OUTSIDE the transaction after commit
  for (const emit of txResult.pendingEmits) {
    emitEventToUsers([emit.userId], 'notification:new', emit.payload);
  }

  return {
    checkedCount: txResult.checkedCount,
    escalatedCount: txResult.escalatedCount,
    notifiedUserCount: txResult.notifiedUserCount,
  };
}
