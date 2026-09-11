import type {
  User,
  Driver,
  Vehicle,
  Complaint,
  ComplaintAttachment,
  ComplaintUpdate,
  Notification,
  DeviceToken,
} from '@prisma/client';
import type {
  UserPublic,
  AdminSummary,
  DriverPublic,
  DriverListItem,
  VehiclePublic,
  ComplaintPublic,
  ComplaintAttachmentPublic,
  ComplaintUpdatePublic,
  ComplaintDetail,
  NotificationPublic,
  DeviceTokenPublic,
  PartySummary,
  ApprovalStatus,
} from '@driver-complaint/shared-types';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** A minimal identity reference — timeline authors, assignees. Never leaks pinHash. */
export function toPartySummary(user: User): PartySummary {
  return {
    id: user.id,
    employeeId: user.employeeId,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/** An admin for the dashboard's assignee dropdown (role included so the UI can label it). */
export function toAdminSummary(user: User): AdminSummary {
  return { ...toPartySummary(user), role: user.role, category: user.category ?? null };
}

export function toUserPublic(user: User): UserPublic {
  const u = user as User & {
    approvalStatus?: ApprovalStatus;
    category?: string | null;
    createdByAdminId?: string | null;
  };
  return {
    id: user.id,
    employeeId: user.employeeId,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? null,
    phone: user.phone ?? null,
    isActive: user.isActive,
    approvalStatus: u.approvalStatus ?? 'APPROVED',
    category: (u.category as UserPublic['category']) ?? null,
    createdByAdminId: u.createdByAdminId ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toDriverPublic(driver: Driver): DriverPublic {
  return {
    id: driver.id,
    userId: driver.userId,
    licenseNumber: driver.licenseNumber,
    licenseExpiry: iso(driver.licenseExpiry),
    createdAt: driver.createdAt.toISOString(),
    updatedAt: driver.updatedAt.toISOString(),
  };
}

/** Driver flattened with its user identity, for admin list/filter dropdowns. */
export function toDriverListItem(driver: Driver & { user: User }): DriverListItem {
  return {
    id: driver.id,
    userId: driver.userId,
    employeeId: driver.user.employeeId,
    firstName: driver.user.firstName,
    lastName: driver.user.lastName,
    licenseNumber: driver.licenseNumber,
  };
}

export function toVehiclePublic(
  vehicle: Vehicle & {
    driver?: (Driver & { user?: User }) | null;
  },
): VehiclePublic {
  const v = vehicle as Vehicle & {
    modelNumber?: string | null;
    registrationDate?: Date | null;
    chassisNumber?: string | null;
    wheels?: string | null;
    agreementStatus?: string | null;
    driver?: (Driver & { user?: { firstName: string; lastName: string } }) | null;
  };
  const driverName = v.driver?.user
    ? `${v.driver.user.firstName} ${v.driver.user.lastName}`.trim()
    : null;

  return {
    id: vehicle.id,
    driverId: vehicle.driverId ?? null,
    driverName,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    modelNumber: v.modelNumber ?? null,
    registrationDate: iso(v.registrationDate),
    chassisNumber: v.chassisNumber ?? null,
    wheels: v.wheels ?? null,
    agreementStatus: v.agreementStatus ?? 'ACTIVE',
    year: vehicle.year ?? null,
    vin: vehicle.vin ?? null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

export function toComplaintPublic(complaint: Complaint & {
  driver?: (Driver & { user?: User }) | null;
  vehicle?: Vehicle | null;
  assignedTo?: User | null;
  loadingRecords?: any[];
  _count?: { updates?: number };
}): ComplaintPublic {
  const c = complaint as Complaint & {
    transcription?: string | null;
    category?: ComplaintPublic['category'];
    pendingAssigneeId?: string | null;
    assignmentStatus?: ComplaintPublic['assignmentStatus'];
    driver?: (Driver & { user?: User }) | null;
    vehicle?: Vehicle | null;
    assignedTo?: User | null;
    loadingRecords?: any[];
    _count?: { updates?: number };
  };

  const driverUser = c.driver?.user;
  const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}`.trim() : null;
  const driverPhone = driverUser?.phone ?? null;
  const driverEmployeeId = driverUser?.employeeId ?? null;

  // Determine trip phase and loading context from associated loading records
  const latestLoading = c.loadingRecords && c.loadingRecords.length > 0 ? c.loadingRecords[0] : null;

  const driverVehicles = (c.driver as any)?.vehicles;
  const fallbackVehicle = driverVehicles && driverVehicles.length > 0 ? driverVehicles[0] : null;

  const vehiclePlateNumber = c.vehicle?.plateNumber ?? fallbackVehicle?.plateNumber ?? latestLoading?.vehicleNumber ?? null;
  const vehicleModel = c.vehicle?.model ?? fallbackVehicle?.model ?? null;

  const assignedToName = c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}`.trim() : null;
  const updatesCount = c._count?.updates ?? 0;

  let tripPhase: ComplaintPublic['tripPhase'] = null;
  let loadingStatus: ComplaintPublic['loadingStatus'] = null;
  let loadingRecordId: string | null = null;
  let tripLocationName: string | null = null;

  if (latestLoading) {
    loadingRecordId = latestLoading.id;
    loadingStatus = latestLoading.status;
    tripLocationName = latestLoading.locationName || latestLoading.reachedAddress || latestLoading.completedAddress || latestLoading.tripStartAddress || null;

    if (latestLoading.status === 'REACHED' || latestLoading.status === 'COMPLETED') {
      tripPhase = 'AT_LOADING_PLANT';
    } else if (latestLoading.status === 'TRIP_STARTED') {
      tripPhase = 'IN_TRANSIT';
    } else if (latestLoading.status === 'UNLOADING') {
      tripPhase = 'AT_UNLOADING_POINT';
    } else {
      tripPhase = 'YARD_IDLE';
    }
  }

  // Needs action = NEW complaint with no assignee OR no admin updates yet
  const needsAction = complaint.status === 'NEW' && (!complaint.assignedToId || updatesCount <= 1);

  return {
    id: complaint.id,
    complaintNo: complaint.complaintNo,
    driverId: complaint.driverId,
    driverName,
    driverPhone,
    driverEmployeeId,
    vehicleId: complaint.vehicleId ?? null,
    vehiclePlateNumber,
    vehicleModel,
    title: complaint.title,
    description: complaint.description,
    transcription: c.transcription ?? null,
    category: c.category ?? 'SUPPORT',
    status: complaint.status,
    priority: complaint.priority,
    tripPhase,
    loadingStatus,
    loadingRecordId,
    tripLocationName,
    needsAction,
    updatesCount,
    assignedToId: complaint.assignedToId ?? null,
    assignedToName,
    pendingAssigneeId: c.pendingAssigneeId ?? null,
    assignmentStatus: c.assignmentStatus ?? 'NONE',
    resolvedAt: iso(complaint.resolvedAt),
    createdAt: complaint.createdAt.toISOString(),
    updatedAt: complaint.updatedAt.toISOString(),
  };
}

export function toNotificationPublic(notification: Notification): NotificationPublic {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data ?? null,
    complaintId: notification.complaintId ?? null,
    isRead: notification.isRead,
    readAt: iso(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
}

/** A registered push device. The raw token is echoed back so a client can confirm what it stored. */
export function toDeviceTokenPublic(t: DeviceToken): DeviceTokenPublic {
  return {
    id: t.id,
    userId: t.userId,
    token: t.token,
    platform: t.platform,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt.toISOString(),
  };
}

export function toComplaintAttachmentPublic(a: ComplaintAttachment): ComplaintAttachmentPublic {
  const att = a as ComplaintAttachment & { transcription?: string | null };
  return {
    id: a.id,
    complaintId: a.complaintId,
    uploadedById: a.uploadedById,
    kind: a.kind,
    url: a.url,
    publicId: a.publicId,
    resourceType: a.resourceType,
    format: a.format ?? null,
    bytes: a.bytes ?? null,
    durationSec: a.durationSec ?? null,
    originalName: a.originalName ?? null,
    transcription: att.transcription ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toComplaintUpdatePublic(
  u: ComplaintUpdate & { author: User },
): ComplaintUpdatePublic {
  return {
    id: u.id,
    complaintId: u.complaintId,
    authorId: u.authorId,
    author: toPartySummary(u.author),
    fromStatus: u.fromStatus ?? null,
    toStatus: u.toStatus ?? null,
    note: u.note ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Shape returned by the complaint-detail query (base row + eager relations). */
type ComplaintDetailRow = Complaint & {
  attachments: ComplaintAttachment[];
  updates: (ComplaintUpdate & { author: User })[];
  driver: Driver & { user: User };
  vehicle: Vehicle | null;
  assignedTo: User | null;
  pendingAssignee?: User | null;
};

export function toComplaintDetail(c: ComplaintDetailRow): ComplaintDetail {
  const driverVehicles = (c.driver as any)?.vehicles;
  const fallbackVehicle = driverVehicles && driverVehicles.length > 0 ? driverVehicles[0] : null;

  return {
    ...toComplaintPublic(c),
    attachments: c.attachments.map(toComplaintAttachmentPublic),
    updates: c.updates.map(toComplaintUpdatePublic),
    driver: {
      ...toPartySummary(c.driver.user),
      driverId: c.driver.id,
      licenseNumber: c.driver.licenseNumber,
    },
    vehicle: c.vehicle ? toVehiclePublic(c.vehicle) : fallbackVehicle ? toVehiclePublic(fallbackVehicle) : null,
    assignedTo: c.assignedTo ? toPartySummary(c.assignedTo) : null,
    pendingAssignee: c.pendingAssignee ? toPartySummary(c.pendingAssignee) : null,
  };
}
