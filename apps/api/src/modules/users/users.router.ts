import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import * as usersController from './users.controller';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, usersController.getMe);

usersRouter.get(
  '/admins',
  authenticate,
  requireRole('SUPER_ADMIN'),
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
  requireRole('SUPER_ADMIN'),
  usersController.approveUser,
);

usersRouter.post(
  '/:id/reject',
  authenticate,
  requireRole('SUPER_ADMIN'),
  usersController.rejectUser,
);

usersRouter.patch(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  usersController.updateUser,
);
