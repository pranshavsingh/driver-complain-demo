import { Router } from 'express';
import multer from 'multer';
import {
  handleCreateMaintenanceRecord,
  handleListMaintenanceRecords,
  handleGetMaintenanceStats,
  handleExportMaintenanceCsv,
} from './maintenance.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const singlePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('photo');

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate);

maintenanceRouter.post('/', singlePhotoUpload, handleCreateMaintenanceRecord);
maintenanceRouter.get('/', handleListMaintenanceRecords);
maintenanceRouter.get('/stats', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleGetMaintenanceStats);
maintenanceRouter.get('/export-csv', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleExportMaintenanceCsv);
