import { describe, it, expect, vi } from 'vitest';

vi.mock('@node-rs/bcrypt', () => ({
  hash: vi.fn(async () => {
    throw new Error('Simulated native binding allocation fault');
  }),
  verify: vi.fn(async () => {
    throw new Error('Simulated native worker runtime panic');
  }),
}));

import { hashPin, verifyPin } from './password';

describe('password error handling (unexpected native runtime failures)', () => {
  it('propagates unexpected native hashing failures without swallowing', async () => {
    await expect(hashPin('2468')).rejects.toThrow('Simulated native binding allocation fault');
  });

  it('propagates unexpected native verification failures without converting to false', async () => {
    await expect(
      verifyPin('2468', '$2b$12$somehashforerrorhandlingtest12345678901234567890123456'),
    ).rejects.toThrow('Simulated native worker runtime panic');
  });
});
