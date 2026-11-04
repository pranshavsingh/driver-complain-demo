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

/**
 * Strict regex for valid $2a$ and $2b$ bcrypt hashes:
 * - Prefix: $2a$ or $2b$
 * - Cost: 2-digit integer from 04 to 31 (inclusive)
 * - Salt + checksum: exactly 53 characters from the bcrypt base64 alphabet (./0-9A-Za-z)
 * - Total length: exactly 60 characters
 */
const BCRYPT_HASH_REGEX = /^\$2[ab]\$(0[4-9]|[12][0-9]|3[01])\$[./0-9A-Za-z]{53}$/;

/**
 * Validates the complete structure of a bcrypt hash string before invoking verifiers.
 * Returns false for malformed, truncated, invalid length, invalid cost, or unsupported prefixes.
 */
export function isValidBcryptHash(hash: unknown): hash is string {
  return typeof hash === 'string' && hash.length === 60 && BCRYPT_HASH_REGEX.test(hash);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || typeof pin !== 'string') {
    return false;
  }
  if (!isValidBcryptHash(hash)) {
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

