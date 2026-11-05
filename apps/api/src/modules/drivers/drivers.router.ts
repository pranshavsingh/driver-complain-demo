import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import * as driversController from './drivers.controller';

export const driversRouter = Router();

driversRouter.get('/summary', authenticate, requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), driversController.summary);
driversRouter.get('/', authenticate, requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), driversController.list);
