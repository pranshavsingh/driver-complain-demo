import { DatabaseSync } from 'node:sqlite';

export type SQLiteRunResult = { changes: number; lastInsertRowId: number };

export function openDatabaseSync(name: string): any {
  const rawDb = new DatabaseSync(':memory:');
  return {
    execSync(sql: string): void {
      rawDb.exec(sql);
    },
    runSync(sql: string, ...params: any[]): SQLiteRunResult {
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
}
