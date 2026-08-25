import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { env } from '../config/env';
import { logger } from './logger';
import { prisma } from './prisma';

/** A push notification as this app sends them. `data` values must be strings (FCM rule). */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** FCM caps a multicast send at 500 tokens per request. */
const MULTICAST_CHUNK = 500;

/**
 * Error codes that mean "this token is dead, stop sending to it". Deliberately narrow:
 * `messaging/invalid-argument` is NOT included because it usually indicates a bad payload
 * on our side, and pruning on it would silently unsubscribe healthy devices.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let messaging: Messaging | null = null;

const rawServiceAccount = env.FIREBASE_SERVICE_ACCOUNT?.trim();
if (rawServiceAccount) {
  try {
    // Accept raw JSON or base64 — base64 is the practical choice in hosted env vars,
    // where the private_key's embedded newlines are painful to quote.
    const json = rawServiceAccount.startsWith('{')
      ? rawServiceAccount
      : Buffer.from(rawServiceAccount, 'base64').toString('utf8');
    // The service-account file is snake_case; cert() normalises it at runtime, so the
    // camelCase ServiceAccount type is a structural cast rather than a real mismatch.
    const credential: unknown = JSON.parse(json);
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(credential as ServiceAccount),
        projectId: env.FIREBASE_PROJECT_ID,
      });
    messaging = getMessaging(app);
  } catch (err) {
    // A malformed service account must not stop the API from booting — push degrades
    // to a no-op and the misconfiguration is loud in the logs.
    logger.error({ err }, 'FIREBASE_SERVICE_ACCOUNT is invalid — push notifications disabled');
    messaging = null;
  }
}

/** True only when firebase-admin actually initialised (creds present AND parseable). */
export const fcmEnabled = messaging !== null;

if (!fcmEnabled) {
  logger.warn('FCM is not configured — push notifications will be skipped');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Push to every device registered by the given users. Resolves silently when push is
 * disabled or nobody has a device — callers treat this as best-effort and never let a
 * rejection reach the request path (see lib/notify.ts).
 */
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  // Guard BEFORE touching the database: with push off there is nothing to look up.
  if (!messaging || userIds.length === 0) return;

  const rows = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  const tokens = rows.map((r) => r.token);
  if (tokens.length === 0) return;

  const dead: string[] = [];

  for (const batch of chunk(tokens, MULTICAST_CHUNK)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });

    response.responses.forEach((result, i) => {
      if (result.success) return;
      const token = batch[i];
      const code = result.error?.code;
      if (token && code && DEAD_TOKEN_CODES.has(code)) dead.push(token);
      else logger.warn({ code, err: result.error?.message }, 'FCM send failed for one device');
    });
  }

  if (dead.length > 0) {
    // Uninstalled/expired devices: drop them so the token table stays useful.
    const { count } = await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    logger.info({ count }, 'Pruned dead FCM device tokens');
  }
}
