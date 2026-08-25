import type { VehiclePublic } from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toVehiclePublic } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';

/** All vehicles, plate-ordered — feeds the admin filter dropdown. */
export async function list(): Promise<VehiclePublic[]> {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: 'asc' } });
  return vehicles.map(toVehiclePublic);
}

/** Vehicles assigned to the calling user's driver profile ("my vehicles"). */
export async function listForUser(userId: string): Promise<VehiclePublic[]> {
  const driver = await prisma.driver.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!driver) throw ApiError.badRequest('Your account has no driver profile');

  const vehicles = await prisma.vehicle.findMany({
    where: { driverId: driver.id },
    orderBy: { plateNumber: 'asc' },
  });
  return vehicles.map(toVehiclePublic);
}
