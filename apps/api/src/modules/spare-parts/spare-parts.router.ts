import { Router } from 'express';
import multer from 'multer';
import {
  createRequest,
  listRequests,
  getOne,
  approveAndIssue,
  rejectRequest,
  getStats,
  exportXlsx,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from './spare-parts.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const sparePartsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'voice', maxCount: 1 },
]);

export const sparePartsRouter = Router();

sparePartsRouter.use(authenticate);

// Warehouse CRUD endpoints
sparePartsRouter.get('/warehouses', listWarehouses);
sparePartsRouter.post('/warehouses', requireRole('SUPER_ADMIN', 'ADMIN'), createWarehouse);
sparePartsRouter.patch('/warehouses/:id', requireRole('SUPER_ADMIN', 'ADMIN'), updateWarehouse);
sparePartsRouter.delete('/warehouses/:id', requireRole('SUPER_ADMIN', 'ADMIN'), deleteWarehouse);

// Spare Part Request endpoints
sparePartsRouter.post('/', sparePartsUpload, createRequest);
sparePartsRouter.get('/', listRequests);
sparePartsRouter.get('/stats', requireRole('SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'), getStats);
sparePartsRouter.get('/export', requireRole('SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'), exportXlsx);
sparePartsRouter.get('/:id', getOne);
sparePartsRouter.patch('/:id/issue', requireRole('SUPER_ADMIN', 'ADMIN'), approveAndIssue);
sparePartsRouter.patch('/:id/reject', requireRole('SUPER_ADMIN', 'ADMIN'), rejectRequest);

