import type { CategorySlaItem, UpdateCategorySla } from '@driver-complaint/shared-types';
import { COMPLAINT_CATEGORIES, type ComplaintCategory } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { emitToRoles } from '../../realtime/socket';
import { REALTIME_EVENTS } from '@driver-complaint/shared-types';

/** Default SLA durations in hours for categories requiring SLA */
const DEFAULT_SLA_HOURS: Record<string, number> = {
  BREAKDOWN: 2,
  MEDICAL_EMERGENCY: 2,
  TYRE_ISSUE: 4,
  FUEL_DEF: 4,
  LOADING: 12,
  UNLOADING: 12,
  VEHICLE_MAINTENANCE: 24,
  ACCOUNTS: 24,
};

/** Categories that do NOT require SLA */
export const EXCLUDED_SLA_CATEGORIES = new Set<string>(['SUPPORT', 'COMPLAINT_STATUS']);

/** Fetch all category SLA configurations from database with fallback defaults. */
export async function getCategorySlaList(): Promise<CategorySlaItem[]> {
  const records = await prisma.categorySla.findMany();
  const dbMap = new Map<string, { slaHours: number; updatedAt?: Date }>(
    records.map((r) => [r.category, { slaHours: r.slaHours, updatedAt: r.updatedAt }]),
  );

  const result: CategorySlaItem[] = [];

  for (const cat of COMPLAINT_CATEGORIES) {
    if (EXCLUDED_SLA_CATEGORIES.has(cat)) continue; // Skip SUPPORT & COMPLAINT_STATUS

    const dbRecord = dbMap.get(cat);
    const defaultHours = DEFAULT_SLA_HOURS[cat] ?? 12;

    result.push({
      category: cat as ComplaintCategory,
      slaHours: dbRecord?.slaHours ?? defaultHours,
      updatedAt: dbRecord?.updatedAt ? dbRecord.updatedAt.toISOString() : undefined,
    });
  }

  return result;
}

/** Update category SLA configurations (SuperAdmin only). */
export async function updateCategorySlaList(input: UpdateCategorySla): Promise<CategorySlaItem[]> {
  for (const item of input.slas) {
    if (EXCLUDED_SLA_CATEGORIES.has(item.category)) continue;

    await prisma.categorySla.upsert({
      where: { category: item.category as any },
      create: {
        category: item.category as any,
        slaHours: item.slaHours,
      },
      update: {
        slaHours: item.slaHours,
      },
    });
  }

  const updatedList = await getCategorySlaList();

  // Broadcast real-time update to all active admin/staff dashboards
  emitToRoles(['SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'], 'settings:sla-updated' as any, {
    slas: updatedList,
    at: new Date().toISOString(),
  });

  return updatedList;
}
