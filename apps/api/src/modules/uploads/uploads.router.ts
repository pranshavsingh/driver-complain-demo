// Signed Upload Endpoint
// Allows mobile apps to upload files directly to Cloudinary, bypassing the API server.
// The API issues a short-lived signed URL; the client uploads the binary directly.

import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../../middleware/authenticate';
import { cloudinaryEnabled, cloudinaryFolder } from '../../lib/cloudinary';
import { ApiError } from '../../errors/api-error';

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);

/**
 * POST /api/v1/uploads/sign
 * Body: { folder?: string, resourceType?: 'image' | 'video' }
 *
 * Returns a signed upload URL + params. The client POSTs the file directly to
 * Cloudinary using these params, completely bypassing the API server.
 */
uploadsRouter.post('/sign', (req, res) => {
  if (!cloudinaryEnabled) {
    throw ApiError.badRequest('File uploads are not configured on this server');
  }

  const body = req.body as { folder?: string; resourceType?: string } | undefined;
  const folder = body?.folder ?? `${cloudinaryFolder}/complaints`;
  const resourceType = body?.resourceType === 'video' ? 'video' : 'image';

  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder,
    resource_type: resourceType,
  };

  const signature = cloudinary.utils.api_sign_request(
    params,
    cloudinary.config().api_secret!,
  );

  res.json({
    success: true,
    data: {
      url: `https://api.cloudinary.com/v1_1/${cloudinary.config().cloud_name}/${resourceType}/upload`,
      params: {
        ...params,
        signature,
        api_key: cloudinary.config().api_key,
      },
    },
  });
});
