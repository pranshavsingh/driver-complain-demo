import bcrypt from 'bcryptjs';

/** Work factor for PIN hashing. 12 is a sensible 2020s default for bcrypt. */
const SALT_ROUNDS = 12;

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
