# VERIQ — Product Authentication (Proof of Concept)

A working proof of concept for QR-based product authentication. It includes:

- Unique per-item labels carrying a **signed, non-URL QR payload**
- A brand-owner dashboard
- A verification API that answers **only authorized client applications**
- Scan history and repeat-scan detection
- An interactive simulator that shows what a QR-based system **can** and **cannot** prove
- A **Copy Detection Pattern (CDP)**: a microscopic random pattern printed inside each QR code. A Python/OpenCV service scores phone photos so that the original printed label passes while photocopies, re-prints of photos and photos of screens are flagged — see [Physical label verification](#physical-label-verification-copy-detection-pattern)

> **All brands, products and scan events are fictional demonstration data.** Operator authentication is demo-only (see [Limitations](#limitations)).

Mobile developers: see **[docs/API_FOR_MOBILE.md](docs/API_FOR_MOBILE.md)** for the payload format and the verify API.

---

## Quick start

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite`, nothing native to compile; tested on Node 24) and, for physical label checks, **Python 3.11+** (tested on 3.13).

```powershell
# Terminal 1 — copy-detection analysis service (creates cdp-service.venv on first run)
powershell -ExecutionPolicy Bypass -File cdp-serviceun-cdp.ps1      # http://127.0.0.1:8100

# Terminal 2 — API + dashboard
npm install
copy .env.example .env      # demo defaults; generate real secrets/keys for anything shared
npm run dev                 # API on :4000, web app on :5173   (npm run dev:lan to allow phones on the Wi-Fi)
```

The dashboard works without the Python service; only `/api/verify-physical` and Calibration need it (they return `503 CDP_SERVICE_UNAVAILABLE` otherwise).

Open **http://localhost:5173** and sign in with the pre-filled demo operator:

| Email | Password |
|---|---|
| `operator@veriq.demo` | `veriq-demo-2026` |

The database is created at `data/veriq.db` and seeded on first start. Existing databases are migrated automatically (see [Persistence](#key-design-decisions)).

> `VITE_APP_KEY` must equal the `web-scanner` key in `APP_KEYS`. Otherwise the built-in scanner gets `401` and the Live Demo shows a configuration warning. Restart `npm run dev` after changing `.env`.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API (tsx watch) + Vite dev server with `/api` proxy |
| `npm run dev:lan` | Same, but the web app also listens on your LAN IP so a phone on the same Wi-Fi can open `/scan-physical` |
| `npm run cdp` / `npm run cdp:test` | Start the Python CDP service / run its pytest suite (both via `cdp-serviceun-cdp.ps1`) |
| `npx tsx scripts/cdp-smoke.ts [dir]` | Full-chain check with both services running: renders the demo product's real label, simulates original / photocopy / screen / blurry photos and uploads them to `/api/verify-physical` |
| `npm run build` | Type-check client and server, build the SPA to `dist/` |
| `npm start` | Production mode: API also serves `dist/` on `:4000` |
| `npm run reset` | Wipe and re-seed the demo data (also available in **Settings → Reset demo data**) |
| `npm run typecheck` / `npm run lint` / `npm test` | Static checks and the Vitest suite (rules, payload signing, app keys, migration, API flows) |
| `npm run check` | All three of the above |
| `node scripts/e2e-smoke.mjs [dir]` | Browser end-to-end smoke test against a running `npm run dev` (uses installed Edge/Chrome via `playwright-core`; `E2E_CHANNEL=chrome` to switch). Set `CDP_PHOTOS=<dir>` with the CDP service running to include label PDF, calibration and phone-capture steps |

### Scanning a real label

Labels contain `VQ1.<token>.<signature>` as **plain text**. A phone's regular camera app shows that text and offers nothing to open. To verify a printed or on-screen label, use an authorized client:

- **Live Demo → Authorized scanner** in this web app. It supports camera (HTTPS or `localhost` only), image upload (e.g. a downloaded label PNG), or pasting the payload.
- The **Flutter app** (to be built), following [docs/API_FOR_MOBILE.md](docs/API_FOR_MOBILE.md).

---

## Architecture

```
┌───────────────────────── Browser (React + TS, Vite) ─────────────────────────┐
│  Operator dashboard (session auth)        Live Demo / Authorized scanner     │
│  Overview · Products · QR Codes · Logs    (client "web-scanner",             │
│  Security · Settings                       sends X-App-Key = VITE_APP_KEY)   │
│                                           /v/* → "use the official app" page │
└──────────────┬──────────────────────────────────────┬────────────────────────┘
               │ Bearer session                       │ POST /api/verify + X-App-Key
               │                    Flutter app ──────┤ (client "flutter-app")
┌──────────────▼──────────────────────────────────────▼────────────────────────┐
│ Express API (server/)                                                        │
│  middleware/appKey.ts  401 unless X-App-Key matches APP_KEYS                 │
│  services/verification.ts  parse VQ1 → constant-time signature check →       │
│                            HMAC registry lookup → status → repeat-scan rules │
│  services/labels.ts  issue / reissue / revoke      store.ts  SQL repository  │
│  db.ts  SQLite (node:sqlite), WAL, versioned migrations                      │
└──────────────────────────────────────────────────────────────────────────────┘
shared/  types, constants, Zod schemas, payload parser (token.ts) for client + server

Phone (/scan-physical) ── POST /api/verify-physical (photo, X-App-Key) ──► Express
   Express ── /decode, /analyze (multipart, localhost only) ──► cdp-service (FastAPI + OpenCV, :8100)
```

| Folder | Contents |
|---|---|
| `shared/` | Domain types, constants, Zod schemas, QR payload parsing (`token.ts`). The same product schema validates the form in the browser and the API request. |
| `server/` | `config.ts` (env, `APP_KEYS` parsing), `db.ts` (schema + migrations), `store.ts` (all SQL), `lib/crypto.ts` (tokens, HMAC, payload signing), `services/`, `routes/`, `middleware/` (operator auth, app key, errors), `seed.ts`. |
| `src/` | `api/` (fetch client + React Query hooks), `components/` (UI kit, QR/label, chart, demo simulator, scanner), `pages/`, `styles/global.css`. |
| `tests/` | Vitest: rule engine and payload parsing, signing and app-key tests, a migration test, and supertest API flows. |
| `docs/` | `API_FOR_MOBILE.md`, the integration guide for the Flutter developer. |
| `cdp-service/` | Python copy-detection service: `app/analysis.py` (QR detection, rectification, scoring), `app/main.py` (FastAPI), `tests/` (synthetic print/copy/screen tests), `tools/simulate_captures.py`, `run-cdp.ps1`. |
| `scripts/` | Browser end-to-end smoke test. |

### Key design decisions

- **QR payload (`VQ1.<token>.<sig>`).**
  - `token` is 16 bytes from `crypto.randomBytes`, base64url-encoded (22 chars).
  - `sig` is the first 16 base64url chars (96 bits) of `HMAC-SHA256(QR_SIGNING_SECRET, "VQ1." + token)`.
  - The payload is deliberately **not a URL**, so third-party camera apps show text only.
  - Signing happens server-side only. Clients never hold `QR_SIGNING_SECRET`, which is separate from `TOKEN_HASH_SECRET`.
- **Verification order.** `/api/verify` processes each request in this order:
  1. Rejects requests without a valid `X-App-Key` (`401`, nothing logged).
  2. Parses the payload.
  3. Checks the signature with `crypto.timingSafeEqual` **before any database lookup**. Mismatches return `invalid` / `BAD_SIGNATURE`.
  4. Looks up the token by `HMAC-SHA256(TOKEN_HASH_SECRET, token)`, then checks label status and runs the repeat-scan rules.

  Retired `…/v/<token>` URLs return `invalid` / `LEGACY_FORMAT`. Other input returns `MALFORMED_TOKEN`.
- **Authorized clients.** `APP_KEYS` lists `client-id:key` pairs. Every configured key is compared in constant time. The resolved client ID is stored per scan (`verification_events.app_client`) and shown in logs, the event drawer and CSV export.
  - **A key in a web bundle or app binary is not truly secret.** It identifies the client; it does not prove it. The production Flutter app should use its own key **plus app attestation** (Google Play Integrity / Apple App Attest), with server-side attestation checks and key rotation.
- **Public ID vs. secret token.** Each product has a human-readable public ID (`VQ-XXXX-XXXX`), which is printed in plain text and is not a credential. The secret token lives only inside the signed payload.
- **Token storage.** The plaintext of *active* tokens is kept so operators can re-download labels in this POC. It is **wiped on revocation**. In production, labels would be rendered once at print time and only the HMAC stored.
- **Minimal disclosure.** `/api/verify` never returns tokens or payloads. Unknown, forged and revoked codes return no product data. Logs store a 10-hex-character HMAC fingerprint, never the presented value.
- **Repeat-scan rules are heuristics.** A repeat scan by itself is *not* treated as counterfeit. A scan is marked `suspicious` only when an enabled rule exceeds its configured limit:

  | Rule | Default | Triggers when |
  |---|---|---|
  | `HIGH_SCAN_COUNT` | 4 | the token has been verified more than N times |
  | `MULTIPLE_DEVICES` | 3 | more than N distinct scanners within the window |
  | `MULTIPLE_LOCATIONS` | 2 | more than N distinct locations within the window |
  | `RAPID_DEVICE_SWITCH` | 30 min | a different scanner presents the token within N minutes of the previous scan |

  Window: 72 h. All values are editable in **Settings**.
- **Persistence.** SQLite file (`DATABASE_PATH`, default `data/veriq.db`) in WAL mode. It survives restarts. Schema changes are versioned migrations tracked with `PRAGMA user_version`; v2 adds `verification_events.app_client` to existing databases in place. To reset, use `npm run reset`, **Settings → Reset demo data**, or delete `data/veriq.db*` while the API is stopped.
- **Seed data.** The seeded scan history is generated by replaying signed payloads through the real verification engine with past timestamps. It covers authentic and flagged scans, revoked labels, forged signatures, a validly signed but unregistered token, a retired URL label, and an unrelated barcode.

### Environment variables (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | demo values | Single demo operator |
| `TOKEN_HASH_SECRET` | dev default (warns) | HMAC key for the token lookup hash |
| `QR_SIGNING_SECRET` | dev default (warns) | HMAC key for QR payload signatures. Must differ from `TOKEN_HASH_SECRET` (warns if equal). **Changing it invalidates every printed label.** |
| `APP_KEYS` | `web-scanner:dev-web-scanner-key,flutter-app:dev-flutter-app-key` | Authorized verification clients as `client-id:key,…` (keys ≥ 12 chars). Empty means every verify call is rejected. |
| `VITE_APP_KEY` | `dev-web-scanner-key` | Key the built-in web scanner sends. Exposed in the browser bundle; must match the `web-scanner` entry. |
| `DATABASE_PATH` | `./data/veriq.db` | SQLite file |
| `VERIFY_RATE_LIMIT_PER_MINUTE` | `60` | Per-IP limit on `/api/verify` and `/api/verify-physical` (login is fixed at 10/min) |
| `CDP_SECRET` | dev default (warns) | HMAC key deriving each label's copy-detection pattern. **Changing it invalidates every printed pattern.** |
| `CDP_SERVICE_URL` | `http://127.0.0.1:8100` | Internal Python analysis service |
| `CDP_THRESHOLD` | `0.6` | Default decision threshold (Settings/Calibration override it; stored in SQLite) |
| `CDP_GRID_SIZE` / `CDP_CELL_MM` / `LABEL_QR_MM` | `40` / `0.15` / `30` | Pattern cells per side, cell size and printed QR size. The overlay must stay ≤ 12% of the QR area (startup error otherwise). Re-print labels after changing. |

Generate secrets and keys with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. `.env` and `data/*.db` are git-ignored.

---

## API reference

Base path `/api`. Every response is JSON. Errors have the shape `{ "error": { "code", "message", "fields?" } }`. Operator endpoints need `Authorization: Bearer <session token>`.

### Verification (authorized client apps only)

**`POST /api/verify`** (requires `X-App-Key`; rate-limited)

```http
POST /api/verify
Content-Type: application/json
X-App-Key: <client key>

{ "payload": "VQ1.s1yQm3k0Xr7bT9cVwLqKQA.7RDp2xM_fK0aZ1nQ", "scannerId": "SCN-MIL-07", "location": "Milan, IT", "source": "camera" }
```

`payload` is the raw QR content. `scannerId` and `location` are optional and self-reported. `source` is one of `simulator | camera | manual`.

```json
{
  "eventId": "evt_kFq238jN7bSN",
  "checkedAt": "2026-10-22T18:01:44.425Z",
  "result": "suspicious",
  "reasonCode": "SUSPICIOUS_PATTERN",
  "message": "Registered label, but the scan pattern matches one or more anomaly rules…",
  "product": { "publicId": "VQ-E25A-BV7J", "name": "Meridian Chronograph 42 mm", "manufacturer": "Aurelle Horlogerie (fictional)",
               "category": "Watches", "batchNumber": "B-2026-0917", "productionDate": "2026-09-17", "status": "active" },
  "scan": {
    "scanNumber": 2, "repeatScan": true, "firstVerifiedAt": "2026-10-22T18:01:41.553Z", "flagged": true,
    "rulesTriggered": ["RAPID_DEVICE_SWITCH"],
    "rules": [{ "code": "RAPID_DEVICE_SWITCH", "triggered": true, "observed": 0, "threshold": 30, "description": "…" }]
  }
}
```

| HTTP / `result` | `reasonCode` | Product disclosed |
|---|---|---|
| 200 `authentic` | `FIRST_SCAN`, `REPEAT_SCAN`, `PRODUCT_RECALLED`, `PRODUCT_INACTIVE` | yes |
| 200 `suspicious` | `SUSPICIOUS_PATTERN` | yes, with warning |
| 200 `invalid` | `BAD_SIGNATURE` (modified or forged), `MALFORMED_TOKEN`, `LEGACY_FORMAT` (old URL label), `TOKEN_NOT_FOUND` (valid signature, unknown token) | no (`product: null`, `scan: null`) |
| 200 `revoked` | `TOKEN_REVOKED` | no |
| 401 | `APP_KEY_MISSING`, `APP_KEY_INVALID`; not logged | no |

More examples, including `BAD_SIGNATURE` and `401`, are in [docs/API_FOR_MOBILE.md](docs/API_FOR_MOBILE.md).

**`POST /api/verify-physical`** (requires `X-App-Key`; rate-limited; needs the CDP service)

`multipart/form-data` with `image` (the original JPEG/PNG from the camera, ≤ 20 MB) and optional `scannerId`, `location`, `source`. Flow: decode QR from the photo (Python) → same VQ1 signature/registry checks as `/api/verify` → CDP score (Python) → threshold → logged event (`checkType: "physical"`, score and threshold stored).

```json
{
  "eventId": "evt_…", "checkedAt": "…", "result": "authentic", "reasonCode": "CDP_MATCH",
  "message": "Original label: the copy-detection pattern matches a first-generation print.",
  "score": 0.94, "threshold": 0.6,
  "product": { "publicId": "VQ-…", "name": "Meridian Chronograph 42 mm", "…": "…" },
  "scan": { "scanNumber": 3, "repeatScan": true, "rulesTriggered": [] },
  "components": { "cellCorrelation": 0.98, "pixelCorrelation": 0.89, "isolatedContrast": 0.87, "hfScore": 1, "…": 0 },
  "diagnostics": { "pixelsPerCell": 4.6, "blurCells": 0.62, "sharpness": 0.77, "imageWidth": 4000, "imageHeight": 3000, "bytes": 3145728 }
}
```

| `result` | `reasonCode` | Product disclosed |
|---|---|---|
| `authentic` | `CDP_MATCH` (score ≥ threshold) | yes |
| `copy_suspected` | `CDP_DEGRADED` (score < threshold) | yes (the token is genuine; the physical label is not) |
| `unreadable` | `NO_QR_FOUND`, `CAPTURE_TOO_BLURRY`, `CAPTURE_TOO_FAR`, `UNSUPPORTED_IMAGE`, `PAYLOAD_MISMATCH` — retake the photo; no score | no |
| `invalid` | `BAD_SIGNATURE`, `MALFORMED_TOKEN`, `LEGACY_FORMAT`, `TOKEN_NOT_FOUND`, `TOKEN_REVOKED` | no |

Errors: `400 IMAGE_REQUIRED`, `413 IMAGE_TOO_LARGE`, `401 APP_KEY_*`, `503 CDP_SERVICE_UNAVAILABLE`.

**Auth:** `POST /api/auth/login` `{ email, password }` → `{ token, operator, expiresInSeconds }` · `GET /api/auth/me` · `POST /api/auth/logout`

### Operator (Bearer session)

| Method & path | Description |
|---|---|
| `GET /api/products?q=&category=&status=&authState=&sort=&page=&pageSize=` | Paginated list. `authState` ∈ `verified, not_scanned, flagged, no_active_label`. `sort` ∈ `created_desc, created_asc, name_asc, name_desc, scans_desc` |
| `POST /api/products` | Create a product and issue its first label → `201` product detail. `409 DUPLICATE_SKU`, `400 VALIDATION_ERROR` with `fields` |
| `GET /api/products/:id` | Detail incl. `activeLabel` (with signed `qrPayload`), `labelHistory` (revoked labels have `qrPayload: null`), `recentEvents` |
| `PATCH /api/products/:id` | Partial update (same validation) |
| `POST /api/products/:id/reissue-token` | `{ reason? }` → revoke current + issue new (atomic) |
| `POST /api/products/:id/revoke-token` | `{ reason? }` → revoke without replacement (`409 NO_ACTIVE_LABEL`) |
| `POST /api/products/:id/issue-token` | Issue a label when none is active (`409 LABEL_EXISTS`) |
| `GET /api/qr-codes?status=active\|revoked&q=` | All labels across products |
| `GET /api/verification-logs?q=&result=&flagged=&productId=&source=&page=&pageSize=` | Paginated events (each includes `appClient`) |
| `GET /api/verification-logs/:id` | Single event |
| `GET /api/verification-logs/export.csv?…` | CSV export with the same filters, incl. `app_client` (formula-injection safe) |
| `GET /api/stats/overview` | Dashboard counters, 14-day series, recent events |
| `GET /api/settings` · `PUT /api/settings/rules` | Rules, payload format, authorized client IDs (never keys), CDP settings + service status, LAN addresses |
| `PUT /api/settings/cdp` | `{ threshold: 0..1 }` — CDP decision threshold |
| `GET /api/products/:id/label.svg[?variant=pattern]` | Print-ready vector label (QR + CDP) at exact mm size, or a zoomed pattern view |
| `GET /api/products/:id/label.pdf` | A4 sheet: label at 100%, 10 mm calibration ruler, print instructions |
| `GET /api/calibration/samples` · `POST` (multipart `image` + `tag` = `original|photocopy|screen`) · `DELETE /:id` · `DELETE` | Calibration samples (scores/diagnostics only) + suggested threshold |
| `POST /api/admin/reset-demo` | Wipe and re-seed demo data |

Example: create a product, then verify its label as the Flutter app.

```bash
TOKEN=$(curl -s localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"operator@veriq.demo","password":"veriq-demo-2026"}' | jq -r .token)

PAYLOAD=$(curl -s localhost:4000/api/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "name":"Aviator Pilot Watch 40 mm","sku":"AVI-40-BLK","manufacturer":"Test Fictional Watch Co.",
  "category":"Watches","batchNumber":"B-1","productionDate":"2026-09-01","status":"active"}' | jq -r .activeLabel.qrPayload)

curl -s localhost:4000/api/verify -H 'Content-Type: application/json' -H "X-App-Key: <flutter-app key>" \
  -d "{\"payload\":\"$PAYLOAD\",\"scannerId\":\"SCN-BER-01\"}"
```

---

## Physical label verification (Copy Detection Pattern)

### How it works

1. **Pattern.** Each label gets a 40 × 40 random binary grid derived from `HMAC-SHA256(CDP_SECRET, token)`. Nothing is stored; the grid is regenerated from the token. At 0.15 mm per cell the pattern is 6 mm square.
2. **Embedding.** The QR code is generated with error correction **H**. The centre is cleared (11 × 11 modules for the 30 mm, 37-module code, i.e. **8.8 %** of the symbol, under the 12 % limit) and the pattern is drawn there with a one-module white border. The code still decodes because level H tolerates ~30 % damage.
3. **Printing.** The dashboard renders the label as vector SVG/PDF (every module and cell is a `<rect>`, `crispEdges`) at exact physical size.
4. **Analysis** (`cdp-service`, FastAPI + OpenCV):
   - **Find the code.** Detect the QR (OpenCV, falling back to WeChat) and use its four corners to compute a homography.
   - **Rectify.** Resample the centre to 8 px per cell, normalise local illumination, then align the expected template (sub-module translation and scale search, plus 90° rotations).
   - **Score** (0..1), as `cellCorrelation × (0.5·isolatedContrast + 0.3·pixelCorrelation + 0.2·hfScore)`:
     - **cellCorrelation:** per-cell correlation with the template, which gates the score (a wrong or missing pattern gives about 0).
     - **pixelCorrelation:** sub-cell correlation, i.e. edge fidelity.
     - **isolatedContrast:** contrast of isolated cells relative to cells in uniform blocks. Copying smears single cells first.
     - **hfScore:** high-frequency (Laplacian) energy of the pattern relative to the QR modules.
   - **Gate on capture quality:** too blurry (edge spread > 1.35 cells) or too far (< 2.2 px per cell) returns `unreadable` instead of a guess.
5. **Decision** in Express: `score ≥ threshold` → **Original**, otherwise **Copy suspected**. The threshold defaults to `CDP_THRESHOLD` and is tuned on the Calibration page.

On synthetic tests (`cdp-service/tests`) originals score ~0.92–0.99, simulated photocopies ~0.25–0.32 and screen photos ~0.22. Real-world numbers depend on your printer and phone. **Calibrate before the demo.**

### Run both services on Windows

```powershell
# Terminal 1 (from the repo root)
powershell -ExecutionPolicy Bypass -File cdp-service\run-cdp.ps1          # add -Test to run pytest
# Terminal 2
npm run dev:lan
```

Check: open http://localhost:8100/health (Python) and **Settings → Copy detection** (shows "online").

### Open the scan page from a phone (same Wi-Fi)

1. Find the PC's Wi-Fi IP: `ipconfig` → "Wireless LAN adapter Wi-Fi → IPv4 Address" (e.g. `192.168.1.20`). **Live Demo → Authorized scanner** also shows the link and a QR code for it.
2. On the phone open **http://192.168.1.20:5173/scan-physical**.
3. If it does not load, allow Node.js through Windows Defender Firewall for **Private** networks (Windows asks on first run of `npm run dev:lan`), and make sure the Wi-Fi profile is set to *Private*.

The page uses `<input type="file" accept="image/*" capture="environment">`, so it works over plain HTTP (no camera-permission API) and uploads the original full-resolution file without resizing.

### Printing

- Product page → **Download print PDF** → print at **100 % / Actual size** (disable "Fit to page"), **laser printer**, highest quality, plain white paper or matte label stock.
- Measure the **10 mm ruler** on the printout; if it is not exactly 10 mm, the print was scaled.
- Avoid inkjet on plain paper (ink bleed blurs the 0.15 mm cells). Do not print from a photo or screenshot of the label.

### Calibration (do this before recording)

1. Print 1–2 labels as above. Make a **photocopy** of the printed label (or scan and re-print it), and display the label PDF on a **monitor or second phone**.
2. With the demo phone, take 5+ photos of each, following the capture tips (8–12 cm, centred, tap to focus, no glare).
3. **Calibration** page → choose the tag (*Original print / Photocopy / Photo of a screen*) → upload the photos (send them to the PC unmodified, e.g. via USB or cloud drive in "original quality"; messengers recompress).
4. Check the histogram. If originals and copies are clearly separated, click **Apply suggested threshold** (midway between the lowest original and highest copy). If they overlap, improve print quality and capture distance first.
5. Samples are stored in SQLite (scores only). Unreadable photos have no score; the reason is shown in the table. Only labels that are currently active can be calibrated, so don't reissue the label you printed.

### Honest limitations

- **Not 100 % copy-proof.** A basic CDP raises the cost of copying; a skilled forger with high-resolution scanning and printing may produce copies that score well. Error rates have not been measured on a large real dataset.
- Requires **consistent high-quality printing** and **sharp close-up photos**. Poor prints lower original scores (false "copy suspected"); poor captures return "Retake photo".
- The threshold is specific to your printer/paper/phone combination. Recalibrate when any of them changes.
- For the strongest protection use **secure NFC tags** with cryptographic challenge–response; they cannot be copied by imaging.

## Mobile app

`mobile/` is the **VERIQ Scanner** Flutter app for Android (package `com.veriq.scanner`). It captures a **full-resolution still** with the `camera` package (`ResolutionPreset.max`, back camera, tap-to-focus, flash toggle off by default, square guide "Fit the QR inside the frame, 8–12 cm away"). It uploads the JPEG **unmodified** to `POST /api/verify-physical` with `X-App-Key` and a per-install `scannerId` (UUID), then shows **Original product / Copy suspected / Retake photo / Invalid code** with score vs threshold. History keeps the last 50 scans on the phone. Settings holds the server URL and a masked app key, plus a *Test connection* button.

| Folder | Contents |
|---|---|
| `mobile/lib/api/` | `veriq_api.dart` (multipart upload, 30 s timeout, connection test), `api_error.dart` (error mapping: no connection, timeout, 401 key rejected, 503 analysis down, …) |
| `mobile/lib/models/` | `VerifyResult` parsing, `HistoryEntry`, `AppSettings` (URL normalisation, key masking) |
| `mobile/lib/screens/` | Scan (camera), Result, History, Settings |
| `mobile/lib/widgets/` | Result card, scan overlay, brand mark |
| `mobile/lib/services/` | SharedPreferences-backed settings (incl. scanner UUID) and history |
| `mobile/test/` | Result parsing, error mapping, API client against a mock HTTP client (verifies multipart, header, unmodified bytes), stores, result widgets |
| `mobile/android/` | Committed customisations only: manifest (CAMERA + INTERNET), cleartext config, icons, splash, `MainActivity`. Gradle files come from `tool/setup.ps1`. |

### Prerequisites (Windows)

- Flutter SDK (stable) on `PATH`, and the Android SDK (Android Studio or the command-line tools). Accept the licenses with `flutter doctor --android-licenses`. `flutter doctor` must show the Android toolchain without errors.
- On the phone: Developer options → **USB debugging** on, then accept the PC's RSA prompt. `flutter devices` lists the phone.
- Phone and PC on the **same Wi-Fi**. Allow the API port through the firewall (admin PowerShell, once):
  `New-NetFirewallRule -DisplayName "VERIQ API 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private`
- The VERIQ API (`npm run dev`) and the CDP service (`cdp-service\run-cdp.ps1`) running on the PC. The app talks to the API directly on port **4000**.

### First-time setup

```powershell
cd mobile
powershell -ExecutionPolicy Bypass -File tool\setup.ps1
```

The script runs `flutter create` for Android (generates Gradle files for *your* Flutter version without overwriting the committed files), sets `applicationId`/`namespace` to `com.veriq.scanner` and `minSdk = 23`, runs `flutter pub get`, `flutter analyze` and `flutter test`.

### (a) Run on the connected phone

```powershell
cd mobile
# PC Wi-Fi IP and the flutter-app key from ..\.env (never typed into a file in the repo)
$ip  = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi').IPAddress
$key = ((Select-String -Path ..\.env -Pattern '^APP_KEYS=').Line -replace '.*flutter-app:([^,]+).*', '$1')
flutter devices
flutter run --dart-define=SERVER_URL=http://${ip}:4000 --dart-define=APP_KEY=$key
```

### (b) Release APK

```powershell
cd mobile
flutter build apk --release --dart-define=SERVER_URL=http://${ip}:4000 --dart-define=APP_KEY=$key
# Output: mobile\build\app\outputs\flutter-apk\app-release.apk
flutter install --release        # or: adb install -r build\app\outputs\flutter-apk\app-release.apk
```

The release build is signed with the Flutter debug key (template default). That's fine for sideloading a demo; configure a real keystore before distribution.

### Security notes

- **No secrets in the repo.** The app key comes only from `--dart-define=APP_KEY` or the Settings screen; `mobile/.gitignore` excludes keystores and `dart_defines*.json`. A key compiled into an APK (or typed into Settings) is still readable by someone who has the phone or APK. It identifies the app; it isn't a secret. Production needs Play Integrity / App Attest on top.
- **Cleartext HTTP** is allowed only for the LAN demo (`android/app/src/main/res/xml/network_security_config.xml`). **Production must use HTTPS** and remove that config.
- Photos are deleted from the app cache after upload; History stores results only.

## Demo instructions (for reviewers)

1. **Overview:** stat cards, the 14-day activity chart, the authentication-status breakdown and recent activity, all driven by the live database.
2. **Products → Add product:** submit the empty form to see validation, then register a product. You land on its page with a freshly generated label. The QR encodes `VQ1.‹token›.‹signature›`, not a link. Try **PNG / SVG / Print label**, **Reveal** (public ID vs. secret token), **Reissue** and **Revoke**.
3. **Live Demo → Guided scenarios:** press **A to F**. The simulated scanner decodes the rendered QR image in the browser, then calls `/api/verify` as the authorized `web-scanner` client.
   - **A, First scan:** authentic, product shown. If the label was already scanned, a fresh one is issued first.
   - **B, Repeated scan:** authentic, "verification #N". Keep pressing; the 5th scan exceeds `HIGH_SCAN_COUNT` (max 4) and is flagged.
   - **C, Modified QR:** one token character is changed and the old signature kept. Rejected as `BAD_SIGNATURE` before any database lookup, with no product data.
   - **D, Revoked QR:** the label is reissued, then the *old* label is scanned. Rejected as revoked.
   - **E, Copied QR:** a simulated photocopy decodes to the *identical* signed payload. It is flagged only because a different scanner in another city presented it within 30 minutes. The UI states that the copy was not physically detected.
   - **F, Regular camera:** shows what a generic camera app sees (plain text, no link). The same payload sent to `/api/verify` without an app key gets `401 APP_KEY_MISSING`, and no event is recorded.
4. **Live Demo → Authorized scanner:** camera (asks for permission only when you press *Start camera*), image upload (e.g. a downloaded label PNG) or paste the `VQ1.…` payload.
5. **Verification Logs:** new events appear immediately with their **client app**. Filter, open the detail panel, export CSV.
6. **Settings:** change thresholds and see the payload format and authorized app IDs. **Reset demo data** restores the starting state.
7. **Security & Limitations:** the technical explanation for stakeholders.
8. Open `http://localhost:5173/v/anything` to see the page shown for retired URL labels: *"Scan this label with the official VERIQ app"*.
9. **Physical check:** print a label PDF, open `/scan-physical` on a phone, photograph the original (green **Original product**), then a photocopy and a screen showing the label (red **Copy suspected**). Results appear in Verification Logs as "Photo check" with score and threshold.

### Suggested 3-minute video walkthrough

1. *(0:00)* Sign in. On the Overview, give a 20-second tour of stats, chart and status breakdown.
2. *(0:25)* Products: register "Aviator Pilot Watch", show the QR label, the signed payload format, the public ID vs. the secret token, and the print preview.
3. *(0:55)* Launch the Interactive Demo. Run **A**, pointing out the progress steps, request headers (`X-App-Key`), server response and "Why this result?".
4. *(1:20)* Run **B** twice: a repeat scan is normal and not flagged. Keep pressing until the threshold warning appears.
5. *(1:45)* Run **C** (`BAD_SIGNATURE`) and **D** (old label rejected after reissue).
6. *(2:05)* Run **E**: original vs. copy, same payload, flagged only by scan pattern.
7. *(2:25)* Run **F**: a camera app sees only text, and an unauthorized client gets 401.
8. *(2:45)* Open Verification Logs (client-app column, CSV), then close on Security & Limitations.

---

## Implemented features

- Product registry with search (name, public ID, SKU), filters (category, authentication status, product status), sorting, pagination, create/edit with shared validation, detail view, and empty states
- Automatic public product ID and a 128-bit CSPRNG token per label, encoded as a **signed, non-URL `VQ1` payload**
- QR generation (`qrcode`), PNG/SVG download, print-ready label preview (print CSS outputs only the label)
- Atomic reissue, revoke and issue, with label history and reasons. Revoked tokens are rejected and their plaintext discarded.
- Verification API restricted to **authorized client apps** (`X-App-Key`), with a constant-time signature check before database lookup, HMAC registry lookup, minimal disclosure, validation, per-IP rate limiting, `helmet` headers, and structured errors
- Per-scan record of the verifying client app (DB migration v2), shown in logs, detail drawer and CSV
- Configurable repeat-scan anomaly rules with per-scan rule evaluation in the response
- Verification log with search, filters, status badges, detail drawer, and CSV export
- Live Demo simulator for scenarios A–F: in-browser QR decoding, progress steps, request/response with masked payload and key, rule table, explanations, session timeline
- Browser scanner (authorized `web-scanner` client): camera (`qr-scanner`, permission requested on demand), image upload, manual payload entry
- Retired `/v/*` URLs show an "use the official VERIQ app" page; nothing is verified there
- Demo operator authentication with hashed bearer sessions
- Persistent SQLite storage with versioned migrations, seeding, and reset (CLI and UI)
- Responsive layout (desktop to 390 px), mobile navigation drawer
- Copy Detection Pattern: per-label HMAC-derived pattern in the QR centre (EC level H, ≤ 12 % overlay), vector SVG + A4 print PDF with ruler, zoomed pattern view, Python/OpenCV analysis service, `/api/verify-physical`, configurable threshold, Calibration page with histogram and suggested threshold, phone capture page `/scan-physical`
- Tests: 40 Vitest tests (incl. `/api/verify-physical` with the Python service mocked), 12 pytest tests on synthetic print/photocopy/screen captures, an ESLint configuration, strict TypeScript, a full-chain CDP smoke script, and a browser E2E smoke script

## Limitations

- **A QR code can be copied.** The signature stops forged or modified payloads, but a photo, screen or reprint of a genuine label carries the identical signed payload. Repeat-scan rules are risk signals, not proof. The copy-detection pattern adds a physical check through `/api/verify-physical`, but it is a calibrated heuristic, not 100 % copy-proof (see [Honest limitations](#honest-limitations)).
- **App keys are identifiers, not secrets.** The web scanner's key is visible in its JavaScript bundle, and any key shipped in an app can be extracted. Without app attestation, a determined attacker could build their own client. The payload text is also readable by any QR reader. "App-only" verification raises the bar; it is not a cryptographic guarantee.
- **Demo-only operator auth:** one account from `.env`, with no SSO, MFA, roles or audit trail of operator actions. Sessions are stored in `localStorage`.
- **Self-reported scanner identity:** `scannerId` and `location` come from the client and are not authenticated.
- **Browser scanner ≠ Flutter app:** there is no device enrolment or attestation, no offline mode, and no secure storage. Camera scanning requires HTTPS or localhost.
- **Active-token plaintext is stored** so labels can be re-downloaded (see the design decisions above).
- **Single-node storage:** SQLite and in-memory rate limiting are not suitable for a horizontally scaled deployment.
- **Illustrative thresholds:** they must be tuned on real scan data.

## What a production deployment requires

**Backend and security**
- Managed PostgreSQL (or similar) with migrations, backups, and point-in-time recovery. Redis-backed rate limiting.
- Real operator identity: SSO/OIDC, MFA, role-based access (brand admin, label printer, auditor), and an operator audit log.
- Secrets in a KMS or vault. Versioned signing keys (e.g. a `VQ2` prefix or key ID) so `QR_SIGNING_SECRET` can rotate without reprinting. Print-time label rendering so token plaintext is never stored.
- Client authentication beyond static keys: per-app-version keys, Play Integrity / App Attest verification on the server, key rotation, and revocation of compromised app versions.
- HTTPS everywhere, a WAF/bot protection on the verify endpoint, abuse monitoring (including 401 spikes), and alerting on flagged spikes.
- Multi-tenant brand separation, a data retention policy for scan logs (privacy/GDPR review), and DPIA if location or user data is collected.
- Label print integration (batch export of signed payloads to the print vendor in a secure format), plus batch and lot management.
- Anomaly rules tuned on real data, a review workflow (case management) for flagged labels, and optional notifications.
- Observability (structured logs, metrics, tracing), load testing, and a penetration test.

**Dedicated Flutter application** (start from [docs/API_FOR_MOBILE.md](docs/API_FOR_MOBILE.md))
- Native camera scanning (`mobile_scanner`) with fast decoding and a local `VQ1` format pre-check.
- Its own `flutter-app` key, platform attestation (Play Integrity / App Attest), and certificate pinning.
- Device enrolment so scanner IDs are trustworthy. Secure storage of credentials and an offline queue for scans with later sync.
- Role-specific flows (warehouse intake, retailer check-in, customs inspection), GPS capture with consent, and localisation.
- Optional NFC reading if secure NFC tags are adopted.
- App store distribution, MDM support for company devices, and crash reporting.

**Physical anti-counterfeit (to evaluate)**
- Tamper-evident or destructible label stock, secure print features, secure NFC tags with challenge–response, cryptographically signed product credentials, and image-based label inspection validated through controlled testing.
