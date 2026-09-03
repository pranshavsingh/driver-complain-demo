import { z } from 'zod';

/** A non-empty entity id (uuid v7 strings in this system). */
export const IdSchema = z.string().min(1);

/** Standard list-endpoint query params. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Metadata attached to every paginated list response. */
export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/** Error payload carried inside a failed response envelope. */
export const ApiErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().nullable().optional(),
  requestId: z.string().optional(),
});
export type ApiErrorPayload = z.infer<typeof ApiErrorPayloadSchema>;

/** Failure envelope returned by every endpoint on error. */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ApiErrorPayloadSchema,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Success envelope: `{ success: true, data }`. Wrap any payload schema, e.g.
 * `apiSuccess(ComplaintPublicSchema)` or `apiSuccess(ListComplaintsResponseSchema)`.
 */
export function apiSuccess<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), data });
}
