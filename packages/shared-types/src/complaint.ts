import { z } from 'zod';
import { AttachmentKindSchema, AssignmentStatusSchema, ComplaintCategorySchema, ComplaintStatusSchema, PrioritySchema } from './enums';
import { PaginationQuerySchema, PaginationMetaSchema } from './common';
import { VehiclePublicSchema } from './vehicle';

export const CreateComplaintSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1).max(5000),
  vehicleId: z.string().optional(),
  vehicleNumber: z.string().optional(),
  priority: PrioritySchema.optional(),
  category: ComplaintCategorySchema.optional(),
});
export type CreateComplaint = z.infer<typeof CreateComplaintSchema>;

export const UpdateComplaintStatusSchema = z.object({
  status: ComplaintStatusSchema,
  note: z.string().max(2000).optional(),
});
export type UpdateComplaintStatus = z.infer<typeof UpdateComplaintStatusSchema>;

export const AssignComplaintSchema = z.object({
  assignedToId: z.string(),
});
export type AssignComplaint = z.infer<typeof AssignComplaintSchema>;

export const RejectAssignmentSchema = z.object({
  note: z.string().max(2000).optional(),
});
export type RejectAssignment = z.infer<typeof RejectAssignmentSchema>;

export const ComplaintPublicSchema = z.object({
  id: z.string(),
  complaintNo: z.string(),
  driverId: z.string(),
  vehicleId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  transcription: z.string().nullable().optional(),
  category: ComplaintCategorySchema.optional(),
  status: ComplaintStatusSchema,
  priority: PrioritySchema,
  assignedToId: z.string().nullable().optional(),
  pendingAssigneeId: z.string().nullable().optional(),
  assignmentStatus: AssignmentStatusSchema.optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ComplaintPublic = z.infer<typeof ComplaintPublicSchema>;

/**
 * Filters shared by the complaint list and the Excel export — the two must stay identical,
 * so an admin's export always contains exactly the rows their filtered list showed.
 */
export const ComplaintFilterSchema = z.object({
  status: ComplaintStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  category: ComplaintCategorySchema.optional(),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  assignedToId: z.string().optional(),
  /** Inclusive lower/upper bounds on createdAt; accepts any parseable date string. */
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  /** Free-text across complaintNo / title / description. */
  search: z.string().max(200).optional(),
});
export type ComplaintFilter = z.infer<typeof ComplaintFilterSchema>;

/** Query params for the admin/driver complaint list (search + filter + paginate). */
export const ComplaintListQuerySchema = ComplaintFilterSchema.extend(PaginationQuerySchema.shape);
export type ComplaintListQuery = z.infer<typeof ComplaintListQuerySchema>;

/** Export takes the same filters but never paginates — the whole result set is written. */
export const ComplaintExportQuerySchema = ComplaintFilterSchema;
export type ComplaintExportQuery = z.infer<typeof ComplaintExportQuerySchema>;

/** Paginated list response. */
export const ListComplaintsResponseSchema = z.object({
  data: z.array(ComplaintPublicSchema),
  meta: PaginationMetaSchema,
});
export type ListComplaintsResponse = z.infer<typeof ListComplaintsResponseSchema>;

export const ComplaintAttachmentPublicSchema = z.object({
  id: z.string(),
  complaintId: z.string(),
  uploadedById: z.string(),
  kind: AttachmentKindSchema,
  url: z.string(),
  publicId: z.string(),
  resourceType: z.string(),
  format: z.string().nullable().optional(),
  bytes: z.number().int().nullable().optional(),
  /** Runtime of a voice note or video in seconds. Null for photos. */
  durationSec: z.number().int().nullable().optional(),
  originalName: z.string().nullable().optional(),
  transcription: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ComplaintAttachmentPublic = z.infer<typeof ComplaintAttachmentPublicSchema>;

/** A minimal user reference (assignee / author) for detail views. */
export const PartySummarySchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});
export type PartySummary = z.infer<typeof PartySummarySchema>;

/**
 * One timeline entry. `author` is embedded rather than left as a bare `authorId`, because
 * the timeline is the complaint's audit trail — "who changed this" has to be readable
 * without a second lookup, and a UUID on screen is not an answer.
 */
export const ComplaintUpdatePublicSchema = z.object({
  id: z.string(),
  complaintId: z.string(),
  authorId: z.string(),
  author: PartySummarySchema,
  fromStatus: ComplaintStatusSchema.nullable().optional(),
  toStatus: ComplaintStatusSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ComplaintUpdatePublic = z.infer<typeof ComplaintUpdatePublicSchema>;

/** The complaint's driver, flattened with the driver's user identity. */
export const ComplaintDriverSummarySchema = PartySummarySchema.extend({
  driverId: z.string(),
  licenseNumber: z.string(),
});
export type ComplaintDriverSummary = z.infer<typeof ComplaintDriverSummarySchema>;

/** Full complaint view for the detail screen: base fields + timeline + relations. */
export const ComplaintDetailSchema = ComplaintPublicSchema.extend({
  attachments: z.array(ComplaintAttachmentPublicSchema),
  updates: z.array(ComplaintUpdatePublicSchema),
  driver: ComplaintDriverSummarySchema,
  vehicle: VehiclePublicSchema.nullable(),
  assignedTo: PartySummarySchema.nullable(),
  pendingAssignee: PartySummarySchema.nullable().optional(),
});
export type ComplaintDetail = z.infer<typeof ComplaintDetailSchema>;
