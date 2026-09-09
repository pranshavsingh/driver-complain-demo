import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import * as controller from './reports.controller';

export const reportsRouter = Router();

// Only ADMIN and SUPER_ADMIN can view and export full vehicle reports
reportsRouter.use(authenticate, requireRole('ADMIN', 'SUPER_ADMIN'));

reportsRouter.get('/fleet', (req, res, next) => {
  controller.listFleetSummary(req, res).catch(next);
});

reportsRouter.get('/vehicle', (req, res, next) => {
  controller.getVehicleReport(req, res).catch(next);
});

reportsRouter.get('/vehicle/export', (req, res, next) => {
  controller.exportVehicleReport(req, res).catch(next);
});
