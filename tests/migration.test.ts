import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../server/db';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('database migrations', () => {
  it('adds app_client to an existing v1 database without losing rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veriq-mig-'));
    const file = path.join(dir, 'v1.db');
    // Minimal v1 verification_events table, as created before the migration existed.
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE verification_events (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, result TEXT NOT NULL, reason_code TEXT NOT NULL, reason TEXT NOT NULL,
      product_id TEXT, token_id TEXT, token_fingerprint TEXT NOT NULL, scanner_id TEXT NOT NULL, location TEXT,
      source TEXT NOT NULL, repeat_scan INTEGER NOT NULL DEFAULT 0, flagged INTEGER NOT NULL DEFAULT 0,
      rules_triggered TEXT NOT NULL DEFAULT '[]', scan_number INTEGER, user_agent TEXT)`);
    old.exec(`INSERT INTO verification_events (id, created_at, result, reason_code, reason, token_fingerprint, scanner_id, source)
              VALUES ('evt_old', '2026-01-01T00:00:00Z', 'invalid', 'MALFORMED_TOKEN', 'x', 'abc', 'S', 'manual')`);
    old.close();

    const db = openDatabase(file);
    const cols = db.prepare('PRAGMA table_info(verification_events)').all().map((c) => c.name);
    expect(cols).toContain('app_client');
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
    expect(db.prepare(`SELECT app_client FROM verification_events WHERE id = 'evt_old'`).get()?.app_client).toBeNull();
    db.close();
    // Re-opening is a no-op.
    openDatabase(file).close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
