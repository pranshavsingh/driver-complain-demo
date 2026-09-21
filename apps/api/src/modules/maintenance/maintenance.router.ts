import { Router } from 'express';
import {
  handleCreateMaintenanceRecord,
  handleListMaintenanceRecords,
  handleGetMaintenanceStats,
  handleExportMaintenanceCsv,
} from './maintenance.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { createSingleFileUpload } from '../../middleware/upload';

const singlePhotoUpload = createSingleFileUpload({
  fieldName: 'photo',
  maxBytes: 10 * 1024 * 1024,
  allowedMimePrefixes: ['image/'],
  errorMessage: 'Maintenance photo must be an image file (JPEG, PNG, WebP)',
});

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate);

maintenanceRouter.post('/', singlePhotoUpload, handleCreateMaintenanceRecord);
maintenanceRouter.get('/', handleListMaintenanceRecords);
maintenanceRouter.get('/stats', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleGetMaintenanceStats);
maintenanceRouter.get('/export-csv', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleExportMaintenanceCsv);
