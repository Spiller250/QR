/**
 * Full-chain copy-detection smoke test against running services (npm run dev + run-cdp.ps1):
 * renders the demo product's real label (same secret as the server), simulates an original
 * print, a photocopy, a screen photo and a blurry capture, and uploads each photo to
 * POST /api/verify-physical exactly like a phone would.
 *
 *   npx tsx scripts/cdp-smoke.ts [outDir]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config';
import { buildLabelModel, labelRects } from '../server/lib/cdp';
import { parsePayload } from '../shared/token';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const config = loadConfig();
const outDir = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'veriq-cdp-')));
const appKey = process.env.VITE_APP_KEY ?? '';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

async function main() {
  const login = await json<{ token: string }>(
    await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }) }),
  );
  const auth = { Authorization: `Bearer ${login.token}` };
  const list = await json<{ items: { id: string; name: string }[] }>(await fetch(`${API}/products?q=AUR-MER-42-SLV`, { headers: auth }));
  const product = await json<{ activeLabel: { qrPayload: string } | null }>(await fetch(`${API}/products/${list.items[0].id}`, { headers: auth }));
  const payload = product.activeLabel?.qrPayload;
  const parsed = payload ? parsePayload(payload) : null;
  if (!payload || parsed?.kind !== 'vq1') throw new Error('Demo product has no active label');

  // Ideal raster of the real label at 10 px per CDP cell (PGM, read by OpenCV).
  const model = buildLabelModel(payload, parsed.token, config.cdp);
  const pxPerMm = 10 / config.cdp.cellMm;
  const quiet = 4 * model.geometry.moduleMm;
  const size = Math.round((config.cdp.qrMm + 2 * quiet) * pxPerMm);
  const img = new Uint8Array(size * size).fill(255);
  for (const r of labelRects(model)) {
    const x0 = Math.round((r.x + quiet) * pxPerMm);
    const y0 = Math.round((r.y + quiet) * pxPerMm);
    const x1 = Math.round((r.x + r.w + quiet) * pxPerMm);
    const y1 = Math.round((r.y + r.h + quiet) * pxPerMm);
    for (let y = y0; y < y1; y++) img.fill(0, y * size + x0, y * size + x1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const labelPath = path.join(outDir, 'label.pgm');
  fs.writeFileSync(labelPath, Buffer.concat([Buffer.from(`P5\n${size} ${size}\n255\n`), Buffer.from(img)]));

  const py = path.resolve('cdp-service/.venv/Scripts/python.exe');
  const shots = JSON.parse(
    execFileSync(fs.existsSync(py) ? py : 'python', ['-m', 'tools.simulate_captures', labelPath, outDir], { cwd: path.resolve('cdp-service') }).toString(),
  ) as Record<string, string>;

  const expected: Record<string, string> = { original: 'authentic', photocopy: 'copy_suspected', screen: 'copy_suspected', blurry: 'unreadable' };
  let failures = 0;
  for (const [name, file] of Object.entries(shots)) {
    const form = new FormData();
    form.append('scannerId', 'SMOKE-TEST');
    form.append('image', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
    const res = await json<{ result: string; reasonCode: string; score: number | null; threshold: number }>(
      await fetch(`${API}/verify-physical`, { method: 'POST', headers: { 'X-App-Key': appKey }, body: form }),
    );
    const ok = res.result === expected[name];
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(9)} → ${res.result.padEnd(14)} ${res.reasonCode.padEnd(19)} score=${res.score ?? '—'} threshold=${res.threshold}`);
  }
  console.log(`\nSimulated photos: ${outDir}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
