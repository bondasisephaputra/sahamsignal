import { createClient, type Client } from "@libsql/client";

/**
 * Database strategy
 * -----------------
 * We speak plain SQLite via libSQL. That keeps the local setup a real
 * database *file* on disk (`./data/saham.db`) with zero infrastructure,
 * while the exact same code can point at a hosted libSQL/Turso database on
 * Vercel purely through environment variables.
 *
 *   local  -> file:./data/saham.db        (no env var needed)
 *   vercel -> libsql://xxx.turso.io       (DATABASE_URL + DATABASE_AUTH_TOKEN)
 */

const LOCAL_FILE = "file:./data/saham.db";

let client: Client | null = null;
let initPromise: Promise<void> | null = null;

function resolveUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : LOCAL_FILE;
}

function authToken(): string | undefined {
  const token = process.env.DATABASE_AUTH_TOKEN?.trim();
  return token && token.length > 0 ? token : undefined;
}

/**
 * Create a directory (and any missing parents) using `node:fs` loaded on
 * demand, so the import never appears at module scope.
 */
function mkdirRecursive(dir: string): void {
  // `getBuiltinModule` is a synchronous Node built-in resolver - no top-level
  // import required, and it is only ever reached on a file-backed database.
  const fs = process.getBuiltinModule("node:fs");
  fs.mkdirSync(dir, { recursive: true });
}

/** Lazily create the client, making sure the parent dir of a file DB exists. */
export function getClient(): Client {
  if (client) return client;

  const url = resolveUrl();
  if (url.startsWith("file:")) {
    // Derived from the URL itself rather than `process.cwd()`: relative `file:`
    // paths already resolve against the project root, and this keeps the module
    // free of top-level Node-only imports so the Edge build of
    // `instrumentation.ts` has nothing to complain about.
    const dir = url.slice("file:".length).replace(/[/\\][^/\\]*$/, "");
    if (dir) mkdirRecursive(dir);
  }

  client = createClient({ url, authToken: authToken() });
  return client;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, symbol)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);

-- Rolling market-data cache so we hammer the free upstream API as little
-- as possible. Keyed by a logical cache key, not by symbol alone.
CREATE TABLE IF NOT EXISTS data_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_expiry ON data_cache(expires_at);

-- Fundamental snapshots, one row per symbol per quarter.
CREATE TABLE IF NOT EXISTS fundamentals (
  symbol           TEXT NOT NULL,
  as_of_date       TEXT NOT NULL,
  revenue          REAL,
  net_income       REAL,
  gross_profit     REAL,
  operating_income REAL,
  total_assets     REAL,
  equity           REAL,
  total_debt       REAL,
  current_assets   REAL,
  current_liabs    REAL,
  free_cash_flow   REAL,
  eps              REAL,
  market_cap       REAL,
  PRIMARY KEY (symbol, as_of_date)
);

-- Historical record of every published signal (for accuracy tracking).
CREATE TABLE IF NOT EXISTS signal_history (
  id             TEXT PRIMARY KEY,
  symbol         TEXT NOT NULL,
  as_of_date     TEXT NOT NULL,
  signal         TEXT NOT NULL,
  score          REAL NOT NULL,
  tech_score     REAL,
  fund_score     REAL,
  price          REAL,
  created_at     INTEGER NOT NULL,
  UNIQUE(symbol, as_of_date)
);
CREATE INDEX IF NOT EXISTS idx_signal_hist_symbol ON signal_history(symbol, as_of_date DESC);
`;

/** Create tables once per process. Safe to call concurrently. */
export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const db = getClient();
      await db.executeMultiple(SCHEMA);
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

type Row = Record<string, unknown>;

/** Values libSQL accepts as bound parameters. */
export type SqlValue = string | number | bigint | boolean | null | Uint8Array;

/** Run a SELECT and return rows. */
export async function select<T = Row>(sql: string, args: SqlValue[] = []): Promise<T[]> {
  await initDb();
  const res = await getClient().execute({ sql, args });
  return res.rows as T[];
}

/** Run a SELECT expected to match at most one row. */
export async function selectOne<T = Row>(sql: string, args: SqlValue[] = []): Promise<T | null> {
  const rows = await select<T>(sql, args);
  return rows.length > 0 ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE. */
export async function execute(sql: string, args: SqlValue[] = []): Promise<void> {
  await initDb();
  await getClient().execute({ sql, args });
}

/** Run several statements as one batch (transactional). */
export async function batch(statements: Array<{ sql: string; args?: SqlValue[] }>): Promise<void> {
  await initDb();
  await getClient().batch(
    statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

export function isLocalFileDb(): boolean {
  return resolveUrl().startsWith("file:");
}
