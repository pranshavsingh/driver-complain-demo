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
import { logger } from './logger';

describe('password error handling (unexpected native runtime failures)', () => {
  it('propagates unexpected native hashing failures without swallowing', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    await expect(hashPin('2468')).rejects.toThrow('Simulated native binding allocation fault');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({
          message: 'Simulated native binding allocation fault',
        }),
      }),
      'Unexpected error during native bcrypt hashing',
    );
    // Ensure no pin was passed in log metadata
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('2468');
    errorSpy.mockRestore();
  });

  it('propagates unexpected native verification failures without converting to false', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const validFormatHash = '$2b$12$W/nqb.o3S7BuKx73YGPqNO9xbqO8tDyg0bV6I9JpwHnDD4t3wxb.C';
    await expect(
      verifyPin('2468', validFormatHash),
    ).rejects.toThrow('Simulated native worker runtime panic');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({
          message: 'Simulated native worker runtime panic',
        }),
      }),
      'Unexpected error during native bcrypt verification',
    );
    // Ensure neither pin nor hash was leaked into log metadata
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('2468');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(validFormatHash);
    errorSpy.mockRestore();
  });
});

