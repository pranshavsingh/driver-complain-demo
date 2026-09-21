import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateUuidParam } from '../../middleware/validate';
import * as usersController from './users.controller';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, usersController.getMe);

usersRouter.get(
  '/admins',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'),
  usersController.listAdmins,
);

usersRouter.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN'),
  usersController.createUser,
);

usersRouter.get(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN'),
  usersController.listUsers,
);

usersRouter.post(
  '/:id/approve',
  authenticate,
  validateUuidParam('id'),
  requireRole('SUPER_ADMIN'),
  usersController.approveUser,
);

usersRouter.post(
  '/:id/reject',
  authenticate,
  validateUuidParam('id'),
  requireRole('SUPER_ADMIN'),
  usersController.rejectUser,
);

usersRouter.patch(
  '/:id',
  authenticate,
  validateUuidParam('id'),
  requireRole('SUPER_ADMIN'),
  usersController.updateUser,
);
