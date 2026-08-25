import { Router } from 'express';
import {
  NotificationListQuerySchema,
  RegisterDeviceTokenSchema,
} from '@driver-complaint/shared-types';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import * as notificationsController from './notifications.controller';

export const notificationsRouter = Router();

// A user only ever sees and mutates their own notifications — no role gate anywhere in
// this module; every service call is scoped by req.user.id.
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  validate(NotificationListQuerySchema, 'query'),
  notificationsController.list,
);

// Device-token registration for push. Static paths are declared before '/:id/...' so a
// token route can never be swallowed by the param route.
notificationsRouter.post(
  '/devices',
  validate(RegisterDeviceTokenSchema),
  notificationsController.registerDevice,
);
notificationsRouter.delete('/devices/:token', notificationsController.unregisterDevice);

notificationsRouter.post('/read-all', notificationsController.markAllRead);
notificationsRouter.patch('/:id/read', notificationsController.markRead);
