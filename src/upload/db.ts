import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (once) the persistent queue DB and ensures the schema exists. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('dsr-queue.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          local_path TEXT NOT NULL,
          s3_key TEXT NOT NULL,
          visit_id TEXT NOT NULL,
          content_type TEXT NOT NULL,
          kind TEXT NOT NULL,               -- 'chunk' | 'manifest' | 'daylog'
          attempts INTEGER NOT NULL DEFAULT 0,
          last_attempt_ts INTEGER,
          status TEXT NOT NULL DEFAULT 'pending'  -- pending|uploading|done|failed_auth
        );
        CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status, id);
        CREATE TABLE IF NOT EXISTS visits (
          visit_id TEXT PRIMARY KEY,
          dsr_id TEXT NOT NULL,
          date TEXT NOT NULL,               -- YYYY-MM-DD (local)
          outlet_name TEXT NOT NULL,
          enter_ts TEXT NOT NULL,
          exit_ts TEXT,
          trigger TEXT NOT NULL,
          finalized INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(dsr_id, date);
      `);
      return db;
    })();
  }
  return dbPromise;
}
