import * as SQLite from 'expo-sqlite';

type CachedRecord = {
  table_name: string;
  sync_uuid: string;
  updated_at?: string | null;
  active?: number | null;
  payload: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue = Promise.resolve();

async function getDb() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('lafoteria_schedule.db').then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_cache (
          table_name TEXT NOT NULL,
          sync_uuid TEXT NOT NULL,
          updated_at TEXT,
          active INTEGER,
          payload TEXT NOT NULL,
          PRIMARY KEY (table_name, sync_uuid)
        );
        CREATE INDEX IF NOT EXISTS sync_cache_table_updated_idx
          ON sync_cache (table_name, updated_at);
        CREATE TABLE IF NOT EXISTS app_preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return databasePromise;
}

export async function getCachedRows<T>(tableName: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<CachedRecord>(
    'SELECT payload FROM sync_cache WHERE table_name = ? ORDER BY updated_at ASC',
    tableName,
  );
  return rows.map((row) => JSON.parse(row.payload) as T);
}

export async function getLastCachedUpdate(tableName: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ updated_at?: string | null }>(
    'SELECT MAX(updated_at) AS updated_at FROM sync_cache WHERE table_name = ?',
    tableName,
  );
  return rows[0]?.updated_at || '';
}

export async function upsertCachedRows<T extends { sync_uuid: string; updated_at?: string | null; active?: boolean | null }>(
  tableName: string,
  rows: T[],
) {
  if (!rows.length) {
    return;
  }
  writeQueue = writeQueue.then(async () => {
    const db = await getDb();
    for (const row of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_cache (table_name, sync_uuid, updated_at, active, payload)
         VALUES (?, ?, ?, ?, ?)`,
        tableName,
        row.sync_uuid,
        row.updated_at || '',
        row.active === false ? 0 : 1,
        JSON.stringify(row),
      );
    }
  });
  return writeQueue;
}

export async function clearCachedTable(tableName: string) {
  writeQueue = writeQueue.then(async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM sync_cache WHERE table_name = ?', tableName);
  });
  return writeQueue;
}

export async function getPreference(key: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ value: string }>(
    'SELECT value FROM app_preferences WHERE key = ? LIMIT 1',
    key,
  );
  return rows[0]?.value || '';
}

export async function setPreference(key: string, value: string) {
  writeQueue = writeQueue.then(async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO app_preferences (key, value) VALUES (?, ?)',
      key,
      value,
    );
  });
  return writeQueue;
}
