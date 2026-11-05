import type { DriverListItem, DriverSummary } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toDriverListItem } from '../../lib/serializers';
import {
  parsePagination,
  buildPaginationMetadata,
  type PaginationParams,
  type PaginatedResult,
} from '../../lib/pagination';

export interface Actor {
  id: string;
  role: string;
}

/** Lightweight summary metrics for driver capacity and assignment */
export async function getSummary(actor?: Actor): Promise<DriverSummary> {
  const vehicleWhere: any = { driverId: { not: null } };
  const driverWhere: any = {};

  if (actor?.role === 'EXECUTIVE') {
    vehicleWhere.siteInchargeId = actor.id;
    driverWhere.vehicles = { some: { siteInchargeId: actor.id } };
  }

  const [total, assignedCount] = await Promise.all([
    prisma.driver.count({ where: driverWhere }),
    prisma.vehicle.count({ where: vehicleWhere }),
  ]);

  return {
    total,
    assignedCount,
    freeCount: Math.max(0, total - assignedCount),
  };
}

/** All drivers with their user identity — feeds the admin filter dropdown. */
export async function list(query?: PaginationParams): Promise<PaginatedResult<DriverListItem>> {
  const { page, pageSize, skip } = parsePagination(query);

  const [drivers, total] = await Promise.all([
    prisma.driver.findMany({
      include: { user: true },
      orderBy: [{ user: { firstName: 'asc' } }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.driver.count(),
  ]);

  const meta = buildPaginationMetadata(total, page, pageSize);

  return {
    data: drivers.map(toDriverListItem),
    meta,
  };
}
