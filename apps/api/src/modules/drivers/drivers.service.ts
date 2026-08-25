import type { DriverListItem } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toDriverListItem } from '../../lib/serializers';

/** All drivers with their user identity — feeds the admin filter dropdown. */
export async function list(): Promise<DriverListItem[]> {
  const drivers = await prisma.driver.findMany({
    include: { user: true },
    orderBy: { user: { firstName: 'asc' } },
  });
  return drivers.map(toDriverListItem);
}
