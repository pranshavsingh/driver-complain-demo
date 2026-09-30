import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateUuidParam } from '../../middleware/validate';
import * as vehiclesController from './vehicles.controller';

export const vehiclesRouter = Router();

// All vehicle routes require authentication.
vehiclesRouter.use(authenticate);

// Driver: my assigned vehicles.
vehiclesRouter.get('/mine', vehiclesController.listMine);

// Admin: every vehicle (filter dropdown & management table).
vehiclesRouter.get('/', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), vehiclesController.list);
vehiclesRouter.post('/', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), vehiclesController.create);
vehiclesRouter.get('/:id', validateUuidParam('id'), requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), vehiclesController.getById);
vehiclesRouter.patch('/:id', validateUuidParam('id'), requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), vehiclesController.update);
vehiclesRouter.delete('/:id', validateUuidParam('id'), requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), vehiclesController.remove);
