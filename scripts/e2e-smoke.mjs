// End-to-end smoke test of the main user flows against a running `npm run dev`.
// Usage: node scripts/e2e-smoke.mjs [screenshotDir]
// Uses an installed Chromium-based browser (Edge or Chrome) via playwright-core.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const OUT = process.argv[2] ?? 'e2e-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const channel = process.env.E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const browser = await chromium.launch({ channel });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const shot = (name, full = true) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
const step = (msg) => console.log(`• ${msg}`);
const statValue = async (label) => {
  const card = page.locator('.stat', { hasText: label });
  return Number((await card.locator('.stat-value').innerText()).replace(/,/g, ''));
};

try {
  step('Sign in with demo credentials');
  await page.goto(`${BASE}/login`);
  await shot('01-login', false);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Overview' }).waitFor();
  await page.locator('.stat-value').first().waitFor();
  const attemptsBefore = await statValue('Verification attempts');
  const suspiciousBefore = await statValue('Suspicious repeat scans');
  await shot('02-overview');

  step('Product form validation + create product');
  await page.getByRole('link', { name: 'Products' }).first().click();
  await page.getByRole('button', { name: 'Add product' }).click();
  await page.getByRole('button', { name: 'Register & issue label' }).click();
  await page.getByText('Product name is required').waitFor();
  await shot('03-form-validation', false);
  const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;
  await page.getByPlaceholder('e.g. Meridian Chronograph 42 mm').fill('Aviator Pilot Watch 40 mm');
  await page.getByPlaceholder('AUR-MER-42-SLV').fill(sku);
  await page.getByPlaceholder('Aurelle Horlogerie (fictional)').fill('Test Fictional Watch Co.');
  await page.locator('select').filter({ hasText: 'Select a category' }).selectOption('Watches');
  await page.getByPlaceholder('B-2026-0917').fill('B-E2E-1');
  await page.getByRole('button', { name: 'Register & issue label' }).click();
  await page.getByRole('heading', { name: 'Aviator Pilot Watch 40 mm' }).waitFor();
  await page.locator('.qr-frame img').waitFor();
  await shot('04-product-detail');
  const productUrl = page.url();

  step('Product appears in list and search empty state works');
  await page.goto(`${BASE}/products?q=${sku}`);
  await page.getByText('Aviator Pilot Watch 40 mm').waitFor();
  await page.goto(`${BASE}/products?q=zzzz-no-match`);
  await page.getByText('No products match your filters').waitFor();

  step('Print label preview');
  await page.goto(productUrl);
  await page.getByRole('button', { name: 'Print label' }).click();
  await page.getByText('Print-ready label').waitFor();
  await shot('05-print-label', false);
  await page.keyboard.press('Escape');

  step('Live demo scenarios A–F');
  await page.goto(`${BASE}/demo`);
  await page.getByRole('button', { name: /First scan/ }).waitFor();
  const scenario = async (name, expectText, file) => {
    await page.getByRole('button', { name }).click();
    await page.locator('.result-hero h3', { hasText: expectText }).last().waitFor({ timeout: 20_000 });
    await page.waitForFunction(() => !document.querySelector('.scenario:disabled'));
    await shot(file);
  };
  await scenario(/First scan/, 'first verification', '06-demo-A-first');
  await scenario(/Repeated scan/, 'verification #2', '07-demo-B-repeat');
  await scenario(/Modified QR/, 'signature check failed', '08-demo-C-modified');
  await scenario(/Revoked QR/, 'label revoked', '09-demo-D-revoked');
  await scenario(/Copied QR/, 'unusual scan pattern', '10-demo-E-copied');
  const copyCompare = await page.getByText('Identical decoded payload').count();
  if (!copyCompare) throw new Error('Scenario E: copy did not decode to an identical payload');
  await page.getByRole('button', { name: /Regular camera/ }).click();
  await page.getByText('Rejected — not an authorized VERIQ app').waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => !document.querySelector('.scenario:disabled'));
  if (!(await page.getByText('APP_KEY_MISSING').count())) throw new Error('Scenario F: 401 APP_KEY_MISSING not shown');
  await shot('10b-demo-F-regular-camera');

  step('Repeat scan reaches the configured warning threshold');
  await page.getByRole('button', { name: /First scan/ }).click();
  await page.locator('.result-hero h3', { hasText: 'first verification' }).waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => !document.querySelector('.scenario:disabled'));
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Repeated scan/ }).click();
    await page.waitForFunction(() => !document.querySelector('.scenario:disabled') && document.querySelector('.result-hero'), null, { timeout: 20_000 });
  }
  await page.locator('.result-hero h3', { hasText: 'unusual scan pattern' }).waitFor();
  await page.getByText('HIGH_SCAN_COUNT —', { exact: false }).first().waitFor();

  step('Manual entry in authorized scanner');
  await page.getByRole('button', { name: 'Authorized scanner' }).click();
  await page.getByRole('button', { name: 'Manual' }).click();
  await page.getByPlaceholder('VQ1.xxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx').fill('not-a-real-token');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.locator('.result-hero h3', { hasText: 'unrecognised code' }).waitFor();
  await shot('11-scanner-manual');

  step('Logs and stats reflect new events');
  await page.goto(`${BASE}/logs?source=simulator`);
  await page.locator('table.table tbody tr').first().waitFor();
  await page.locator('table.table tbody tr').first().click();
  await page.getByRole('dialog', { name: 'Verification event' }).waitFor();
  await shot('12-logs-detail', false);
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/`);
  await page.locator('.stat-value').first().waitFor();
  const attemptsAfter = await statValue('Verification attempts');
  const suspiciousAfter = await statValue('Suspicious repeat scans');
  if (attemptsAfter < attemptsBefore + 10) throw new Error(`Attempts did not increase enough: ${attemptsBefore} → ${attemptsAfter}`);
  if (suspiciousAfter <= suspiciousBefore) throw new Error(`Suspicious count did not increase: ${suspiciousBefore} → ${suspiciousAfter}`);
  console.log(`  attempts ${attemptsBefore} → ${attemptsAfter}, suspicious ${suspiciousBefore} → ${suspiciousAfter}`);

  step('Labels carry signed, non-URL payloads; API rejects clients without an app key');
  const check = await page.evaluate(async () => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('veriq.session')}` };
    const list = await (await fetch('/api/qr-codes?status=active', { headers: auth })).json();
    const payload = list.items[0].qrPayload;
    const noKey = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) });
    const badKey = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Key': 'third-party-scanner-key' }, body: JSON.stringify({ payload }) });
    return { allSigned: list.items.every((i) => /^VQ1\.[\w-]{22}\.[\w-]{16}$/.test(i.qrPayload)), noKey: noKey.status, badKey: badKey.status };
  });
  if (!check.allSigned || check.noKey !== 401 || check.badKey !== 401) throw new Error(`Payload/app-key check failed: ${JSON.stringify(check)}`);

  step('Retired /v/ URLs show the official-app page');
  await page.goto(`${BASE}/v/AAAAAAAAAAAAAAAAAAAAAA`);
  await page.getByRole('heading', { name: 'Scan this label with the official VERIQ app' }).waitFor();
  await shot('13-legacy-url', false);

  step('Other pages render');
  for (const [p, name] of [['/qr-codes', '14-qr-codes'], ['/security', '15-security'], ['/settings', '16-settings']]) {
    await page.goto(`${BASE}${p}`);
    await page.locator('.page-head h1').waitFor();
    await page.waitForLoadState('networkidle');
    await shot(name);
  }

  step('Mobile layout: no horizontal page scroll');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [p, name] of [['/', 'm1-overview'], ['/products', 'm2-products'], ['/demo', 'm3-demo'], ['/logs', 'm4-logs'], ['/security', 'm5-security']]) {
    await page.goto(`${BASE}${p}`);
    await page.locator('.page-head h1').waitFor();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) throw new Error(`${p} overflows horizontally by ${overflow}px at 390px`);
    await shot(name);
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await shot('m6-nav-open', false);

  const relevantErrors = consoleErrors.filter((e) => !/401|Unauthorized|Failed to load resource/.test(e));
  if (relevantErrors.length) throw new Error(`Console errors:\n${relevantErrors.join('\n')}`);
  console.log(`\nAll E2E flows passed. Screenshots: ${path.resolve(OUT)}`);
} catch (err) {
  await shot('FAILURE', false).catch(() => {});
  console.error('\nE2E FAILED:', err.message);
  if (consoleErrors.length) console.error('Console errors:', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
