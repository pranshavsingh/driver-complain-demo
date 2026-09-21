import { Router } from 'express';
import {
  handleReachedLoadingPoint,
  handleCompleteLoading,
  handleStartTrip,
  handleCompleteTrip,
  handleCompleteUnloading,
  handleGetActiveLoading,
  handleListLoadingRecords,
  handleExportTrips,
  handleGetMonthlyTripSummaries,
  handleExportTripsCsv,
} from './loading.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { createSingleFileUpload } from '../../middleware/upload';
import { validateUuidParam } from '../../middleware/validate';

const singlePhotoUpload = createSingleFileUpload({
  fieldName: 'photo',
  maxBytes: 10 * 1024 * 1024,
  allowedMimePrefixes: ['image/'],
  errorMessage: 'Loading photo must be an image file (JPEG, PNG, WebP)',
});

export const loadingRouter = Router();

loadingRouter.use(authenticate);

// Driver endpoints
loadingRouter.post('/reached', singlePhotoUpload, handleReachedLoadingPoint);
loadingRouter.patch('/:id/complete', validateUuidParam('id'), singlePhotoUpload, handleCompleteLoading);
loadingRouter.post('/complete', singlePhotoUpload, handleCompleteLoading);

loadingRouter.post('/:id/start-trip', validateUuidParam('id'), handleStartTrip);
loadingRouter.post('/start-trip', handleStartTrip);

// "Reached unloading point" — ends transit, parks the record in UNLOADING.
loadingRouter.patch('/:id/complete-trip', validateUuidParam('id'), singlePhotoUpload, handleCompleteTrip);
loadingRouter.post('/complete-trip', singlePhotoUpload, handleCompleteTrip);

// "Unloading done" — closes the cycle out to TRIP_COMPLETED.
loadingRouter.patch('/:id/complete-unloading', validateUuidParam('id'), singlePhotoUpload, handleCompleteUnloading);
loadingRouter.post('/complete-unloading', singlePhotoUpload, handleCompleteUnloading);

loadingRouter.get('/active', handleGetActiveLoading);

// Admin & Operations dashboard listing endpoint
loadingRouter.get('/monthly-summary', requireRole('ADMIN', 'SUPER_ADMIN'), handleGetMonthlyTripSummaries);
loadingRouter.get('/export-csv', requireRole('ADMIN', 'SUPER_ADMIN'), handleExportTripsCsv);
loadingRouter.get('/trips/export', requireRole('ADMIN', 'SUPER_ADMIN'), handleExportTrips);
loadingRouter.get('/trips', requireRole('ADMIN', 'SUPER_ADMIN'), handleListLoadingRecords);
loadingRouter.get('/', requireRole('ADMIN', 'SUPER_ADMIN'), handleListLoadingRecords);
