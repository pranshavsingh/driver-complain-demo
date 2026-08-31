import { Router } from 'express';
import multer from 'multer';
import {
  handleReachedLoadingPoint,
  handleCompleteLoading,
  handleStartTrip,
  handleCompleteTrip,
  handleGetActiveLoading,
  handleListLoadingRecords,
  handleExportTrips,
  handleGetMonthlyTripSummaries,
  handleExportTripsCsv,
} from './loading.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const singlePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('photo');

export const loadingRouter = Router();

loadingRouter.use(authenticate);

// Driver endpoints
loadingRouter.post('/reached', singlePhotoUpload, handleReachedLoadingPoint);
loadingRouter.patch('/:id/complete', singlePhotoUpload, handleCompleteLoading);
loadingRouter.post('/complete', singlePhotoUpload, handleCompleteLoading);

loadingRouter.post('/:id/start-trip', handleStartTrip);
loadingRouter.post('/start-trip', handleStartTrip);

loadingRouter.patch('/:id/complete-trip', singlePhotoUpload, handleCompleteTrip);
loadingRouter.post('/complete-trip', singlePhotoUpload, handleCompleteTrip);

loadingRouter.get('/active', handleGetActiveLoading);

// Admin & Operations dashboard listing endpoint
loadingRouter.get('/monthly-summary', requireRole('ADMIN', 'SUPER_ADMIN'), handleGetMonthlyTripSummaries);
loadingRouter.get('/export-csv', requireRole('ADMIN', 'SUPER_ADMIN'), handleExportTripsCsv);
loadingRouter.get('/trips/export', requireRole('ADMIN', 'SUPER_ADMIN'), handleExportTrips);
loadingRouter.get('/trips', requireRole('ADMIN', 'SUPER_ADMIN'), handleListLoadingRecords);
loadingRouter.get('/', requireRole('ADMIN', 'SUPER_ADMIN'), handleListLoadingRecords);
