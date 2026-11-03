import type { DriverListItem } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toDriverListItem } from '../../lib/serializers';
import {
  parsePagination,
  buildPaginationMetadata,
  type PaginationParams,
  type PaginatedResult,
} from '../../lib/pagination';

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
