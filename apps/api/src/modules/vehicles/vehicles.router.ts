import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import * as vehiclesController from './vehicles.controller';

export const vehiclesRouter = Router();

// All vehicle routes require authentication.
vehiclesRouter.use(authenticate);

// Driver: my assigned vehicles.
vehiclesRouter.get('/mine', vehiclesController.listMine);

// Admin: every vehicle (filter dropdown & management table).
vehiclesRouter.get('/', requireRole('ADMIN', 'SUPER_ADMIN'), vehiclesController.list);
vehiclesRouter.post('/', requireRole('ADMIN', 'SUPER_ADMIN'), vehiclesController.create);
vehiclesRouter.get('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), vehiclesController.getById);
vehiclesRouter.patch('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), vehiclesController.update);
vehiclesRouter.delete('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), vehiclesController.remove);
