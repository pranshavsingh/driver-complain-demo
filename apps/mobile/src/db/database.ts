import * as SQLite from 'expo-sqlite';

export const CURRENT_SCHEMA_VERSION = 2;

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Run schema migrations on a SQLite database.
 * Ensures idempotent schema creation and tracking via _schema_migrations.
 */
export function migrateDatabase(db: SQLite.SQLiteDatabase): void {
  db.execSync('PRAGMA foreign_keys = ON;');
  db.execSync('PRAGMA journal_mode = WAL;');

  db.execSync(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db.getAllSync<{ version: number }>(
    'SELECT version FROM _schema_migrations ORDER BY version ASC;'
  );
  const appliedVersions = new Set(applied.map((r) => r.version));

  if (!appliedVersions.has(1)) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS pending_complaints (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        vehicle_id TEXT,
        vehicle_number TEXT,
        trip_phase TEXT,
        latitude REAL,
        longitude REAL,
        location_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_sync_attempt TEXT,
        last_failure_reason TEXT,
        server_complaint_id TEXT,
        server_complaint_no TEXT
      );

      CREATE TABLE IF NOT EXISTS pending_attachments (
        id TEXT PRIMARY KEY,
        complaint_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        local_uri TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        upload_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (complaint_id) REFERENCES pending_complaints(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_pending_complaints_user ON pending_complaints(user_id);
      CREATE INDEX IF NOT EXISTS idx_pending_complaints_queue ON pending_complaints(user_id, sync_status, created_at);
      CREATE INDEX IF NOT EXISTS idx_pending_complaints_idempotency ON pending_complaints(user_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_pending_attachments_complaint ON pending_attachments(complaint_id);

      INSERT INTO _schema_migrations (version, applied_at) VALUES (1, datetime('now'));
    `);
  }

  if (!appliedVersions.has(2)) {
    // Migration 2: Add next_retry_at column and composite retry scheduling index
    const tableInfo = db.getAllSync<{ name: string }>('PRAGMA table_info(pending_complaints);');
    const hasNextRetryAt = tableInfo.some((col) => col.name === 'next_retry_at');
    if (!hasNextRetryAt) {
      db.execSync('ALTER TABLE pending_complaints ADD COLUMN next_retry_at TEXT;');
    }
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_pending_complaints_retry ON pending_complaints(user_id, sync_status, next_retry_at, created_at);
      INSERT INTO _schema_migrations (version, applied_at) VALUES (2, datetime('now'));
    `);
  }
}

/**
 * Returns the singleton SQLite database instance, initialized and migrated.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('driver_complaint.db');
    migrateDatabase(dbInstance);
  }
  return dbInstance;
}

/**
 * Closes and resets the cached database instance (primarily for tests).
 */
export function resetDatabaseInstance(): void {
  if (dbInstance) {
    try {
      dbInstance.closeSync();
    } catch {
      // Ignore close errors
    }
    dbInstance = null;
  }
}

/**
 * Injects a database instance (primarily for tests).
 */
export function setDatabaseInstance(db: SQLite.SQLiteDatabase | null): void {
  dbInstance = db;
}
