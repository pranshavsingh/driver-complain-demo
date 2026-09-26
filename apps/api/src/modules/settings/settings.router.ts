import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { UpdateCategorySlaSchema } from '@driver-complaint/shared-types';
import * as settingsController from './settings.controller';

export const settingsRouter = Router();

settingsRouter.get('/sla', authenticate, settingsController.getCategorySla);
settingsRouter.put(
  '/sla',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(UpdateCategorySlaSchema),
  settingsController.updateCategorySla,
);

