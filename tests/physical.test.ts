import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildLabelModel, cdpGrid, gridToBits, labelGeometry, renderLabelSvg } from '../server/lib/cdp';
import type { CdpAnalyzeParams, CdpClient, CdpImage } from '../server/lib/cdpClient';
import { FLUTTER_KEY, WEB_KEY, sampleProduct, setup, tokenOf } from './helpers';

/**
 * Mock of the Python CDP service. The uploaded "image" is text: `<scenario>|<qr payload>`.
 *   original → score 0.91, copy → 0.31, screen → 0.22, blurry → CAPTURE_TOO_BLURRY, noqr → NO_QR_FOUND
 */
function mockCdp() {
  const calls = { decode: 0, analyze: [] as CdpAnalyzeParams[] };
  const read = (img: CdpImage) => {
    const [scenario, payload] = img.buffer.toString('utf8').split('|');
    return { scenario, payload };
  };
  const client: CdpClient = {
    health: async () => ({ online: true }),
    decode: async (img) => {
      calls.decode++;
      const { scenario, payload } = read(img);
      if (scenario === 'noqr') return { status: 'unreadable', reasonCode: 'NO_QR_FOUND', decoded: null, diagnostics: {} };
      return { status: 'ok', reasonCode: null, decoded: payload, diagnostics: { qrSidePx: 900 } };
    },
    analyze: async (img, params) => {
      calls.analyze.push(params);
      const { scenario, payload } = read(img);
      const diagnostics = { pixelsPerCell: 4.6, blurCells: 0.6, sharpness: 0.8 };
      if (scenario === 'blurry') return { status: 'unreadable', reasonCode: 'CAPTURE_TOO_BLURRY', decoded: payload, diagnostics: { ...diagnostics, blurCells: 2.1 } };
      const score = { original: 0.91, copy: 0.31, screen: 0.22 }[scenario] ?? 0;
      return { status: 'ok', reasonCode: null, decoded: payload, diagnostics, score, components: { cellCorrelation: 0.98 } };
    },
  };
  return { client, calls };
}

async function withLabel() {
  const mock = mockCdp();
  const env = await setup({ cdpClient: mock.client });
  const created = await request(env.app).post('/api/products').set(env.auth).send(sampleProduct);
  const payload = created.body.activeLabel.qrPayload as string;
  const upload = (scenario: string, opts: { payload?: string; key?: string | null; scannerId?: string } = {}) => {
    const req = request(env.app).post('/api/verify-physical');
    if (opts.key !== null) req.set('X-App-Key', opts.key ?? WEB_KEY);
    return req
      .field('scannerId', opts.scannerId ?? 'PHONE-1')
      .attach('image', Buffer.from(`${scenario}|${opts.payload ?? payload}`), { filename: 'photo.jpg', contentType: 'image/jpeg' });
  };
  return { ...env, ...mock, productId: created.body.id as string, payload, upload };
}

