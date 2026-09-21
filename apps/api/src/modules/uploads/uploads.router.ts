// Signed Upload Endpoint
// Allows mobile apps to upload files directly to Cloudinary, bypassing the API server.
// The API issues a short-lived signed URL; the client uploads the binary directly.

import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../../middleware/authenticate';
import { cloudinaryEnabled, cloudinaryFolder } from '../../lib/cloudinary';
import { ApiError } from '../../errors/api-error';
import { validate } from '../../middleware/validate';
import { SignUploadSchema } from '@driver-complaint/shared-types';

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);

/**
 * POST /api/v1/uploads/sign
 * Body: { folder?: string, resourceType?: 'image' | 'video' | 'raw' | 'auto' }
 *
 * Returns a signed upload URL + params. The client POSTs the file directly to
 * Cloudinary using these params, completely bypassing the API server.
 */
uploadsRouter.post('/sign', validate(SignUploadSchema), (req, res) => {
  if (!cloudinaryEnabled) {
    throw ApiError.badRequest('File uploads are not configured on this server');
  }

  const body = req.body as { folder?: string; resourceType?: 'image' | 'video' | 'raw' | 'auto' };
  
  // Enforce folder to remain within the app's designated Cloudinary workspace
  let targetFolder = `${cloudinaryFolder}/complaints`;
  if (body.folder) {
    const cleanFolder = body.folder.replace(/^\/+|\/+$/g, '');
    if (cleanFolder.startsWith(cloudinaryFolder)) {
      targetFolder = cleanFolder;
    } else {
      targetFolder = `${cloudinaryFolder}/${cleanFolder}`;
    }
  }

  const resourceType = body.resourceType === 'video' ? 'video' : 'image';
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    timestamp,
    folder: targetFolder,
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
