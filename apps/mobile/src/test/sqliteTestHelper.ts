import { DatabaseSync } from 'node:sqlite';
import type * as SQLite from 'expo-sqlite';
import { migrateDatabase } from '../db/database';

/**
 * Creates an in-memory SQLite database adhering to Expo SQLite's synchronous interface
 * for accurate, fast, isolation-safe tests without mocking SQL statements.
 */
export function createTestDatabase(): SQLite.SQLiteDatabase {
  const rawDb = new DatabaseSync(':memory:');

  const db: Partial<SQLite.SQLiteDatabase> = {
    execSync(sql: string): void {
      rawDb.exec(sql);
    },

    runSync(sql: string, ...params: any[]): SQLite.SQLiteRunResult {
      const flattened = Array.isArray(params[0]) ? params[0] : params;
      const stmt = rawDb.prepare(sql);
      const res = stmt.run(...flattened);
      return {
        changes: Number(res.changes),
        lastInsertRowId: Number(res.lastInsertRowid),
      };
    },

    getAllSync<T>(sql: string, ...params: any[]): T[] {
      const flattened = Array.isArray(params[0]) ? params[0] : params;
      const stmt = rawDb.prepare(sql);
      return stmt.all(...flattened) as T[];
    },

    getFirstSync<T>(sql: string, ...params: any[]): T | null {
      const flattened = Array.isArray(params[0]) ? params[0] : params;
      const stmt = rawDb.prepare(sql);
      const res = stmt.get(...flattened);
      return (res as T) ?? null;
    },

    closeSync(): void {
      rawDb.close();
    },
  };

  const fullDb = db as SQLite.SQLiteDatabase;
  migrateDatabase(fullDb);
  return fullDb;
}
