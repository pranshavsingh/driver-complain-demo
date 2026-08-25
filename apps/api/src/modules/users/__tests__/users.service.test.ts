import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { listAdmins } from '../users.service';

// Self-contained integration test — requires a migrated database (docker compose up -d db).
// Fixtures use a UTEST_ prefix so they cannot collide with the seed or other test files;
// assertions check membership rather than exact contents for the same reason.
const ACTIVE_ADMIN = 'UTEST_A_ACTIVE';
const INACTIVE_ADMIN = 'UTEST_A_INACTIVE';
const DRIVER = 'UTEST_D';

const FIXTURES = [ACTIVE_ADMIN, INACTIVE_ADMIN, DRIVER];

beforeAll(async () => {
  const pinHash = await hashPin('9999');

  await prisma.user.upsert({
    where: { employeeId: ACTIVE_ADMIN },
    update: { pinHash, role: 'ADMIN', isActive: true },
    create: {
      employeeId: ACTIVE_ADMIN,
      pinHash,
      role: 'ADMIN',
      firstName: 'Zoe',
      lastName: 'Active',
    },
  });
  await prisma.user.upsert({
    where: { employeeId: INACTIVE_ADMIN },
    update: { pinHash, role: 'ADMIN', isActive: false },
    create: {
      employeeId: INACTIVE_ADMIN,
      pinHash,
      role: 'ADMIN',
      firstName: 'Gone',
      lastName: 'Admin',
      isActive: false,
    },
  });
  await prisma.user.upsert({
    where: { employeeId: DRIVER },
    update: { pinHash, role: 'DRIVER', isActive: true },
    create: { employeeId: DRIVER, pinHash, role: 'DRIVER', firstName: 'Dee', lastName: 'River' },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { employeeId: { in: FIXTURES } } });
  await prisma.$disconnect();
});

describe('users.listAdmins', () => {
  it('includes active admins', async () => {
    const ids = (await listAdmins()).map((a) => a.employeeId);
    expect(ids).toContain(ACTIVE_ADMIN);
  });

  it('excludes deactivated admins — assign would reject them anyway', async () => {
    const ids = (await listAdmins()).map((a) => a.employeeId);
    expect(ids).not.toContain(INACTIVE_ADMIN);
  });

  it('excludes drivers', async () => {
    const ids = (await listAdmins()).map((a) => a.employeeId);
    expect(ids).not.toContain(DRIVER);
  });

  it('returns only identity fields — never a pin hash', async () => {
    const admin = (await listAdmins()).find((a) => a.employeeId === ACTIVE_ADMIN);
    expect(admin).toEqual({
      id: expect.any(String),
      employeeId: ACTIVE_ADMIN,
      firstName: 'Zoe',
      lastName: 'Active',
      role: 'ADMIN',
    });
  });
});
