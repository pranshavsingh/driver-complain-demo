import { z } from 'zod';

export const SignUploadSchema = z.object({
  folder: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_\-\/]+$/, 'Folder path contains invalid characters')
    .optional(),
  resourceType: z.enum(['image', 'video', 'raw', 'auto']).optional().default('image'),
});

export type SignUploadInput = z.infer<typeof SignUploadSchema>;

