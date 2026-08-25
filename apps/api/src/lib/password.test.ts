import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from './password';

describe('password', () => {
  it('hashes and verifies a PIN', async () => {
    const hash = await hashPin('2468');
    expect(hash).not.toBe('2468');
    expect(await verifyPin('2468', hash)).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const hash = await hashPin('2468');
    expect(await verifyPin('0000', hash)).toBe(false);
  });
});
