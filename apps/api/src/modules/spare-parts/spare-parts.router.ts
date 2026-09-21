import { Router } from 'express';
import multer, { MulterError } from 'multer';
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
import { validateUuidParam } from '../../middleware/validate';
import { ApiError } from '../../errors/api-error';

const rawSparePartsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'photo' && !file.mimetype.startsWith('image/')) {
      cb(ApiError.badRequest('Photo must be an image file (JPEG, PNG, WebP)'));
      return;
    }
    if (file.fieldname === 'voice' && !file.mimetype.startsWith('audio/')) {
      cb(ApiError.badRequest('Voice note must be an audio recording'));
      return;
    }
    cb(null, true);
  },
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'voice', maxCount: 1 },
]);

function sparePartsUpload(req: any, res: any, next: any) {
  rawSparePartsUpload(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest('Attached file exceeds the 25 MB limit'));
        return;
      }
      next(ApiError.badRequest(err.message));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

export const sparePartsRouter = Router();

sparePartsRouter.use(authenticate);

// Warehouse CRUD endpoints
sparePartsRouter.get('/warehouses', listWarehouses);
sparePartsRouter.post('/warehouses', requireRole('SUPER_ADMIN', 'ADMIN'), createWarehouse);
sparePartsRouter.patch('/warehouses/:id', validateUuidParam('id'), requireRole('SUPER_ADMIN', 'ADMIN'), updateWarehouse);
sparePartsRouter.delete('/warehouses/:id', validateUuidParam('id'), requireRole('SUPER_ADMIN', 'ADMIN'), deleteWarehouse);

// Spare Part Request endpoints
sparePartsRouter.post('/', sparePartsUpload, createRequest);
sparePartsRouter.get('/', listRequests);
sparePartsRouter.get('/stats', requireRole('SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'), getStats);
sparePartsRouter.get('/export', requireRole('SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'), exportXlsx);
sparePartsRouter.get('/:id', validateUuidParam('id'), getOne);
sparePartsRouter.patch('/:id/issue', validateUuidParam('id'), requireRole('SUPER_ADMIN', 'ADMIN'), approveAndIssue);
sparePartsRouter.patch('/:id/reject', validateUuidParam('id'), requireRole('SUPER_ADMIN', 'ADMIN'), rejectRequest);
