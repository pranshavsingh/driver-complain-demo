import { describe, it, expect } from 'vitest';
import bcryptjs from 'bcryptjs';
import { hashPin, verifyPin, SALT_ROUNDS } from './password';

describe('password library (@node-rs/bcrypt native implementation)', () => {
  const TEST_PIN = '2468';
  const WRONG_PIN = '0000';

  // 1. Hash then verify
  describe('hash then verify', () => {
    it('hashes and verifies a PIN with cost 12', async () => {
      const hash = await hashPin(TEST_PIN);
      expect(hash).not.toBe(TEST_PIN);
      expect(hash).toMatch(/^\$2[ab]\$12\$/);
      expect(await verifyPin(TEST_PIN, hash)).toBe(true);
    });

    it('produces unique salts on consecutive calls for identical PINs', async () => {
      const hash1 = await hashPin(TEST_PIN);
      const hash2 = await hashPin(TEST_PIN);
      expect(hash1).not.toBe(hash2);
      expect(await verifyPin(TEST_PIN, hash1)).toBe(true);
      expect(await verifyPin(TEST_PIN, hash2)).toBe(true);
    });

    it('exports expected SALT_ROUNDS constant equal to 12', () => {
      expect(SALT_ROUNDS).toBe(12);
    });
  });

  // 2. Correct and incorrect credentials
  describe('credential matching', () => {
    it('accepts correct credentials across diverse inputs', async () => {
      const inputs = ['1234', '987654', 'AlphaNumeric#2026', 'complex-p@ssw0rd!'];
      for (const input of inputs) {
        const hash = await hashPin(input);
        expect(await verifyPin(input, hash)).toBe(true);
        expect(await verifyPin(`${input}-wrong`, hash)).toBe(false);
      }
    });

    it('rejects an incorrect PIN', async () => {
      const hash = await hashPin(TEST_PIN);
      expect(await verifyPin(WRONG_PIN, hash)).toBe(false);
    });

    it('distinguishes case sensitivity in alphanumeric passwords', async () => {
      const hash = await hashPin('SecretCode');
      expect(await verifyPin('SecretCode', hash)).toBe(true);
      expect(await verifyPin('secretcode', hash)).toBe(false);
    });
  });

  // 3. Fixed Legacy $2a$ and $2b$ Hash Fixtures (Independently Generated)
  describe('fixed legacy hash compatibility ($2a$ and $2b$)', () => {
    const FIXED_FIXTURES = [
      {
        pin: '1234',
        cost: 10,
        hash2a: '$2a$10$fTqExCq3RD7iGKZs0hSGt.9k9GypE0lLivlh0rrBruHGq6Ad3UC1W',
        hash2b: '$2b$10$fTqExCq3RD7iGKZs0hSGt.9k9GypE0lLivlh0rrBruHGq6Ad3UC1W',
      },
      {
        pin: '987654',
        cost: 10,
        hash2a: '$2a$10$RTcZbpDjldJCf7eR3NpU8OhkYEQieacqYFYSNDEL/3S0GmD2Eq3.G',
        hash2b: '$2b$10$RTcZbpDjldJCf7eR3NpU8OhkYEQieacqYFYSNDEL/3S0GmD2Eq3.G',
      },
      {
        pin: 'admin-PIN-2026!',
        cost: 12,
        hash2a: '$2a$12$W/nqb.o3S7BuKx73YGPqNO9xbqO8tDyg0bV6I9JpwHnDD4t3wxb.C',
        hash2b: '$2b$12$W/nqb.o3S7BuKx73YGPqNO9xbqO8tDyg0bV6I9JpwHnDD4t3wxb.C',
      },
    ];

    it.each(FIXED_FIXTURES)(
      'verifies fixed $2a$ fixture for PIN "$pin" (cost $cost)',
      async ({ pin, hash2a }) => {
        expect(hash2a.startsWith('$2a$')).toBe(true);
        expect(await verifyPin(pin, hash2a)).toBe(true);
        expect(await verifyPin('wrong-' + pin, hash2a)).toBe(false);
      },
    );

    it.each(FIXED_FIXTURES)(
      'verifies fixed $2b$ fixture for PIN "$pin" (cost $cost)',
      async ({ pin, hash2b }) => {
        expect(hash2b.startsWith('$2b$')).toBe(true);
        expect(await verifyPin(pin, hash2b)).toBe(true);
        expect(await verifyPin('wrong-' + pin, hash2b)).toBe(false);
      },
    );

    it('verifies dynamic legacy $2a$ format hash correctly', async () => {
      const salt2a = bcryptjs.genSaltSync(10).replace('$2b$', '$2a$');
      const legacy2aHash = await bcryptjs.hash('legacy-driver-pin-7890', salt2a);
      expect(legacy2aHash.startsWith('$2a$')).toBe(true);

      const isVerified = await verifyPin('legacy-driver-pin-7890', legacy2aHash);
      expect(isVerified).toBe(true);

      const wrongPinVerified = await verifyPin('wrong-legacy-pin', legacy2aHash);
      expect(wrongPinVerified).toBe(false);
    });

    it('verifies dynamic legacy $2b$ format hash correctly', async () => {
      const salt2b = bcryptjs.genSaltSync(10);
      const legacy2bHash = await bcryptjs.hash('test-pin-4321', salt2b);
      expect(legacy2bHash.startsWith('$2b$')).toBe(true);

      const isVerified = await verifyPin('test-pin-4321', legacy2bHash);
      expect(isVerified).toBe(true);

      const wrongPinVerified = await verifyPin('wrong-pin', legacy2bHash);
      expect(wrongPinVerified).toBe(false);
    });
  });

  // 5. Invalid and malformed hashes
  describe('invalid and malformed hash handling', () => {
    it('returns false for arbitrary non-bcrypt strings without throwing', async () => {
      expect(await verifyPin('2468', 'plain-text-not-a-hash')).toBe(false);
      expect(await verifyPin('2468', '123456')).toBe(false);
      expect(await verifyPin('2468', '$2b$12$truncated')).toBe(false);
      expect(await verifyPin('2468', '$99$99$nonexistentprefix')).toBe(false);
    });

    it('returns false for empty string hash', async () => {
      expect(await verifyPin('2468', '')).toBe(false);
    });

    it('returns false for whitespace-only hash', async () => {
      expect(await verifyPin('2468', '   ')).toBe(false);
    });
  });

  // 6. Concurrent hash and verify operations
  describe('concurrency', () => {
    it('handles concurrent hash and verify operations consistently', async () => {
      const items = Array.from({ length: 20 }, (_, i) => `pin-${i}`);
      const hashes = await Promise.all(items.map((pin) => hashPin(pin)));

      const verifications = await Promise.all(
        items.map((pin, i) => verifyPin(pin, hashes[i]!)),
      );
      expect(verifications.every((v) => v === true)).toBe(true);

      // Verify cross-check (each pin against next hash should fail)
      const crossVerifications = await Promise.all(
        items.map((pin, i) => verifyPin(pin, hashes[(i + 1) % items.length]!)),
      );
      expect(crossVerifications.every((v) => v === false)).toBe(true);
    });
  });

  // 7. Authentication API compatibility
  describe('cross-engine compatibility (bcryptjs <-> native)', () => {
    it('native hash can be verified by bcryptjs (ensures smooth rollback)', async () => {
      const nativeHash = await hashPin('cross-engine-pin');
      const bcryptjsVerified = await bcryptjs.compare('cross-engine-pin', nativeHash);
      expect(bcryptjsVerified).toBe(true);

      const bcryptjsRejectedWrong = await bcryptjs.compare('wrong-pin', nativeHash);
      expect(bcryptjsRejectedWrong).toBe(false);
    });

    it('bcryptjs hash can be verified by verifyPin (ensures zero user disruption)', async () => {
      const jsHash = await bcryptjs.hash('user-existing-pin', 12);
      const verified = await verifyPin('user-existing-pin', jsHash);
      expect(verified).toBe(true);

      const rejectedWrong = await verifyPin('bad-attempt', jsHash);
      expect(rejectedWrong).toBe(false);
    });
  });

  // 8. Error handling
  describe('robust error handling', () => {
    it('returns false when pin is null, undefined, or empty without crashing', async () => {
      const validHash = await hashPin('2468');
      expect(await verifyPin(null as unknown as string, validHash)).toBe(false);
      expect(await verifyPin(undefined as unknown as string, validHash)).toBe(false);
      expect(await verifyPin('', validHash)).toBe(false);
    });

    it('returns false when hash is null or undefined without crashing', async () => {
      expect(await verifyPin('2468', null as unknown as string)).toBe(false);
      expect(await verifyPin('2468', undefined as unknown as string)).toBe(false);
    });

    it('rejects hashPin when passed invalid non-string argument', async () => {
      await expect(hashPin(null as unknown as string)).rejects.toThrow();
      await expect(hashPin(undefined as unknown as string)).rejects.toThrow();
    });
  });
});
