import * as nativeBcrypt from '@node-rs/bcrypt';
import bcryptjs from 'bcryptjs';
import { logger } from './logger';

/** Work factor for PIN hashing. 12 is a sensible 2020s default for bcrypt. */
export const SALT_ROUNDS = 12;

/**
 * Native @node-rs/bcrypt implementation with fallback to bcryptjs
 * if USE_LEGACY_BCRYPT=true is explicitly set for rollback.
 * Note: Evaluated at module load time; changing requires process/container restart.
 */
const useLegacy = process.env.USE_LEGACY_BCRYPT === 'true';

export async function hashPin(pin: string): Promise<string> {
  if (!pin || typeof pin !== 'string') {
    throw new TypeError('PIN must be a non-empty string');
  }
  if (useLegacy) {
    return bcryptjs.hash(pin, SALT_ROUNDS);
  }
  try {
    return await nativeBcrypt.hash(pin, { cost: SALT_ROUNDS });
  } catch (err: unknown) {
    logger.error(
      {
        err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      },
      'Unexpected error during native bcrypt hashing',
    );
    throw err;
  }
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash || typeof pin !== 'string' || typeof hash !== 'string') {
    return false;
  }
  if (useLegacy) {
    return bcryptjs.compare(pin, hash);
  }
  try {
    return await nativeBcrypt.verify(pin, hash);
  } catch (err: unknown) {
    logger.error(
      {
        err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      },
      'Unexpected error during native bcrypt verification',
    );
    throw err;
  }
}

