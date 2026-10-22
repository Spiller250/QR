import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sampleProduct, setup, tokenOf } from './helpers';

describe('access control', () => {
  it('rejects admin endpoints without a session', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/products')).status).toBe(401);
    expect((await request(app).get('/api/verification-logs')).status).toBe(401);
    expect((await request(app).post('/api/admin/reset-demo')).status).toBe(401);
  });

  it('rejects wrong credentials', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/auth/login').send({ email: 'op@test.local', password: 'nope' });
    expect(res.status).toBe(401);
  });
});

describe('products', () => {
  it('creates a product with a public ID and a signed, non-URL QR payload', async () => {
    const { app, auth } = await setup();
    const res = await request(app).post('/api/products').set(auth).send(sampleProduct);
    expect(res.status).toBe(201);
    expect(res.body.publicId).toMatch(/^VQ-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(res.body.activeLabel.status).toBe('active');
    expect(res.body.activeLabel.qrPayload).toMatch(/^VQ1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/);
    expect(res.body.activeLabel.qrPayload).not.toMatch(/https?:|\/v\//);
    expect(res.body.authState).toBe('not_scanned');

    const list = await request(app).get('/api/products?q=TST-001').set(auth);
    expect(list.body.total).toBe(1);
  });

  it('validates input and rejects duplicate SKUs', async () => {
    const { app, auth } = await setup();
    const bad = await request(app).post('/api/products').set(auth).send({ ...sampleProduct, name: '', productionDate: '2099-01-01' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['name', 'productionDate']));
    await request(app).post('/api/products').set(auth).send(sampleProduct);
    const dup = await request(app).post('/api/products').set(auth).send({ ...sampleProduct, sku: 'tst-001' });
    expect(dup.status).toBe(409);
  });
});

describe('verification flow', () => {
  it('runs scenarios A–E end to end', async () => {
    const { app, auth, verify } = await setup();
    const created = await request(app).post('/api/products').set(auth).send(sampleProduct);
    const productId = created.body.id as string;
    const payload = created.body.activeLabel.qrPayload as string;

    // A — first scan
    const a = await verify({ payload, scannerId: 'SCN-MIL-07', location: 'Milan, IT', source: 'simulator' });
    expect(a.status).toBe(200);
    expect(a.body.result).toBe('authentic');
    expect(a.body.reasonCode).toBe('FIRST_SCAN');
    expect(a.body.product.name).toBe(sampleProduct.name);
    expect(JSON.stringify(a.body)).not.toContain(tokenOf(payload));

    // B — repeat scan by the same scanner is normal, not counterfeit
    const b = await verify({ payload, scannerId: 'SCN-MIL-07', location: 'Milan, IT' });
    expect(b.body.result).toBe('authentic');
    expect(b.body.scan.repeatScan).toBe(true);
    expect(b.body.scan.scanNumber).toBe(2);

    // E — copy scanned elsewhere: same payload, flagged only by heuristics
    const e = await verify({ payload, scannerId: 'SCN-SGP-12', location: 'Singapore, SG' });
    expect(e.body.result).toBe('suspicious');
    expect(e.body.scan.rulesTriggered).toContain('RAPID_DEVICE_SWITCH');

    // C — junk input
    const junk = await verify({ payload: 'not a token' });
    expect(junk.body.result).toBe('invalid');
    expect(junk.body.reasonCode).toBe('MALFORMED_TOKEN');
    expect(junk.body.product).toBeNull();

    // D — reissue invalidates the old payload
    const re = await request(app).post(`/api/products/${productId}/reissue-token`).set(auth).send({ reason: 'test' });
    expect(re.status).toBe(200);
    const d = await verify({ payload, scannerId: 'SCN-MIL-07' });
    expect(d.body.result).toBe('revoked');
    expect(d.body.product).toBeNull();
    const fresh = await verify({ payload: re.body.product.activeLabel.qrPayload, scannerId: 'SCN-MIL-07' });
    expect(fresh.body.result).toBe('authentic');
    expect(fresh.body.scan.scanNumber).toBe(1);

    // Logs & stats reflect all of it, including which client app verified
    const logs = await request(app).get(`/api/verification-logs?productId=${productId}`).set(auth);
    expect(logs.body.total).toBe(5);
    expect(logs.body.items.every((i: { appClient: string }) => i.appClient === 'web-scanner')).toBe(true);
    const stats = await request(app).get('/api/stats/overview').set(auth);
    expect(stats.body.totalVerifications).toBe(6);
    expect(stats.body.suspiciousScans).toBe(1);
    expect(stats.body.revokedAttempts).toBe(1);
    expect(stats.body.invalidAttempts).toBe(1);

    // Revoked labels no longer expose their payload
    const detail = await request(app).get(`/api/products/${productId}`).set(auth);
    const old = detail.body.labelHistory.find((l: { status: string }) => l.status === 'revoked');
    expect(old.qrPayload).toBeNull();
  });

  it('exports CSV with the client column and formula injection neutralised', async () => {
    const { app, auth, verify } = await setup();
    await verify({ payload: 'x', scannerId: '=HYPERLINK("evil")' });
    const csv = await request(app).get('/api/verification-logs/export.csv').set(auth);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toContain('app_client');
    expect(csv.text).toContain('web-scanner');
    expect(csv.text).toContain(`"'=HYPERLINK(""evil"")"`);
  });

  it('applies updated rule settings', async () => {
    const { app, auth, verify } = await setup();
    const settings = await request(app).get('/api/settings').set(auth);
    expect(settings.body.appClients).toEqual(['web-scanner', 'flutter-app']);
    expect(JSON.stringify(settings.body)).not.toContain('test-web-scanner-key');
    const rules = { ...settings.body.rules, scanCountThreshold: 1 };
    expect((await request(app).put('/api/settings/rules').set(auth).send(rules)).status).toBe(200);
    const created = await request(app).post('/api/products').set(auth).send(sampleProduct);
    const payload = created.body.activeLabel.qrPayload;
    await verify({ payload, scannerId: 'A' });
    const second = await verify({ payload, scannerId: 'A' });
    expect(second.body.result).toBe('suspicious');
    expect(second.body.scan.rulesTriggered).toEqual(['HIGH_SCAN_COUNT']);
  });
});

describe('seed data', () => {
  it('produces a realistic, consistent dataset with signed payloads', async () => {
    const { app, auth, verify } = await setup({ seed: true });
    const stats = await request(app).get('/api/stats/overview').set(auth);
    expect(stats.body.totalProducts).toBe(16);
    expect(stats.body.suspiciousScans).toBeGreaterThan(0);
    expect(stats.body.resultBreakdown.revoked).toBeGreaterThan(0);
    expect(stats.body.resultBreakdown.invalid).toBeGreaterThan(0);
    expect(stats.body.authStateBreakdown.no_active_label).toBe(1);
    const reasons = await request(app).get('/api/verification-logs?result=invalid&pageSize=100').set(auth);
    const codes = new Set(reasons.body.items.map((i: { reasonCode: string }) => i.reasonCode));
    expect([...codes].sort()).toEqual(['BAD_SIGNATURE', 'LEGACY_FORMAT', 'MALFORMED_TOKEN', 'TOKEN_NOT_FOUND']);

    const demo = await request(app).get('/api/products?q=AUR-MER-42-SLV').set(auth);
    expect(demo.body.items[0].authState).toBe('not_scanned');
    const detail = await request(app).get(`/api/products/${demo.body.items[0].id}`).set(auth);
    const first = await verify({ payload: detail.body.activeLabel.qrPayload, scannerId: 'SCN-MIL-07' });
    expect(first.body.reasonCode).toBe('FIRST_SCAN');
  });
});
