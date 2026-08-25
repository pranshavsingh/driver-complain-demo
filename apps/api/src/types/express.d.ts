import type { Role } from '@driver-complaint/shared-types';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, set by the request-id middleware. */
      id?: string;
      /** Authenticated principal, set by the authenticate middleware. */
      user?: {
        id: string;
        role: Role;
        employeeId: string;
      };
    }
  }
}

export {};
