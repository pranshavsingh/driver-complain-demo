import { Router } from 'express';
import {
  handleCreateFuelRecord,
  handleListFuelRecords,
  handleGetFuelStats,
  handleExportFuelCsv,
} from './fuel.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { createSingleFileUpload } from '../../middleware/upload';

const singleReceiptUpload = createSingleFileUpload({
  fieldName: 'receipt',
  maxBytes: 10 * 1024 * 1024,
  allowedMimePrefixes: ['image/', 'application/pdf'],
  errorMessage: 'Receipt must be an image (JPEG, PNG, WebP) or PDF document',
});

export const fuelRouter = Router();

fuelRouter.use(authenticate);

fuelRouter.post('/', singleReceiptUpload, handleCreateFuelRecord);
fuelRouter.get('/', handleListFuelRecords);
fuelRouter.get('/stats', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleGetFuelStats);
fuelRouter.get('/export-csv', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleExportFuelCsv);
