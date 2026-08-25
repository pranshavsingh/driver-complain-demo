import type { ComplaintEventPayload, RealtimeEvent } from '@driver-complaint/shared-types';
import { emitToUsers } from '../realtime/socket';
import { pushToUsers, type PushPayload } from './fcm';
import { logger } from './logger';

export interface DispatchInput {
  /** Recipients — the same users who just got a durable Notification row. */
  userIds: string[];
  event: RealtimeEvent;
  payload: ComplaintEventPayload;
  /** Omit to skip push (e.g. an event only the dashboard cares about). */
  push?: PushPayload;
}

/**
 * Fan one complaint event out to both delivery channels: Socket.IO (admin dashboard) and
 * FCM (mobile/web push).
 *
 * Fire-and-forget by design. Call this AFTER the transaction commits: the Notification rows
 * are the durable record, so a Socket.IO or FCM failure must never fail — or roll back —
 * the request that triggered it. Every error is swallowed into the log.
 */
export function dispatchComplaintEvent(input: DispatchInput): void {
  if (input.userIds.length === 0) return;

  try {
    emitToUsers(input.userIds, input.event, input.payload);
  } catch (err) {
    logger.error({ err, event: input.event }, 'Realtime emit failed');
  }

  if (input.push) {
    void pushToUsers(input.userIds, input.push).catch((err: unknown) => {
      logger.error({ err, event: input.event }, 'FCM push failed');
    });
  }
}
