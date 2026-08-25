import { z } from 'zod';

export const DriverPublicSchema = z.object({
  id: z.string(),
  userId: z.string(),
  licenseNumber: z.string(),
  licenseExpiry: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DriverPublic = z.infer<typeof DriverPublicSchema>;

/** Driver + user identity, flattened for admin list/filter dropdowns. */
export const DriverListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  employeeId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  licenseNumber: z.string(),
});
export type DriverListItem = z.infer<typeof DriverListItemSchema>;