describe('POST /api/verify-physical', () => {
  it('accepts an original print and logs a physical check', async () => {
    const { app, auth, upload, calls, payload, productId } = await withLabel();
    const res = await upload('original');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: 'authentic', reasonCode: 'CDP_MATCH', score: 0.91, threshold: 0.6 });
    expect(res.body.product.name).toBe(sampleProduct.name);
    expect(res.body.scan.scanNumber).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(tokenOf(payload));

    // Express sent the template derived from this label's token and the expected payload.
    const sent = calls.analyze[0];
    expect(sent.expectedPayload).toBe(payload);
    expect(sent.grid).toBe(gridToBits(cdpGrid(tokenOf(payload), 'test-cdp-secret', 40)));
    expect(sent).toMatchObject({ gridSize: 40, qrModules: 37, clearModules: 11 });

    const logs = await request(app).get(`/api/verification-logs?productId=${productId}`).set(auth);
    expect(logs.body.items[0]).toMatchObject({ result: 'authentic', checkType: 'physical', cdpScore: 0.91, cdpThreshold: 0.6, appClient: 'web-scanner' });
  });

  it('flags a photocopy or screen photo as copy_suspected', async () => {
    const { app, auth, upload, productId } = await withLabel();
    const copy = await upload('copy', { scannerId: 'PHONE-2' });
    expect(copy.body).toMatchObject({ result: 'copy_suspected', reasonCode: 'CDP_DEGRADED', score: 0.31 });
    const screen = await upload('screen', { scannerId: 'PHONE-2' });
    expect(screen.body.result).toBe('copy_suspected');
    const product = await request(app).get(`/api/products/${productId}`).set(auth);
    expect(product.body.authState).toBe('flagged');
    const stats = await request(app).get('/api/stats/overview').set(auth);
    expect(stats.body.resultBreakdown.copy_suspected).toBe(2);
  });

  it('reports unreadable captures instead of guessing, without disclosing the product', async () => {
    const { upload } = await withLabel();
    const blurry = await upload('blurry');
    expect(blurry.body).toMatchObject({ result: 'unreadable', reasonCode: 'CAPTURE_TOO_BLURRY', score: null, product: null });
    expect(blurry.body.diagnostics.blurCells).toBe(2.1);
    const noqr = await upload('noqr');
    expect(noqr.body).toMatchObject({ result: 'unreadable', reasonCode: 'NO_QR_FOUND', product: null });
  });

  it('rejects forged payloads (BAD_SIGNATURE) before asking for a CDP score', async () => {
    const { upload, payload, calls } = await withLabel();
    const sig = payload.split('.')[2];
    const forged = payload.slice(0, -sig.length) + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const res = await upload('original', { payload: forged });
    expect(res.body).toMatchObject({ result: 'invalid', reasonCode: 'BAD_SIGNATURE', product: null, score: null });
    expect(calls.analyze).toHaveLength(0);
  });

  it('treats revoked labels as invalid', async () => {
    const { app, auth, upload, productId } = await withLabel();
    await request(app).post(`/api/products/${productId}/reissue-token`).set(auth).send({});
    const res = await upload('original');
    expect(res.body).toMatchObject({ result: 'invalid', reasonCode: 'TOKEN_REVOKED', product: null });
  });

  it('requires an authorized app key and an image', async () => {
    const { app, upload, calls } = await withLabel();
    const noKey = await upload('original', { key: null });
    expect(noKey.status).toBe(401);
    expect(noKey.body.error.code).toBe('APP_KEY_MISSING');
    expect((await upload('original', { key: 'unknown-key-123456' })).status).toBe(401);
    expect(calls.decode).toBe(0);
    const noImage = await request(app).post('/api/verify-physical').set('X-App-Key', FLUTTER_KEY).field('scannerId', 'x');
    expect(noImage.status).toBe(400);
    expect(noImage.body.error.code).toBe('IMAGE_REQUIRED');
  });

  it('uses the threshold configured in Settings', async () => {
    const { app, auth, upload } = await withLabel();
    expect((await request(app).put('/api/settings/cdp').set(auth).send({ threshold: 0.95 })).status).toBe(200);
    const res = await upload('original');
    expect(res.body).toMatchObject({ result: 'copy_suspected', threshold: 0.95 });
    const settings = await request(app).get('/api/settings').set(auth);
    expect(settings.body.cdp).toMatchObject({ threshold: 0.95, defaultThreshold: 0.6, gridSize: 40, cellMm: 0.15 });
  });

  it('returns 503 when the analysis service is down', async () => {
    const env = await setup({ cdpServiceUrl: 'http://127.0.0.1:9' });
    const created = await request(env.app).post('/api/products').set(env.auth).send(sampleProduct);
    const res = await request(env.app)
      .post('/api/verify-physical')
      .set('X-App-Key', WEB_KEY)
      .attach('image', Buffer.from(`original|${created.body.activeLabel.qrPayload}`), { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CDP_SERVICE_UNAVAILABLE');
  });

  it('keeps /api/verify working unchanged', async () => {
    const { verify, payload } = await withLabel();
    const res = await verify({ payload });
    expect(res.body).toMatchObject({ result: 'authentic', reasonCode: 'FIRST_SCAN' });
  });
});

