import 'dotenv/config';
import path from 'node:path';

export interface AppConfig {
  port: number;
  adminEmail: string;
  adminPassword: string;
  tokenHashSecret: string;
  qrSigningSecret: string;
  /** Authorized verification clients: app key → client ID (e.g. "web-scanner"). */
  appKeys: Map<string, string>;
  databasePath: string;
  verifyRateLimitPerMinute: number;
  isProduction: boolean;
  cdp: CdpConfig;
}

/** Copy Detection Pattern settings. Geometry must match what was printed. */
export interface CdpConfig {
  secret: string;
  serviceUrl: string;
  /** Default decision threshold; the operator can override it in Settings (stored in SQLite). */
  defaultThreshold: number;
  gridSize: number;
  cellMm: number;
  qrMm: number;
}

const DEV_HASH_SECRET = 'change-me-local-dev-only-secret';
const DEV_SIGNING_SECRET = 'change-me-local-dev-only-qr-signing-secret';
const DEV_CDP_SECRET = 'change-me-local-dev-only-cdp-secret';
const DEV_APP_KEYS = 'web-scanner:dev-web-scanner-key,flutter-app:dev-flutter-app-key';

/** Parses `client-id:key,client-id:key`. Invalid entries are rejected loudly. */
export function parseAppKeys(raw: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = entry.indexOf(':');
    const client = entry.slice(0, i).trim();
    const key = entry.slice(i + 1).trim();
    if (i <= 0 || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(client) || key.length < 12) {
      throw new Error(`Invalid APP_KEYS entry "${entry}". Expected client-id:key with a key of at least 12 characters.`);
    }
    if (keys.has(key)) throw new Error(`Duplicate key in APP_KEYS for client "${client}".`);
    keys.set(key, client);
  }
  return keys;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = process.env;
  const config: AppConfig = {
    port: Number(env.PORT ?? 4000),
    adminEmail: env.DEMO_ADMIN_EMAIL ?? 'operator@veriq.demo',
    adminPassword: env.DEMO_ADMIN_PASSWORD ?? 'veriq-demo-2026',
    tokenHashSecret: env.TOKEN_HASH_SECRET ?? DEV_HASH_SECRET,
    qrSigningSecret: env.QR_SIGNING_SECRET ?? DEV_SIGNING_SECRET,
    appKeys: parseAppKeys(env.APP_KEYS ?? DEV_APP_KEYS),
    databasePath: path.resolve(env.DATABASE_PATH ?? './data/veriq.db'),
    verifyRateLimitPerMinute: Number(env.VERIFY_RATE_LIMIT_PER_MINUTE ?? 60),
    isProduction: env.NODE_ENV === 'production',
    cdp: {
      secret: env.CDP_SECRET ?? DEV_CDP_SECRET,
      serviceUrl: (env.CDP_SERVICE_URL ?? 'http://127.0.0.1:8100').replace(/\/+$/, ''),
      defaultThreshold: num(env.CDP_THRESHOLD, 0.6, 0, 1),
      gridSize: num(env.CDP_GRID_SIZE, 40, 16, 64),
      cellMm: num(env.CDP_CELL_MM, 0.15, 0.08, 0.5),
      qrMm: num(env.LABEL_QR_MM, 30, 15, 80),
    },
    ...overrides,
  };

  if (config.tokenHashSecret === DEV_HASH_SECRET) {
    console.warn('[veriq] TOKEN_HASH_SECRET is using the local development default. Set it in .env for any shared environment.');
  }
  if (config.qrSigningSecret === DEV_SIGNING_SECRET) {
    console.warn('[veriq] QR_SIGNING_SECRET is using the local development default. Set it in .env for any shared environment.');
  }
  if (config.qrSigningSecret === config.tokenHashSecret) {
    console.warn('[veriq] QR_SIGNING_SECRET and TOKEN_HASH_SECRET are identical. Use two independent secrets.');
  }
  if (config.cdp.secret === DEV_CDP_SECRET) {
    console.warn('[veriq] CDP_SECRET is using the local development default. Set it in .env for any shared environment.');
  }
  if (config.appKeys.size === 0) {
    console.warn('[veriq] APP_KEYS is empty — every /api/verify request will be rejected.');
  }
  return config;
}

export type Secrets = Pick<AppConfig, 'tokenHashSecret' | 'qrSigningSecret'>;

function num(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid numeric setting "${raw}" (expected ${min}–${max}).`);
  return v;
}
