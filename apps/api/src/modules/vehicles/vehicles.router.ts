import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import * as vehiclesController from './vehicles.controller';

export const vehiclesRouter = Router();

// All vehicle routes require authentication.
vehiclesRouter.use(authenticate);

// Driver: my assigned vehicles.
vehiclesRouter.get('/mine', vehiclesController.listMine);
// Admin: every vehicle (filter dropdown).
vehiclesRouter.get('/', requireRole('ADMIN', 'SUPER_ADMIN'), vehiclesController.list);
