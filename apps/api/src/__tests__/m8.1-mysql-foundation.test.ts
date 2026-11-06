import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('M8.1 MySQL Migration Foundation — Schema & Model Tests', () => {
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  it('verifies datasource provider is mysql', () => {
    expect(schemaContent).toMatch(/datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"mysql"/);
  });

  it('verifies exactly 0 occurrences of @db.Uuid remain in schema.prisma', () => {
    const uuidMatches = schemaContent.match(/@db\.Uuid\b/g) || [];
    expect(uuidMatches.length).toBe(0);
  });

  it('verifies all 28 models exist and use @db.VarChar(36) for UUIDs', () => {
    const expectedModels = [
      'User',
      'Driver',
      'Vehicle',
      'Complaint',
      'ComplaintAttachment',
      'ComplaintUpdate',
      'Notification',
      'DeviceToken',
      'RefreshToken',
      'Counter',
      'LoadingRecord',
      'FuelRecord',
      'MaintenanceRecord',
      'Warehouse',
      'SparePartRequest',
      'SupportMessage',
      'OperatingSite',
      'CategorySla',
      'AdminCategoryAssignment',
      'RegisteredConsumer',
      'TransactionalOutbox',
      'OutboxConsumerDispatchIntent',
      'DeliveryLedger',
      'ConsumerAggregateCursor',
      'SequenceResolutionRecord',
      'TransactionalOutboxArchive',
      'OutboxConsumerDispatchIntentArchive',
      'DeliveryLedgerArchive',
    ];

    expectedModels.forEach((modelName) => {
      const modelRegex = new RegExp(`model\\s+${modelName}\\s*\\{`);
      expect(schemaContent).toMatch(modelRegex);
    });

    const varchar36Matches = schemaContent.match(/@db\.VarChar\(36\)/g) || [];
    // Exactly 80 occurrences across all primary keys, foreign keys, and UUID fields
    expect(varchar36Matches.length).toBe(80);
  });

  it('verifies explicit @db.Text annotations on unbounded long text fields', () => {
    // Complaint
    expect(schemaContent).toMatch(/model Complaint \{[\s\S]*?\s+description\s+String\s+@db\.Text/);
    expect(schemaContent).toMatch(/model Complaint \{[\s\S]*?\s+transcription\s+String\?\s+@db\.Text/);

    // ComplaintAttachment
    expect(schemaContent).toMatch(/model ComplaintAttachment \{[\s\S]*?\s+url\s+String\s+@db\.Text/);
    expect(schemaContent).toMatch(/model ComplaintAttachment \{[\s\S]*?\s+transcription\s+String\?\s+@db\.Text/);

    // ComplaintUpdate
    expect(schemaContent).toMatch(/model ComplaintUpdate \{[\s\S]*?\s+note\s+String\?\s+@db\.Text/);

    // Notification
    expect(schemaContent).toMatch(/model Notification \{[\s\S]*?\s+body\s+String\s+@db\.Text/);

    // RefreshToken userAgent
    expect(schemaContent).toMatch(/model RefreshToken \{[\s\S]*?\s+userAgent\s+String\?\s+@db\.Text/);

    // SupportMessage content
    expect(schemaContent).toMatch(/model SupportMessage \{[\s\S]*?\s+content\s+String\s+@default\(""\)\s+@db\.Text/);
    expect(schemaContent).toMatch(/model SupportMessage \{[\s\S]*?\s+attachmentUrl\s+String\?\s+@db\.Text/);
  });

  it('verifies Complaint.idempotencyKey is bounded VARCHAR(255) with composite unique constraint', () => {
    expect(schemaContent).toMatch(/idempotencyKey\s+String\?\s+@db\.VarChar\(255\)/);
    expect(schemaContent).toMatch(/@@unique\(\[driverId,\s*idempotencyKey\]\)/);
    expect(schemaContent).toMatch(/@@index\(\[idempotencyKey\]\)/);
  });

  it('verifies token and tokenHash fields are bounded VARCHAR(255)', () => {
    expect(schemaContent).toMatch(/model DeviceToken \{[\s\S]*?\s+token\s+String\s+@unique\s+@db\.VarChar\(255\)/);
    expect(schemaContent).toMatch(/model RefreshToken \{[\s\S]*?\s+tokenHash\s+String\s+@unique\s+@db\.VarChar\(255\)/);
  });

  it('verifies LoadingRecord address fields are bounded VARCHAR(500) and photos are @db.Text', () => {
    expect(schemaContent).toMatch(/reachedAddress\s+String\?\s+@db\.VarChar\(500\)/);
    expect(schemaContent).toMatch(/completedAddress\s+String\?\s+@db\.VarChar\(500\)/);
    expect(schemaContent).toMatch(/tripStartAddress\s+String\?\s+@db\.VarChar\(500\)/);
    expect(schemaContent).toMatch(/tripCompletedAddress\s+String\?\s+@db\.VarChar\(500\)/);
    expect(schemaContent).toMatch(/unloadingAddress\s+String\?\s+@db\.VarChar\(500\)/);

    expect(schemaContent).toMatch(/reachedPhotoUrl\s+String\s+@db\.Text/);
    expect(schemaContent).toMatch(/completedPhotoUrl\s+String\?\s+@db\.Text/);
    expect(schemaContent).toMatch(/tripCompletedPhotoUrl\s+String\?\s+@db\.Text/);
    expect(schemaContent).toMatch(/unloadingPhotoUrl\s+String\?\s+@db\.Text/);
  });

  it('verifies no query files in apps/api/src contain mode: insensitive', () => {
    const srcDir = path.resolve(__dirname, '..');
    const checkDir = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          results = results.concat(checkDir(filePath));
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          const content = fs.readFileSync(filePath, 'utf8');
          if (/mode:\s*['"]insensitive['"]/.test(content)) {
            results.push(filePath);
          }
        }
      });
      return results;
    };

    const filesWithMode = checkDir(srcDir);
    expect(filesWithMode).toEqual([]);
  });

  it('verifies package.json safety: prestart is removed and migrate:deploy has no blanket || true', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    expect(pkg.scripts.prestart).toBeUndefined();
    expect(pkg.scripts['migrate:deploy']).toBe('prisma migrate deploy');
    expect(pkg.scripts['migrate:deploy']).not.toContain('|| true');
    expect(pkg.scripts['migrate:deploy']).not.toContain('db push');
  });

  it('verifies migrations directory structure: archive exists with 18 items and active migrations has baseline', () => {
    const archiveDir = path.resolve(__dirname, '../../prisma/migrations_postgresql_archive');
    const activeDir = path.resolve(__dirname, '../../prisma/migrations');

    expect(fs.existsSync(archiveDir)).toBe(true);
    const archiveItems = fs.readdirSync(archiveDir);
    expect(archiveItems.length).toBe(18);

    const activeItems = fs.readdirSync(activeDir);
    expect(activeItems).toContain('20261106120000_init_mysql');
    expect(activeItems).toContain('migration_lock.toml');

    const baselineSql = fs.readFileSync(path.join(activeDir, '20261106120000_init_mysql/migration.sql'), 'utf8');
    expect(baselineSql).toContain('CREATE TABLE `User`');
    expect(baselineSql).toContain('`id` VARCHAR(36) NOT NULL');
    expect(baselineSql).toContain('`description` TEXT NOT NULL');
    expect(baselineSql).toContain('`idempotencyKey` VARCHAR(255) NULL');
    expect(baselineSql).toContain('COLLATE utf8mb4_unicode_ci');
  });
});
