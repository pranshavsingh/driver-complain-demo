import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateUuidParam } from '../../middleware/validate';
import * as sitesController from './sites.controller';

export const sitesRouter = Router();

// All site routes require authentication
sitesRouter.use(authenticate);

// Listing sites is allowed for authenticated users (admins, executives, drivers for dropdowns)
sitesRouter.get('/', sitesController.list);
sitesRouter.get('/:id', validateUuidParam('id'), sitesController.getById);

// Site management (create, update, delete) is restricted to SUPER_ADMIN & ADMIN
sitesRouter.post('/', requireRole('SUPER_ADMIN', 'ADMIN'), sitesController.create);
sitesRouter.patch('/:id', validateUuidParam('id'), requireRole('SUPER_ADMIN', 'ADMIN'), sitesController.update);
sitesRouter.delete('/:id', validateUuidParam('id'), requireRole('SUPER_ADMIN', 'ADMIN'), sitesController.remove);
