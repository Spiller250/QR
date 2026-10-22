import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildQrPayload, generateVerificationToken, signToken } from '../server/lib/crypto';
import { parseAppKeys } from '../server/config';
import { FLUTTER_KEY, SIGNING_SECRET, sampleProduct, setup, tokenOf } from './helpers';

async function withProduct() {
  const env = await setup();
  const created = await request(env.app).post('/api/products').set(env.auth).send(sampleProduct);
  return { ...env, productId: created.body.id as string, payload: created.body.activeLabel.qrPayload as string };
}

describe('signed QR payloads', () => {
  it('accepts a correctly signed payload', async () => {
    const { verify, payload } = await withProduct();
    expect(payload).toBe(buildQrPayload(tokenOf(payload), SIGNING_SECRET));
    const res = await verify({ payload, scannerId: 'SCN-MIL-07' });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('authentic');
  });

  it('rejects a tampered signature with BAD_SIGNATURE and discloses nothing', async () => {
    const { verify, payload } = await withProduct();
    const sig = payload.split('.')[2];
    const tampered = payload.slice(0, -sig.length) + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const res = await verify({ payload: tampered });
    expect(res.body).toMatchObject({ result: 'invalid', reasonCode: 'BAD_SIGNATURE', product: null, scan: null });
  });

  it('rejects a modified token (signature no longer matches) with BAD_SIGNATURE', async () => {
    const { verify, payload } = await withProduct();
    const token = tokenOf(payload);
    const changed = token.slice(0, 5) + (token[5] === 'Q' ? 'R' : 'Q') + token.slice(6);
    const res = await verify({ payload: payload.replace(token, changed) });
    expect(res.body.reasonCode).toBe('BAD_SIGNATURE');
  });

  it('rejects payloads forged with a guessed secret', async () => {
    const { verify } = await withProduct();
    const res = await verify({ payload: buildQrPayload(generateVerificationToken(), 'guessed-secret') });
    expect(res.body.reasonCode).toBe('BAD_SIGNATURE');
  });

  it('returns TOKEN_NOT_FOUND for a validly signed but unregistered token', async () => {
    const { verify } = await withProduct();
    const res = await verify({ payload: buildQrPayload(generateVerificationToken(), SIGNING_SECRET) });
    expect(res.body).toMatchObject({ result: 'invalid', reasonCode: 'TOKEN_NOT_FOUND', product: null });
  });

  it('rejects the retired URL format, even for a registered token', async () => {
    const { verify, payload } = await withProduct();
    const res = await verify({ payload: `http://localhost:5173/v/${tokenOf(payload)}` });
    expect(res.body).toMatchObject({ result: 'invalid', reasonCode: 'LEGACY_FORMAT', product: null });
    // A bare token without prefix and signature is also not accepted.
    const bare = await verify({ payload: tokenOf(payload) });
    expect(bare.body.reasonCode).toBe('MALFORMED_TOKEN');
  });

  it('produces 16-character signatures bound to the token', () => {
    const t = generateVerificationToken();
    expect(signToken(t, SIGNING_SECRET)).toHaveLength(16);
    expect(signToken(t, SIGNING_SECRET)).not.toBe(signToken(t, 'other-secret'));
  });
});

describe('authorized client applications (X-App-Key)', () => {
  it('rejects a request without an app key with 401 and does not record an event', async () => {
    const { app, auth, verify, payload } = await withProduct();
    const res = await verify({ payload }, null);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('APP_KEY_MISSING');
    expect(res.body.error.message).toMatch(/authorized VERIQ application/);
    const logs = await request(app).get('/api/verification-logs').set(auth);
    expect(logs.body.total).toBe(0);
  });

  it('rejects an unknown app key with 401', async () => {
    const { verify, payload } = await withProduct();
    const res = await verify({ payload }, 'some-third-party-scanner-key');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('APP_KEY_INVALID');
    expect(res.body).not.toHaveProperty('result');
  });

  it('records which client verified', async () => {
    const { app, auth, verify, payload, productId } = await withProduct();
    await verify({ payload, scannerId: 'SCN-BER-01' }, FLUTTER_KEY);
    const logs = await request(app).get(`/api/verification-logs?productId=${productId}`).set(auth);
    expect(logs.body.items[0].appClient).toBe('flutter-app');
  });

  it('parses APP_KEYS and rejects malformed entries', () => {
    const keys = parseAppKeys(' web-scanner:abcdefghijkl , flutter-app:mnopqrstuvwx ');
    expect([...keys.entries()]).toEqual([
      ['abcdefghijkl', 'web-scanner'],
      ['mnopqrstuvwx', 'flutter-app'],
    ]);
    expect(() => parseAppKeys('no-colon')).toThrow();
    expect(() => parseAppKeys('web:short')).toThrow();
  });
});
