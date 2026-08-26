import { Router } from 'express';
import {
  CreateComplaintSchema,
  UpdateComplaintStatusSchema,
  AssignComplaintSchema,
  ComplaintListQuerySchema,
  ComplaintExportQuerySchema,
} from '@driver-complaint/shared-types';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { uploadEvidence } from '../../middleware/upload';
import * as complaintsController from './complaints.controller';

export const complaintsRouter = Router();

// All complaint routes require authentication.
complaintsRouter.use(authenticate);

// Drivers file complaints; admins triage and manage them.
// uploadEvidence parses the optional multipart photo/voice/video fields before zod validates
// the text body.
complaintsRouter.post(
  '/',
  requireRole('DRIVER'),
  uploadEvidence,
  validate(CreateComplaintSchema),
  complaintsController.create,
);
complaintsRouter.get('/', validate(ComplaintListQuerySchema, 'query'), complaintsController.list);

// MUST precede '/:id' — otherwise "export" is captured as a complaint id.
complaintsRouter.get(
  '/export',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validate(ComplaintExportQuerySchema, 'query'),
  complaintsController.exportXlsx,
);

complaintsRouter.get('/:id', complaintsController.getOne);
complaintsRouter.patch(
  '/:id/status',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validate(UpdateComplaintStatusSchema),
  complaintsController.updateStatus,
);
complaintsRouter.post(
  '/:id/assign',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validate(AssignComplaintSchema),
  complaintsController.assign,
);
complaintsRouter.post(
  '/:id/accept-assignment',
  requireRole('SUPER_ADMIN'),
  complaintsController.acceptAssignment,
);
complaintsRouter.post(
  '/:id/reject-assignment',
  requireRole('SUPER_ADMIN'),
  complaintsController.rejectAssignment,
);