describe('calibration', () => {
  it('stores tagged samples, suggests a midpoint threshold and does not log verifications', async () => {
    const { app, auth, payload } = await withLabel();
    const add = (scenario: string, tag: string) =>
      request(app)
        .post('/api/calibration/samples')
        .set(auth)
        .field('tag', tag)
        .attach('image', Buffer.from(`${scenario}|${payload}`), { filename: `${scenario}.jpg`, contentType: 'image/jpeg' });
    await add('original', 'original');
    await add('copy', 'photocopy');
    const last = await add('screen', 'screen');
    expect(last.status).toBe(201);
    expect(last.body.items).toHaveLength(3);
    expect(last.body.suggestion).toEqual({ threshold: 0.61, lowestOriginal: 0.91, highestCopy: 0.31, separable: true });

    const logs = await request(app).get('/api/verification-logs').set(auth);
    expect(logs.body.total).toBe(0);

    const bad = await request(app).post('/api/calibration/samples').set(auth).field('tag', 'nope').attach('image', Buffer.from('x'), 'x.jpg');
    expect(bad.status).toBe(400);
    const del = await request(app).delete(`/api/calibration/samples/${last.body.id}`).set(auth);
    expect(del.body.items).toHaveLength(2);
    expect((await request(app).get('/api/calibration/samples')).status).toBe(401);
  });
});

describe('CDP label generation', () => {
  it('derives a deterministic, token-specific grid and keeps the overlay within limits', () => {
    const a = cdpGrid('tokenAAAAAAAAAAAAAAAAA', 's', 40);
    expect(a).toEqual(cdpGrid('tokenAAAAAAAAAAAAAAAAA', 's', 40));
    expect(gridToBits(a)).not.toBe(gridToBits(cdpGrid('tokenBBBBBBBBBBBBBBBBB', 's', 40)));
    expect(gridToBits(a)).not.toBe(gridToBits(cdpGrid('tokenAAAAAAAAAAAAAAAAA', 'other', 40)));
    const ones = a.reduce((n, b) => n + b, 0);
    expect(ones).toBeGreaterThan(700);
    expect(ones).toBeLessThan(900);

    const g = labelGeometry(37, { gridSize: 40, cellMm: 0.15, qrMm: 30 });
    expect(g).toMatchObject({ clearModules: 11, patternMm: 6 });
    expect(g.coverage).toBeLessThanOrEqual(0.12);
    expect(() => labelGeometry(37, { gridSize: 64, cellMm: 0.3, qrMm: 30 })).toThrow(/covers/);
  });

  it('renders an exact-size vector label and a print PDF', async () => {
    const { app, auth, productId, payload } = await withLabel();
    const svg = await request(app).get(`/api/products/${productId}/label.svg`).set(auth).buffer(true).parse((res, cb) => {
      let d = '';
      res.on('data', (c: Buffer) => (d += c.toString()));
      res.on('end', () => cb(null, d));
    });
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.body).toMatch(/^<svg[^>]+width="36\.4865mm"/);
    expect(svg.body).toContain('shape-rendering="crispEdges"');

    const model = buildLabelModel(payload, tokenOf(payload), { secret: 'test-cdp-secret', serviceUrl: '', defaultThreshold: 0.6, gridSize: 40, cellMm: 0.15, qrMm: 30 });
    expect(svg.body).toBe(renderLabelSvg(model, { name: sampleProduct.name, publicId: (await request(app).get(`/api/products/${productId}`).set(auth)).body.publicId, line2: 'Batch B-1' }));

    const pdf = await request(app).get(`/api/products/${productId}/label.pdf`).set(auth).buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(`/api/products/${productId}/label.pdf`)).status).toBe(401);
  });
});
