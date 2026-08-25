import { z } from 'zod';
import { ComplaintStatusSchema } from './enums';

/**
 * Server→client realtime (Socket.IO) event names. Shared so the API emitter and the
 * admin-web/mobile listeners can never drift on a string literal.
 *
 * Delivery model: events are best-effort live hints, NOT the source of truth. Every
 * event has a matching durable `Notification` row — a client that was offline catches
 * up via GET /api/v1/notifications.
 */
export const REALTIME_EVENTS = {
  complaintCreated: 'complaint:created',
  complaintStatusChanged: 'complaint:status-changed',
  complaintAssigned: 'complaint:assigned',
  loadingReached: 'loading:reached',
  loadingCompleted: 'loading:completed',
} as const;
export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/** Payload carried by every complaint realtime event — enough to refresh a list row or badge. */
export const ComplaintEventPayloadSchema = z.object({
  complaintId: z.string(),
  complaintNo: z.string(),
  title: z.string(),
  status: ComplaintStatusSchema,
  /** ISO timestamp the event was emitted. */
  at: z.string(),
});
export type ComplaintEventPayload = z.infer<typeof ComplaintEventPayloadSchema>;
