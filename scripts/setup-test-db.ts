import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
  const maintUrl =
    process.env.DATABASE_URL_MAINTENANCE ||
    process.env.DATABASE_URL ||
    'mysql://app:app@127.0.0.1:3306/driver_complaint';

  console.log(`Connecting to maintenance database to inspect cluster...`);
  const maintClient = new PrismaClient({ datasourceUrl: maintUrl });

  try {
    const isMysql = maintUrl.startsWith('mysql:');
    let sysId = 'mysql-ci-cluster-id-12345';
    let disposableUrl = 'mysql://app:app@127.0.0.1:3306/driver_complaint_m4_disposable';

    if (isMysql) {
      // 1. Check / create disposable MySQL database with target collation
      console.log('Ensuring MySQL database driver_complaint_m4_disposable exists...');
      await maintClient.$executeRawUnsafe(
        'CREATE DATABASE IF NOT EXISTS `driver_complaint_m4_disposable` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;',
      );
      try {
        await maintClient.$executeRawUnsafe(
          "GRANT ALL PRIVILEGES ON `driver_complaint_m4_disposable`.* TO 'app'@'%'; FLUSH PRIVILEGES;",
        );
      } catch (grantErr) {
        console.warn('Could not grant privileges on disposable database to app user:', grantErr);
      }
      console.log('Database driver_complaint_m4_disposable verified successfully.');

      // 2. Discover MySQL server_uuid
      try {
        const sysRows = await maintClient.$queryRawUnsafe<any[]>('SELECT @@server_uuid AS sys_id');
        if (sysRows?.[0]?.sys_id) {
          sysId = String(sysRows[0].sys_id);
        }
      } catch (err) {
        console.warn('Could not query @@server_uuid, using deterministic fallback id:', err);
      }
      console.log(`MySQL server identifier discovered: ${sysId}`);
    } else {
      // PostgreSQL fallback
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

      const sysRows = await maintClient.$queryRawUnsafe<any[]>(
        'SELECT system_identifier::text AS sys_id FROM pg_control_system()',
      );
      sysId = sysRows[0]?.sys_id;
      if (!sysId || typeof sysId !== 'string' || sysId.trim().length < 5) {
        throw new Error(`Invalid or empty system_identifier discovered: "${sysId}"`);
      }
      console.log(`PostgreSQL cluster system_identifier discovered: ${sysId}`);
      disposableUrl =
        'postgresql://app:app@127.0.0.1:5432/driver_complaint_m4_disposable?schema=public';
    }

    // 3. Write .env.test for apps/api so vitest receives dynamic cluster ID
    const envLines =
      [
        `M4_ALLOW_DESTRUCTIVE_TEST_DB=true`,
        `M4_EXPECTED_TEST_SYSTEM_IDENTIFIER=${sysId}`,
        `M4_TEST_DISPOSABLE_DB_URL=${disposableUrl}`,
        `DATABASE_URL=${disposableUrl}`,
      ].join('\n') + '\n';

    const testEnvPath = path.resolve(__dirname, '../apps/api/.env.test');
    fs.writeFileSync(testEnvPath, envLines);
    console.log(`Wrote test configuration to ${testEnvPath}`);

    // 4. Export environment variables to GITHUB_ENV if running in GitHub Actions
    if (process.env.GITHUB_ENV) {
      fs.appendFileSync(process.env.GITHUB_ENV, envLines);
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
