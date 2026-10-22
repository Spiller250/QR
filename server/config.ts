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
}

const DEV_HASH_SECRET = 'change-me-local-dev-only-secret';
const DEV_SIGNING_SECRET = 'change-me-local-dev-only-qr-signing-secret';
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
  if (config.appKeys.size === 0) {
    console.warn('[veriq] APP_KEYS is empty — every /api/verify request will be rejected.');
  }
  return config;
}

export type Secrets = Pick<AppConfig, 'tokenHashSecret' | 'qrSigningSecret'>;
