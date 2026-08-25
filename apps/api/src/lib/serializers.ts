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
  return {
    id: user.id,
    employeeId: user.employeeId,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? null,
    phone: user.phone ?? null,
    isActive: user.isActive,
    approvalStatus: (user as any).approvalStatus ?? 'APPROVED',
    category: (user as any).category ?? null,
    createdByAdminId: (user as any).createdByAdminId ?? null,
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

export function toVehiclePublic(vehicle: Vehicle): VehiclePublic {
  return {
    id: vehicle.id,
    driverId: vehicle.driverId,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    year: vehicle.year ?? null,
    vin: vehicle.vin ?? null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

export function toComplaintPublic(complaint: Complaint): ComplaintPublic {
  return {
    id: complaint.id,
    complaintNo: complaint.complaintNo,
    driverId: complaint.driverId,
    vehicleId: complaint.vehicleId ?? null,
    title: complaint.title,
    description: complaint.description,
    category: (complaint as any).category ?? 'SUPPORT',
    status: complaint.status,
    priority: complaint.priority,
    assignedToId: complaint.assignedToId ?? null,
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
};

export function toComplaintDetail(c: ComplaintDetailRow): ComplaintDetail {
  return {
    ...toComplaintPublic(c),
    attachments: c.attachments.map(toComplaintAttachmentPublic),
    updates: c.updates.map(toComplaintUpdatePublic),
    driver: {
      ...toPartySummary(c.driver.user),
      driverId: c.driver.id,
      licenseNumber: c.driver.licenseNumber,
    },
    vehicle: c.vehicle ? toVehiclePublic(c.vehicle) : null,
    assignedTo: c.assignedTo ? toPartySummary(c.assignedTo) : null,
  };
}
