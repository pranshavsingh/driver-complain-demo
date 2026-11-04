import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../test/sqliteTestHelper';
import { migrateDatabase } from '../database';

describe('SQLite Database & Migrations', () => {
  it('initializes schema and records migration version in _schema_migrations', () => {
    const db = createTestDatabase();

    const migrations = db.getAllSync<{ version: number; applied_at: string }>(
      'SELECT version, applied_at FROM _schema_migrations ORDER BY version ASC;'
    );
    expect(migrations.length).toBe(1);
    expect(migrations[0]?.version).toBe(1);

    // Verify pending_complaints table exists
    const complaintsTable = db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_complaints';"
    );
    expect(complaintsTable).not.toBeNull();
    expect(complaintsTable?.name).toBe('pending_complaints');

    // Verify pending_attachments table exists
    const attachmentsTable = db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_attachments';"
    );
    expect(attachmentsTable).not.toBeNull();
    expect(attachmentsTable?.name).toBe('pending_attachments');

    // Verify indexes exist
    const indexes = db.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';"
    );
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_pending_complaints_user');
    expect(indexNames).toContain('idx_pending_complaints_queue');
    expect(indexNames).toContain('idx_pending_complaints_idempotency');
    expect(indexNames).toContain('idx_pending_attachments_complaint');
  });

  it('runs idempotently when called multiple times without duplicate table or index errors', () => {
    const db = createTestDatabase();

    // Re-run migration
    expect(() => migrateDatabase(db)).not.toThrow();
    expect(() => migrateDatabase(db)).not.toThrow();

    const migrations = db.getAllSync<{ version: number }>(
      'SELECT version FROM _schema_migrations;'
    );
    expect(migrations.length).toBe(1);
  });

  it('enforces foreign key cascade deletion for attachments', () => {
    const db = createTestDatabase();

    // Insert complaint
    db.runSync(
      `INSERT INTO pending_complaints (
        id, user_id, idempotency_key, title, description, category, priority,
        created_at, updated_at, sync_status, retry_count
      ) VALUES ('c-1', 'user-1', 'key-1', 'Brakes issue', 'Squeaking sound', 'BREAKDOWN', 'HIGH',
        datetime('now'), datetime('now'), 'PENDING', 0);`
    );

    // Insert attachment linked to c-1
    db.runSync(
      `INSERT INTO pending_attachments (
        id, complaint_id, kind, local_uri, file_name, mime_type, file_size, upload_status, created_at
      ) VALUES ('a-1', 'c-1', 'PHOTO', 'file:///cache/photo.jpg', 'photo.jpg', 'image/jpeg', 1024, 'PENDING', datetime('now'));`
    );

    const before = db.getAllSync("SELECT * FROM pending_attachments WHERE complaint_id = 'c-1';");
    expect(before.length).toBe(1);

    // Delete complaint c-1
    db.runSync("DELETE FROM pending_complaints WHERE id = 'c-1';");

    // Attachment must be cascade deleted
    const after = db.getAllSync("SELECT * FROM pending_attachments WHERE complaint_id = 'c-1';");
    expect(after.length).toBe(0);
  });
});
