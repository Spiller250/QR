import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Loaded via require so bundler-based tooling (Vitest/Vite 5) does not try to resolve the builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type Db = DatabaseSyncType;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id               TEXT PRIMARY KEY,
  public_id        TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  sku              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  manufacturer     TEXT NOT NULL,
  category         TEXT NOT NULL,
  batch_number     TEXT NOT NULL,
  production_date  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  is_demo          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- token_hash is an HMAC-SHA256 of the secret token and is the only lookup key.
-- token_plain is kept only while the label is active so the admin UI can re-render it;
-- it is wiped on revocation (see README: production would not store it at all).
CREATE TABLE IF NOT EXISTS qr_tokens (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  token_plain    TEXT,
  token_preview  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  revoked_at     TEXT,
  revoke_reason  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_token_per_product ON qr_tokens(product_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS verification_events (
  id                 TEXT PRIMARY KEY,
  created_at         TEXT NOT NULL,
  result             TEXT NOT NULL,
  reason_code        TEXT NOT NULL,
  reason             TEXT NOT NULL,
  product_id         TEXT REFERENCES products(id) ON DELETE SET NULL,
  token_id           TEXT REFERENCES qr_tokens(id) ON DELETE SET NULL,
  token_fingerprint  TEXT NOT NULL,
  scanner_id         TEXT NOT NULL,
  location           TEXT,
  source             TEXT NOT NULL,
  repeat_scan        INTEGER NOT NULL DEFAULT 0,
  flagged            INTEGER NOT NULL DEFAULT 0,
  rules_triggered    TEXT NOT NULL DEFAULT '[]',
  scan_number        INTEGER,
  user_agent         TEXT
);
CREATE INDEX IF NOT EXISTS events_token ON verification_events(token_id, created_at);
CREATE INDEX IF NOT EXISTS events_product ON verification_events(product_id);
CREATE INDEX IF NOT EXISTS events_created ON verification_events(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
`;

export function openDatabase(filePath: string): Db {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * Ordered, idempotent migrations tracked with PRAGMA user_version. SCHEMA above is the
 * version-1 baseline; each entry here upgrades an existing database by one version.
 */
const MIGRATIONS: { version: number; up: (db: Db) => void }[] = [
  {
    // v2: record which authorized client application performed each verification.
    version: 2,
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(verification_events)').all().map((c) => String(c.name));
      if (!cols.includes('app_client')) db.exec('ALTER TABLE verification_events ADD COLUMN app_client TEXT');
    },
  },
];

function migrate(db: Db): void {
  const current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    transaction(db, () => {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
