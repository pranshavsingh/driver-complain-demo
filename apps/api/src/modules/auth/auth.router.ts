import { Router } from 'express';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
} from '@driver-complaint/shared-types';
import { validate } from '../../middleware/validate';
import { loginRateLimiter } from '../../middleware/rate-limit';
import * as authController from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, validate(LoginRequestSchema), authController.login);
authRouter.post('/refresh', validate(RefreshRequestSchema), authController.refresh);
authRouter.post('/logout', validate(LogoutRequestSchema), authController.logout);
