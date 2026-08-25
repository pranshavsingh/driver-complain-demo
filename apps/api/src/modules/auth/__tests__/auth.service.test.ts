import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { login, refresh } from '../auth.service';

// Self-contained integration test — requires a migrated database (docker compose up -d db).
const EMP = 'ETEST01';
const PIN = '1357';

async function clearTokens(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { employeeId: EMP } });
  if (!user) return;
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

beforeAll(async () => {
  const pinHash = await hashPin(PIN);
  await prisma.user.upsert({
    where: { employeeId: EMP },
    update: { pinHash, isActive: true, failedLoginAttempts: 0, lockedUntil: null },
    create: { employeeId: EMP, pinHash, role: 'DRIVER', firstName: 'Test', lastName: 'User' },
  });
});

beforeEach(clearTokens);

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { employeeId: EMP } });
  if (user) {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe('auth.service', () => {
  it('logs in with valid credentials and returns a token pair', async () => {
    const res = await login(EMP, PIN, {});
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.expiresIn).toBeGreaterThan(0);
    expect(res.user.employeeId).toBe(EMP);
  });

  it('rejects an invalid PIN with 401', async () => {
    await expect(login(EMP, '0000', {})).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rotates the refresh token, issuing a new one that differs from the old', async () => {
    const first = await login(EMP, PIN, {});
    const rotated = await refresh(first.refreshToken, {});
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(rotated.accessToken).toBeTruthy();
  });

  it('detects reuse of a rotated token and revokes the entire family', async () => {
    const first = await login(EMP, PIN, {});
    const rotated = await refresh(first.refreshToken, {});

    // Replaying the already-rotated original is treated as compromise.
    await expect(refresh(first.refreshToken, {})).rejects.toMatchObject({ statusCode: 401 });

    // The family was nuked, so even the freshly-rotated token is now dead.
    await expect(refresh(rotated.refreshToken, {})).rejects.toMatchObject({ statusCode: 401 });
  });
});
