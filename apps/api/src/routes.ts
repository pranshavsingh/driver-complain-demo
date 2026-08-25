import { Router } from 'express';
import { authRouter } from './modules/auth/auth.router';
import { usersRouter } from './modules/users/users.router';
import { driversRouter } from './modules/drivers/drivers.router';
import { vehiclesRouter } from './modules/vehicles/vehicles.router';
import { complaintsRouter } from './modules/complaints/complaints.router';
import { notificationsRouter } from './modules/notifications/notifications.router';
import { loadingRouter } from './modules/loading/loading.router';

/** All v1 routes, mounted by app.ts under /api/v1. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/drivers', driversRouter);
apiRouter.use('/vehicles', vehiclesRouter);
apiRouter.use('/complaints', complaintsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/loading', loadingRouter);

