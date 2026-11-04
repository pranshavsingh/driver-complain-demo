import * as nativeBcrypt from '@node-rs/bcrypt';
import bcryptjs from 'bcryptjs';

/** Work factor for PIN hashing. 12 is a sensible 2020s default for bcrypt. */
export const SALT_ROUNDS = 12;

/**
 * Native @node-rs/bcrypt implementation with fallback to bcryptjs
 * if USE_LEGACY_BCRYPT=true is explicitly set for rollback.
 */
const useLegacy = process.env.USE_LEGACY_BCRYPT === 'true';

export function hashPin(pin: string): Promise<string> {
  if (useLegacy) {
    return bcryptjs.hash(pin, SALT_ROUNDS);
  }
  return nativeBcrypt.hash(pin, { cost: SALT_ROUNDS });
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
  } catch {
    return false;
  }
}
