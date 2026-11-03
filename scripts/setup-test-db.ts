import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

async function main(): Promise<void> {
  const maintUrl =
    process.env.DATABASE_URL_MAINTENANCE ||
    'postgresql://app:app@127.0.0.1:5432/driver_complaint?schema=public';

  console.log(`Connecting to maintenance database to inspect cluster...`);
  const maintClient = new PrismaClient({ datasourceUrl: maintUrl });

  try {
    // 1. Check / create disposable database
    const dbs = await maintClient.$queryRawUnsafe<any[]>(
      "SELECT 1 FROM pg_database WHERE datname = 'driver_complaint_m4_disposable'",
    );

    if (dbs.length === 0) {
      console.log('Creating database driver_complaint_m4_disposable...');
      await maintClient.$executeRawUnsafe('CREATE DATABASE driver_complaint_m4_disposable');
      console.log('Database driver_complaint_m4_disposable created successfully.');
    } else {
      console.log('Database driver_complaint_m4_disposable already exists.');
    }

    // 2. Discover cluster system_identifier
    const sysRows = await maintClient.$queryRawUnsafe<any[]>(
      'SELECT system_identifier::text AS sys_id FROM pg_control_system()',
    );
    const sysId = sysRows[0]?.sys_id;

    if (!sysId || typeof sysId !== 'string' || sysId.trim().length < 5) {
      throw new Error(`Invalid or empty system_identifier discovered: "${sysId}"`);
    }

    console.log(`PostgreSQL cluster system_identifier discovered: ${sysId}`);

    // 3. Export environment variables to GITHUB_ENV if running in GitHub Actions
    if (process.env.GITHUB_ENV) {
      const disposableUrl =
        'postgresql://app:app@127.0.0.1:5432/driver_complaint_m4_disposable?schema=public';
      fs.appendFileSync(process.env.GITHUB_ENV, `M4_ALLOW_DESTRUCTIVE_TEST_DB=true\n`);
      fs.appendFileSync(process.env.GITHUB_ENV, `M4_EXPECTED_TEST_SYSTEM_IDENTIFIER=${sysId}\n`);
      fs.appendFileSync(process.env.GITHUB_ENV, `M4_TEST_DISPOSABLE_DB_URL=${disposableUrl}\n`);
      fs.appendFileSync(process.env.GITHUB_ENV, `DATABASE_URL=${disposableUrl}\n`);
      console.log('Exported M4 environment variables to GITHUB_ENV:');
      console.log(`  M4_ALLOW_DESTRUCTIVE_TEST_DB=true`);
      console.log(`  M4_EXPECTED_TEST_SYSTEM_IDENTIFIER=${sysId}`);
      console.log(`  M4_TEST_DISPOSABLE_DB_URL=${disposableUrl}`);
      console.log(`  DATABASE_URL=${disposableUrl}`);
    }
  } finally {
    await maintClient.$disconnect();
  }
}

main().catch((err) => {
  console.error('SETUP TEST DB ERROR:', err);
  process.exit(1);
});
