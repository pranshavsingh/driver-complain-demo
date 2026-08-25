import { z } from 'zod';
import { PlatformSchema } from './enums';

/**
 * A push device token registered by a client (FCM registration token). The same
 * physical device may re-register after a token refresh — the server upserts on
 * `token`, so clients can call this on every app start.
 */
export const RegisterDeviceTokenSchema = z.object({
  // FCM tokens are long opaque strings; cap generously rather than guess a format.
  token: z.string().min(1).max(4096),
  platform: PlatformSchema,
});
export type RegisterDeviceToken = z.infer<typeof RegisterDeviceTokenSchema>;

export const DeviceTokenPublicSchema = z.object({
  id: z.string(),
  userId: z.string(),
  token: z.string(),
  platform: PlatformSchema,
  createdAt: z.string(),
  lastUsedAt: z.string(),
});
export type DeviceTokenPublic = z.infer<typeof DeviceTokenPublicSchema>;
