import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Every seeded account uses PIN 2468 for convenience in local dev.
const SEED_PIN = '2468';

async function main(): Promise<void> {
  const pinHash = await bcrypt.hash(SEED_PIN, 12);

  await prisma.user.upsert({
    where: { employeeId: 'E0001' },
    update: {},
    create: {
      employeeId: 'E0001',
      pinHash,
      role: 'SUPER_ADMIN',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'super.admin@example.com',
    },
  });

  await prisma.user.upsert({
    where: { employeeId: 'E0002' },
    update: {},
    create: {
      employeeId: 'E0002',
      pinHash,
      role: 'ADMIN',
      firstName: 'Ops',
      lastName: 'Admin',
      email: 'ops.admin@example.com',
    },
  });

  await prisma.user.upsert({
    where: { employeeId: 'E1001' },
    update: {},
    create: {
      employeeId: 'E1001',
      pinHash,
      role: 'DRIVER',
      firstName: 'Dana',
      lastName: 'Driver',
      email: 'dana.driver@example.com',
      driver: {
        create: {
          licenseNumber: 'DL-1001',
          vehicles: {
            create: { plateNumber: 'ABC-1234', make: 'Toyota', model: 'HiAce', year: 2021 },
          },
        },
      },
    },
  });

  console.log(`Seeded E0001 (super_admin), E0002 (admin), E1001 (driver) — PIN ${SEED_PIN}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
