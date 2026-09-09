import type {
  VehicleFullReportResponse,
  VehicleReportQuery,
  VehicleReportSummary,
  VehicleReportTimelineItem,
  VehicleReportTripItem,
  VehicleReportComplaintItem,
  VehicleReportFuelItem,
  VehicleReportMaintenanceItem,
  FleetVehicleSummaryItem,
} from '@driver-complaint/shared-types';
import { prisma } from '../../lib/prisma';
import { toVehiclePublic } from '../../lib/serializers';
import { ApiError } from '../../errors/api-error';

export async function getVehicleReport(query: VehicleReportQuery): Promise<VehicleFullReportResponse> {
  const { vehicleId, dateFrom, dateTo } = query;

  // 1. Locate vehicle (either the requested one or the first available vehicle)
  let vehicle = null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        driver: {
          include: {
            user: true,
          },
        },
      },
    });
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle with id ${vehicleId} not found`);
    }
  } else {
    vehicle = await prisma.vehicle.findFirst({
      orderBy: { plateNumber: 'asc' },
      include: {
        driver: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  if (!vehicle) {
    return {
      vehicle: null,
      driver: null,
      summary: {
        totalTrips: 0,
        completedTrips: 0,
        totalLoadingWaitMinutes: 0,
        totalTripDurationMinutes: 0,
        totalUnloadingWaitMinutes: 0,
        totalComplaints: 0,
        breakdownCount: 0,
        tyreIssueCount: 0,
        fuelIssueCount: 0,
        totalFuelLtr: 0,
        totalFuelCost: 0,
        totalMaintenanceCost: 0,
      },
      timeline: [],
      trips: [],
      complaints: [],
      fuelRecords: [],
      maintenanceRecords: [],
    };
  }

  const driver = vehicle.driver;
  const driverUser = driver?.user;

  // Date filters
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from.getTime())) dateFilter.gte = from;
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!isNaN(to.getTime())) {
      // Set to end of day if only YYYY-MM-DD
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
  }

  const hasDateFilter = Boolean(dateFilter.gte || dateFilter.lte);

  // 2. Fetch Loading / Trip records for the vehicle's driver
  const loadingWhere: Record<string, unknown> = {
    driverId: driver.id,
  };
  if (hasDateFilter) {
    loadingWhere.reachedAt = dateFilter;
  }

  const rawTrips = await prisma.loadingRecord.findMany({
    where: loadingWhere,
    orderBy: { reachedAt: 'desc' },
  });

  // 3. Fetch Complaints for the vehicle or driver
  const complaintWhere: Record<string, unknown> = {
    OR: [
      { vehicleId: vehicle.id },
      { driverId: driver.id },
    ],
  };
  if (hasDateFilter) {
    complaintWhere.createdAt = dateFilter;
  }

  const rawComplaints = await prisma.complaint.findMany({
    where: complaintWhere,
    include: {
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // 4. Fetch Fuel Records for the vehicle
  const fuelWhere: Record<string, unknown> = {
    vehicleId: vehicle.id,
  };
  if (hasDateFilter) {
    fuelWhere.createdAt = dateFilter;
  }

  const rawFuel = await prisma.fuelRecord.findMany({
    where: fuelWhere,
    orderBy: { createdAt: 'desc' },
  });

  // 5. Fetch Maintenance Records for the vehicle
  const maintenanceWhere: Record<string, unknown> = {
    vehicleId: vehicle.id,
  };
  if (hasDateFilter) {
    maintenanceWhere.createdAt = dateFilter;
  }

  const rawMaintenance = await prisma.maintenanceRecord.findMany({
    where: maintenanceWhere,
    orderBy: { createdAt: 'desc' },
  });

  // Map trips
  const driverFullName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}`.trim() : 'Driver';
  const driverEmpId = driverUser?.employeeId ?? '';

  const trips: VehicleReportTripItem[] = rawTrips.map((t) => ({
    id: t.id,
    status: t.status,
    reachedAt: t.reachedAt.toISOString(),
    reachedAddress: t.reachedAddress,
    reachedPhotoUrl: t.reachedPhotoUrl,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    completedAddress: t.completedAddress,
    completedPhotoUrl: t.completedPhotoUrl,
    waitingTimeMinutes: t.waitingTimeMinutes,
    tripStartedAt: t.tripStartedAt ? t.tripStartedAt.toISOString() : null,
    tripStartAddress: t.tripStartAddress,
    tripCompletedAt: t.tripCompletedAt ? t.tripCompletedAt.toISOString() : null,
    tripCompletedAddress: t.tripCompletedAddress,
    tripCompletedPhotoUrl: t.tripCompletedPhotoUrl,
    tripDurationMinutes: t.tripDurationMinutes,
    unloadingCompletedAt: t.unloadingCompletedAt ? t.unloadingCompletedAt.toISOString() : null,
    unloadingAddress: t.unloadingAddress,
    unloadingPhotoUrl: t.unloadingPhotoUrl,
    unloadingDurationMinutes: t.unloadingDurationMinutes,
    driverName: driverFullName,
    driverEmployeeId: driverEmpId,
  }));

  // Map complaints
  const complaints: VehicleReportComplaintItem[] = rawComplaints.map((c) => {
    const photos = c.attachments
      .filter((a) => a.kind === 'PHOTO')
      .map((a) => a.url);
    const voiceAttachment = c.attachments.find((a) => a.kind === 'VOICE');

    return {
      id: c.id,
      complaintNo: c.complaintNo,
      category: c.category,
      title: c.title,
      description: c.description,
      status: c.status,
      priority: c.priority,
      driverName: driverFullName,
      driverEmployeeId: driverEmpId,
      createdAt: c.createdAt.toISOString(),
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      photoUrls: photos,
      voiceUrl: voiceAttachment?.url ?? null,
    };
  });

  // Map fuel
  const fuelRecords: VehicleReportFuelItem[] = rawFuel.map((f) => ({
    id: f.id,
    type: f.type,
    quantityLtr: f.quantityLtr,
    totalPrice: f.totalPrice,
    ratePerLtr: f.ratePerLtr,
    odometerKm: f.odometerKm,
    receiptUrl: f.receiptUrl,
    notes: f.notes,
    createdAt: f.createdAt.toISOString(),
    driverName: driverFullName,
  }));

  // Map maintenance
  const maintenanceRecords: VehicleReportMaintenanceItem[] = rawMaintenance.map((m) => ({
    id: m.id,
    type: m.type,
    itemNumber: m.itemNumber,
    quantity: m.quantity,
    brand: m.brand,
    position: m.position,
    cost: m.cost,
    odometerKm: m.odometerKm,
    photoUrl: m.photoUrl,
    notes: m.notes,
    createdAt: m.createdAt.toISOString(),
    driverName: driverFullName,
  }));

  // Calculate Summary
  let totalLoadingWaitMinutes = 0;
  let totalTripDurationMinutes = 0;
  let totalUnloadingWaitMinutes = 0;
  let completedTrips = 0;

  for (const t of rawTrips) {
    if (t.waitingTimeMinutes) totalLoadingWaitMinutes += t.waitingTimeMinutes;
    if (t.tripDurationMinutes) totalTripDurationMinutes += t.tripDurationMinutes;
    if (t.unloadingDurationMinutes) totalUnloadingWaitMinutes += t.unloadingDurationMinutes;
    if (t.status === 'TRIP_COMPLETED') completedTrips += 1;
  }

  let breakdownCount = 0;
  let tyreIssueCount = 0;
  let fuelIssueCount = 0;

  for (const c of rawComplaints) {
    if (c.category === 'BREAKDOWN') breakdownCount += 1;
    else if (c.category === 'TYRE_ISSUE') tyreIssueCount += 1;
    else if (c.category === 'FUEL_DEF') fuelIssueCount += 1;
  }

  const totalFuelLtr = rawFuel.reduce((sum, f) => sum + f.quantityLtr, 0);
  const totalFuelCost = rawFuel.reduce((sum, f) => sum + f.totalPrice, 0);
  const totalMaintenanceCost = rawMaintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0);

  const summary: VehicleReportSummary = {
    totalTrips: rawTrips.length,
    completedTrips,
    totalLoadingWaitMinutes,
    totalTripDurationMinutes,
    totalUnloadingWaitMinutes,
    totalComplaints: rawComplaints.length,
    breakdownCount,
    tyreIssueCount,
    fuelIssueCount,
    totalFuelLtr,
    totalFuelCost,
    totalMaintenanceCost,
  };

  // Build Unified Chronological Timeline
  const timeline: VehicleReportTimelineItem[] = [];

  for (const t of rawTrips) {
    timeline.push({
      id: `${t.id}-reached`,
      timestamp: t.reachedAt.toISOString(),
      eventType: 'LOADING_REACHED',
      title: 'Arrived at Loading Point',
      description: t.reachedAddress ? `Location: ${t.reachedAddress}` : 'Arrived at loading dock.',
      badgeText: 'Loading Start',
      badgeVariant: 'info',
      location: t.reachedAddress ?? undefined,
      photoUrl: t.reachedPhotoUrl,
    });

    if (t.completedAt) {
      timeline.push({
        id: `${t.id}-completed`,
        timestamp: t.completedAt.toISOString(),
        eventType: 'LOADING_COMPLETED',
        title: `Loading Completed (${t.waitingTimeMinutes ?? 0}m wait)`,
        description: t.completedAddress ? `Completed at: ${t.completedAddress}` : 'Loading operation finished.',
        badgeText: 'Loaded',
        badgeVariant: 'success',
        location: t.completedAddress ?? undefined,
        photoUrl: t.completedPhotoUrl,
      });
    }

    if (t.tripStartedAt) {
      timeline.push({
        id: `${t.id}-started`,
        timestamp: t.tripStartedAt.toISOString(),
        eventType: 'TRIP_STARTED',
        title: 'Trip Started / Journey Underway',
        description: t.tripStartAddress ? `Departed from: ${t.tripStartAddress}` : 'Vehicle en-route to destination.',
        badgeText: 'In Transit',
        badgeVariant: 'warning',
        location: t.tripStartAddress ?? undefined,
      });
    }

    if (t.tripCompletedAt) {
      timeline.push({
        id: `${t.id}-unloading-reached`,
        timestamp: t.tripCompletedAt.toISOString(),
        eventType: 'UNLOADING_REACHED',
        title: `Reached Destination (${t.tripDurationMinutes ?? 0}m transit)`,
        description: t.tripCompletedAddress ? `Destination: ${t.tripCompletedAddress}` : 'Arrived at unloading location.',
        badgeText: 'Unloading Point',
        badgeVariant: 'info',
        location: t.tripCompletedAddress ?? undefined,
        photoUrl: t.tripCompletedPhotoUrl,
      });
    }

    if (t.unloadingCompletedAt) {
      timeline.push({
        id: `${t.id}-unloading-completed`,
        timestamp: t.unloadingCompletedAt.toISOString(),
        eventType: 'UNLOADING_COMPLETED',
        title: `Trip Completed & Cargo Unloaded (${t.unloadingDurationMinutes ?? 0}m unload)`,
        description: t.unloadingAddress ? `Unloaded at: ${t.unloadingAddress}` : 'Full trip cycle completed.',
        badgeText: 'Trip Finished',
        badgeVariant: 'success',
        location: t.unloadingAddress ?? undefined,
        photoUrl: t.unloadingPhotoUrl,
      });
    }
  }

  for (const c of rawComplaints) {
    timeline.push({
      id: `${c.id}-created`,
      timestamp: c.createdAt.toISOString(),
      eventType: 'COMPLAINT_REPORTED',
      title: `Issue Reported: ${c.category} - ${c.title}`,
      description: c.description,
      badgeText: c.priority,
      badgeVariant: c.category === 'BREAKDOWN' ? 'danger' : 'warning',
      photoUrl: c.attachments.find((a) => a.kind === 'PHOTO')?.url,
      metadata: {
        complaintNo: c.complaintNo,
        category: c.category,
        priority: c.priority,
        status: c.status,
      },
    });

    if (c.resolvedAt) {
      timeline.push({
        id: `${c.id}-resolved`,
        timestamp: c.resolvedAt.toISOString(),
        eventType: 'COMPLAINT_RESOLVED',
        title: `Issue Resolved: ${c.complaintNo}`,
        description: `Status updated to ${c.status}.`,
        badgeText: 'Resolved',
        badgeVariant: 'success',
      });
    }
  }

  for (const f of rawFuel) {
    timeline.push({
      id: `${f.id}-fuel`,
      timestamp: f.createdAt.toISOString(),
      eventType: 'FUEL_LOGGED',
      title: `${f.type} Refill: ${f.quantityLtr} L (₹${f.totalPrice.toLocaleString()})`,
      description: f.notes || (f.odometerKm ? `Odometer: ${f.odometerKm} km` : undefined),
      badgeText: f.type,
      badgeVariant: 'default',
      photoUrl: f.receiptUrl,
    });
  }

  for (const m of rawMaintenance) {
    timeline.push({
      id: `${m.id}-maintenance`,
      timestamp: m.createdAt.toISOString(),
      eventType: 'MAINTENANCE_LOGGED',
      title: `${m.type} Service: ${m.brand || m.itemNumber} (Qty: ${m.quantity})`,
      description: m.notes || (m.cost ? `Cost: ₹${m.cost.toLocaleString()}` : undefined),
      badgeText: m.type,
      badgeVariant: 'default',
      photoUrl: m.photoUrl,
    });
  }

  // Sort timeline newest first
  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    vehicle: toVehiclePublic(vehicle),
    driver: driverUser
      ? {
          id: driver.id,
          userId: driverUser.id,
          employeeId: driverUser.employeeId,
          firstName: driverUser.firstName,
          lastName: driverUser.lastName,
          licenseNumber: driver.licenseNumber,
        }
      : null,
    summary,
    timeline,
    trips,
    complaints,
    fuelRecords,
    maintenanceRecords,
  };
}

