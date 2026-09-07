import { Router } from 'express';
import multer from 'multer';
import {
  handleCreateFuelRecord,
  handleListFuelRecords,
  handleGetFuelStats,
  handleExportFuelCsv,
} from './fuel.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const singleReceiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('receipt');

export const fuelRouter = Router();

fuelRouter.use(authenticate);

fuelRouter.post('/', singleReceiptUpload, handleCreateFuelRecord);
fuelRouter.get('/', handleListFuelRecords);
fuelRouter.get('/stats', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleGetFuelStats);
fuelRouter.get('/export-csv', requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'), handleExportFuelCsv);
