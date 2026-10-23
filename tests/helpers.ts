import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { openDatabase } from '../server/db';
import type { CdpClient } from '../server/lib/cdpClient';

export const WEB_KEY = 'test-web-scanner-key-0001';
export const FLUTTER_KEY = 'test-flutter-app-key-0001';
export const SIGNING_SECRET = 'test-qr-signing-secret';

export async function setup(opts: { seed?: boolean; cdpClient?: CdpClient; cdpServiceUrl?: string } = {}) {
  const config = loadConfig({
    databasePath: ':memory:',
    tokenHashSecret: 'test-hash-secret',
    qrSigningSecret: SIGNING_SECRET,
    appKeys: new Map([
      [WEB_KEY, 'web-scanner'],
      [FLUTTER_KEY, 'flutter-app'],
    ]),
    adminEmail: 'op@test.local',
    adminPassword: 'pw',
    verifyRateLimitPerMinute: 10_000,
  });
  config.cdp = { ...config.cdp, secret: 'test-cdp-secret', defaultThreshold: 0.6, serviceUrl: opts.cdpServiceUrl ?? 'http://127.0.0.1:9' };
  const db = openDatabase(':memory:');
  const { app, ctx } = createApp(db, config, { cdpClient: opts.cdpClient });
  if (opts.seed) {
    const { seedDemoData } = await import('../server/seed');
    seedDemoData(ctx.store, config);
  }
  const login = await request(app).post('/api/auth/login').send({ email: 'op@test.local', password: 'pw' });
  const auth = { Authorization: `Bearer ${login.body.token as string}` };
  /** POST /api/verify as an authorized client (web scanner key by default). */
  const verify = (body: object, key: string | null = WEB_KEY) => {
    const req = request(app as Express).post('/api/verify');
    if (key !== null) req.set('X-App-Key', key);
    return req.send(body);
  };
  return { app, ctx, auth, verify };
}

export const sampleProduct = {
  name: 'Test Chronograph',
  sku: 'TST-001',
  manufacturer: 'Fictional Test Co.',
  category: 'Watches',
  batchNumber: 'B-1',
  productionDate: '2026-01-15',
};

/** Token part of a `VQ1.<token>.<sig>` payload. */
export function tokenOf(payload: string): string {
  return payload.split('.')[1];
}
