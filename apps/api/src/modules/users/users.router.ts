import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import * as usersController from './users.controller';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, usersController.getMe);

// SAFETY-CRITICAL: this is the only endpoint that enumerates staff identities. It must stay
// admin-gated — a driver who could list admins gains a target list for social engineering,
// and it is not needed by the mobile app.
usersRouter.get(
  '/admins',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  usersController.listAdmins,
);
