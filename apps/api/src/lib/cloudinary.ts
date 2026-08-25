import { Readable } from 'node:stream';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';
import { ApiError } from '../errors/api-error';

/** Uploads are only possible when all three credentials are present. */
export const cloudinaryEnabled = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** Per-environment folder: driver-complaint/{local,staging,prod}. */
export const cloudinaryFolder = env.CLOUDINARY_FOLDER;

/** Normalised result of a successful upload — maps onto a ComplaintAttachment row. */
export interface UploadedAsset {
  url: string;
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number | null;
  /** Runtime in whole seconds for audio/video. Null for images. */
  durationSec: number | null;
}

/**
 * Upload an in-memory file buffer to Cloudinary via its streaming API. Throws a
 * clear 400 when uploads are unconfigured, so a supplied file is never silently
 * dropped. Network call — keep it OUTSIDE any database transaction.
 *
 * `resourceType: 'video'` is correct for voice notes as well as clips: Cloudinary files
 * everything with a timeline under "video", and only that pipeline returns a duration.
 *
 * No explicit chunk size is passed — `upload_stream` already routes through
 * `upload_chunked_stream` at a 20 MB default, which covers our largest cap (25 MB video).
 */
export async function uploadBuffer(
  buffer: Buffer,
  opts: { folder?: string; resourceType?: 'image' | 'video' | 'raw' | 'auto' } = {},
): Promise<UploadedAsset> {
  if (!cloudinaryEnabled) {
    throw ApiError.badRequest('File uploads are not configured on this server');
  }

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: opts.folder ?? cloudinaryFolder, resource_type: opts.resourceType ?? 'image' },
      (error, res) => {
        if (error || !res) {
          reject(error instanceof Error ? error : new Error('Cloudinary upload failed'));
          return;
        }
        resolve(res);
      },
    );
    Readable.from(buffer).pipe(stream);
  });

  // `duration` falls under cloudinary's `[futureKey: string]: any` index signature rather than
  // its declared fields, so it is narrowed here instead of trusted. Fractional seconds are
  // rounded — the UI shows "0:12", not milliseconds.
  const rawDuration: unknown = result.duration;

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format ?? null,
    bytes: result.bytes ?? null,
    durationSec: typeof rawDuration === 'number' ? Math.round(rawDuration) : null,
  };
}

export { cloudinary };
