import { describe, it, expect } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from './tokens';

describe('tokens', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    // 32 random bytes → ~43 base64url chars.
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes deterministically and never returns the raw token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});