/** Lists all fleet vehicles with high-level operational counts & stats for the master table view. */
export async function listFleetVehiclesSummary(): Promise<FleetVehicleSummaryItem[]> {
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { plateNumber: 'asc' },
    include: {
      driver: {
        include: {
          user: true,
          loadingRecords: {
            orderBy: { reachedAt: 'desc' },
          },
        },
      },
      complaints: true,
      fuelRecords: true,
      maintenanceRecords: true,
    },
  });

  return vehicles.map((v) => {
    const driverUser = v.driver?.user;
    const loadingRecords = v.driver?.loadingRecords ?? [];
    const completedTrips = loadingRecords.filter((r) => r.status === 'TRIP_COMPLETED').length;
    const activeTrip = loadingRecords.find((r) => r.status !== 'TRIP_COMPLETED');
    const breakdownCount = v.complaints.filter((c) => c.category === 'BREAKDOWN').length;
    const totalFuelCost = v.fuelRecords.reduce((sum, f) => sum + f.totalPrice, 0);
    const totalMaintenanceCost = v.maintenanceRecords.reduce((sum, m) => sum + (m.cost ?? 0), 0);

    return {
      id: v.id,
      plateNumber: v.plateNumber,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      vin: v.vin ?? null,
      driverName: driverUser ? `${driverUser.firstName} ${driverUser.lastName}`.trim() : 'Unassigned',
      driverEmployeeId: driverUser?.employeeId ?? 'N/A',
      driverLicenseNumber: v.driver?.licenseNumber ?? 'N/A',
      totalTrips: loadingRecords.length,
      completedTrips,
      activeTripStatus: activeTrip?.status ?? null,
      totalComplaints: v.complaints.length,
      breakdownCount,
      totalFuelCost,
      totalMaintenanceCost,
      createdAt: v.createdAt.toISOString(),
    };
  });
}
