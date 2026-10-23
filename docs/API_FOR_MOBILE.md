# VERIQ Verification API — Guide for the Flutter App

This guide covers how the official VERIQ mobile app reads a product label and verifies it against the VERIQ API. It describes the proof-of-concept API in this repository. Expect changes before production; see [Production notes](#production-notes).

---

## 1. What is in the QR code

Every label encodes a short **plain-text** payload. It is not a URL:

```
VQ1.<token>.<sig>
```

| Part | Format | Meaning |
|---|---|---|
| `VQ1` | literal | Payload format version 1 |
| `<token>` | 22 chars, base64url (`A–Z a–z 0–9 - _`) | 128-bit secret label token |
| `<sig>` | 16 chars, base64url | First 16 chars of `base64url(HMAC-SHA256(QR_SIGNING_SECRET, "VQ1." + token))` |

Example: `VQ1.s1yQm3k0Xr7bT9cVwLqKQA.7RDp2xM_fK0aZ1nQ`

Regex for a quick client-side sanity check:

```
^VQ1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$
```

**The app must not try to validate the signature.** The signing secret exists only on the server. Never ship it in the app. Send the payload to the API exactly as decoded (trimming surrounding whitespace is fine).

Because the payload is not a link, ordinary camera apps only show text and offer nothing to open. Older labels that encoded `https://…/v/<token>` are retired. The API answers them with `invalid` / `LEGACY_FORMAT`.

---

## 2. Calling the API

```
POST {API_BASE_URL}/api/verify
Content-Type: application/json
X-App-Key: <flutter-app key>
```

### Headers

| Header | Required | Notes |
|---|---|---|
| `Content-Type` | yes | `application/json` |
| `X-App-Key` | yes | Key issued to the Flutter app. The server's `APP_KEYS` contains `flutter-app:<key>`. Missing or unknown keys return **401**. The server records the client ID (`flutter-app`) on every scan. |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `payload` | string (≤ 512) | yes | Raw QR content, e.g. `VQ1.<token>.<sig>` |
| `scannerId` | string (≤ 64) | recommended | Device or scanner identifier, e.g. `SCN-BER-01` or a per-install ID. Used by the repeat-scan rules. |
| `location` | string (≤ 80) | optional | Human-readable location, e.g. `Berlin, DE`. Used by the location rule. Collect GPS only with user consent. |
| `source` | `"camera"` \| `"manual"` | optional | How the payload was captured. Default `manual`. |

### Status codes

| HTTP | When |
|---|---|
| `200` | The request was processed. **Check `result`.** Invalid, forged and revoked codes are also `200`. |
| `400` | Body is not valid JSON or fails validation (e.g. missing `payload`) |
| `401` | `X-App-Key` missing (`APP_KEY_MISSING`) or not recognised (`APP_KEY_INVALID`). Nothing is logged. |
| `429` | Rate limit exceeded (per IP, default 60 requests/minute). Retry after the `RateLimit-Reset` header. |
| `5xx` | Server error. Show a "try again" state; do not cache. |

### `result` values

| `result` | `reasonCode` | Show to the user | `product` |
|---|---|---|---|
| `authentic` | `FIRST_SCAN`, `REPEAT_SCAN` | Registered label (green) | present |
| `authentic` | `PRODUCT_RECALLED`, `PRODUCT_INACTIVE` | Registered, with a notice | present |
| `suspicious` | `SUSPICIOUS_PATTERN` | Registered, but the scan pattern is unusual. Possible copy (amber). | present |
| `invalid` | `BAD_SIGNATURE` | Not verified: modified or forged code (red) | `null` |
| `invalid` | `MALFORMED_TOKEN` | Not a VERIQ code | `null` |
| `invalid` | `LEGACY_FORMAT` | Retired label format | `null` |
| `invalid` | `TOKEN_NOT_FOUND` | Not registered | `null` |
| `revoked` | `TOKEN_REVOKED` | Label revoked (red) | `null` |

Use `message` as a ready-made English explanation, or map `reasonCode` to localized strings. A `suspicious` result is a risk signal, not proof of counterfeiting. Word it carefully in the UI.

---

## 3. Example requests and responses

### Authentic (first scan)

```http
POST /api/verify
Content-Type: application/json
X-App-Key: <flutter-app key>

{ "payload": "VQ1.s1yQm3k0Xr7bT9cVwLqKQA.7RDp2xM_fK0aZ1nQ", "scannerId": "SCN-BER-01", "location": "Berlin, DE", "source": "camera" }
```

```json
{
  "eventId": "evt_kFq238jN7bSN",
  "checkedAt": "2026-10-22T18:01:41.553Z",
  "result": "authentic",
  "reasonCode": "FIRST_SCAN",
  "message": "Registered label. This is the first verification of this code.",
  "product": {
    "publicId": "VQ-E25A-BV7J",
    "name": "Meridian Chronograph 42 mm",
    "manufacturer": "Aurelle Horlogerie (fictional)",
    "category": "Watches",
    "batchNumber": "B-2026-0917",
    "productionDate": "2026-09-17",
    "status": "active"
  },
  "scan": {
    "scanNumber": 1,
    "repeatScan": false,
    "firstVerifiedAt": "2026-10-22T18:01:41.553Z",
    "flagged": false,
    "rulesTriggered": [],
    "rules": [
      { "code": "HIGH_SCAN_COUNT", "triggered": false, "observed": 1, "threshold": 4, "description": "…" },
      { "code": "MULTIPLE_DEVICES", "triggered": false, "observed": 1, "threshold": 3, "description": "…" },
      { "code": "MULTIPLE_LOCATIONS", "triggered": false, "observed": 1, "threshold": 2, "description": "…" },
      { "code": "RAPID_DEVICE_SWITCH", "triggered": false, "observed": 0, "threshold": 30, "description": "…" }
    ]
  }
}
```

### Suspicious (same label seen on another scanner minutes later)

```json
{
  "eventId": "evt_TpWyaOoPjhQr",
  "checkedAt": "2026-10-22T18:04:57.799Z",
  "result": "suspicious",
  "reasonCode": "SUSPICIOUS_PATTERN",
  "message": "Registered label, but the scan pattern matches one or more anomaly rules. The label may have been copied. The server cannot tell which physical label is the original.",
  "product": { "publicId": "VQ-E25A-BV7J", "name": "Meridian Chronograph 42 mm", "…": "…" },
  "scan": {
    "scanNumber": 2,
    "repeatScan": true,
    "firstVerifiedAt": "2026-10-22T18:04:54.984Z",
    "flagged": true,
    "rulesTriggered": ["RAPID_DEVICE_SWITCH"],
    "rules": [{ "code": "RAPID_DEVICE_SWITCH", "triggered": true, "observed": 0, "threshold": 30, "description": "…" }]
  }
}
```

### Invalid: malformed or unknown code

```json
{
  "eventId": "evt_3b9ZkQe0Wm1c",
  "checkedAt": "2026-10-22T18:06:10.120Z",
  "result": "invalid",
  "reasonCode": "MALFORMED_TOKEN",
  "message": "The scanned code is not a valid VERIQ verification code. It may be damaged, modified or not issued by VERIQ.",
  "product": null,
  "scan": null
}
```

### Invalid: `BAD_SIGNATURE` (modified or forged payload)

```json
{
  "eventId": "evt_QBIPLYxDpJ16",
  "checkedAt": "2026-10-22T18:59:35.965Z",
  "result": "invalid",
  "reasonCode": "BAD_SIGNATURE",
  "message": "The code failed the signature check. It has been modified or forged and was not issued by VERIQ.",
  "product": null,
  "scan": null
}
```

### 401: missing or unknown app key

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": {
    "code": "APP_KEY_MISSING",
    "message": "Verification is only available through an authorized VERIQ application. The X-App-Key header is missing."
  }
}
```

`APP_KEY_INVALID` has the same shape. Treat any 401 from `/api/verify` as a configuration error ("This app version is not authorized. Please update."), not as a verification result.

---

## 4. Recommended Flutter packages

| Package | Purpose |
|---|---|
| [`mobile_scanner`](https://pub.dev/packages/mobile_scanner) | Camera QR scanning (ML Kit on Android, Vision on iOS) |
| [`http`](https://pub.dev/packages/http) | HTTP client for `POST /api/verify` |
| `flutter_secure_storage` *(optional)* | Persist a per-install scanner ID |
| `geolocator` *(optional)* | Location, only with explicit consent |

### Minimal example

```dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';

const apiBase = String.fromEnvironment('VERIQ_API_BASE');   // e.g. https://api.veriq.example
const appKey  = String.fromEnvironment('VERIQ_APP_KEY');    // flutter-app key (see Production notes)
final payloadPattern = RegExp(r'^VQ1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$');

class VerifyResult {
  VerifyResult(this.result, this.reasonCode, this.message, this.product);
  final String result, reasonCode, message;
  final Map<String, dynamic>? product;
}

class UnauthorizedAppException implements Exception {
  UnauthorizedAppException(this.code);
  final String code;
}

Future<VerifyResult> verify(String payload, {required String scannerId, String? location}) async {
  final res = await http
      .post(
        Uri.parse('$apiBase/api/verify'),
        headers: {'Content-Type': 'application/json', 'X-App-Key': appKey},
        body: jsonEncode({'payload': payload.trim(), 'scannerId': scannerId, 'location': location, 'source': 'camera'}),
      )
      .timeout(const Duration(seconds: 10));

  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (res.statusCode == 401) throw UnauthorizedAppException(body['error']['code'] as String);
  if (res.statusCode != 200) throw Exception(body['error']?['message'] ?? 'Verification failed (${res.statusCode})');
  return VerifyResult(body['result'], body['reasonCode'], body['message'], body['product']);
}

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.scannerId});
  final String scannerId;
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final controller = MobileScannerController(formats: [BarcodeFormat.qrCode]);
  bool busy = false;

  Future<void> onDetect(BarcodeCapture capture) async {
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (busy || raw == null) return;
    busy = true;
    await controller.stop();
    try {
      // Non-VERIQ codes can be rejected locally; the server still decides validity of VQ1 codes.
      if (!payloadPattern.hasMatch(raw.trim())) {
        _show('Not a VERIQ label');
      } else {
        final r = await verify(raw, scannerId: widget.scannerId);
        _show('${r.result.toUpperCase()}: ${r.message}');
      }
    } on UnauthorizedAppException {
      _show('This app is not authorized to verify labels. Please update the app.');
    } catch (e) {
      _show('Could not verify: $e');
    } finally {
      busy = false;
    }
  }

  void _show(String text) => showDialog(context: context, builder: (_) => AlertDialog(content: Text(text)))
      .then((_) => controller.start());

  @override
  Widget build(BuildContext context) => Scaffold(body: MobileScanner(controller: controller, onDetect: onDetect));
}
```

Notes:
- Do not log or persist raw payloads. They are bearer credentials for that label.
- Treat each scan as one call. Do not auto-retry on `200` results; retry only on timeouts and 5xx, with backoff.
- `scannerId` should be stable per device or install so the repeat-scan rules work.

---

## 5. Physical verification with copy detection: `POST /api/verify-physical`

Use this when the app must confirm that the **physical label is an original print**, not just that the code is genuine. Every label has a 6 mm Copy Detection Pattern (40 × 40 cells of 0.15 mm) in the centre of its QR code. The app uploads a photo; the server decodes the QR, runs the same `VQ1` checks as `/api/verify`, and scores how well the microscopic pattern survived. Photocopies, re-prints of photos and photos of screens degrade it.

### Request

```
POST {API_BASE_URL}/api/verify-physical
X-App-Key: <flutter-app key>
Content-Type: multipart/form-data; boundary=…
```

| Part | Required | Notes |
|---|---|---|
| `image` (file) | yes | The **original full-resolution JPEG** (or PNG) from the camera, ≤ 20 MB. Do **not** resize, crop, re-encode or apply filters. |
| `scannerId` | recommended | Stable per-install ID (same as `/api/verify`) |
| `location` | optional | Human-readable location |
| `source` | optional | `camera` (default) or `manual` |

The server decodes the QR from the photo itself. The app does **not** need to decode the payload (it may, for a live "QR in view" hint before capturing).

### Capture requirements (important)

- **Autofocus on the label** (tap-to-focus or focus lock on the centre) and wait for focus before capturing. Use `takePicture()` stills, not preview/stream frames.
- **Close-up:** 8–12 cm, QR roughly centred. The server needs at least ~2.2 px per 0.15 mm cell (a 30 mm QR spanning ≥ ~450 px in the photo); 4+ px per cell is ideal.
- **Highest resolution** (`ResolutionPreset.max`), flash **off** by default (glare destroys the pattern), steady hands.
- Upload the file **as captured**. Messenger-style recompression or downscaling will lower scores of genuine labels.

### Response

`200 OK` for every analysed photo. Check `result`.

| `result` | `reasonCode` | UI | `product` | `score` |
|---|---|---|---|---|
| `authentic` | `CDP_MATCH` | Green "Original product" | yes | number ≥ `threshold` |
| `copy_suspected` | `CDP_DEGRADED` | Red "Copy suspected — this label appears to be a reproduction" | yes (genuine token, copied label) | number < `threshold` |
| `unreadable` | `NO_QR_FOUND`, `CAPTURE_TOO_BLURRY`, `CAPTURE_TOO_FAR`, `UNSUPPORTED_IMAGE`, `PAYLOAD_MISMATCH` | Grey "Retake photo" + `message` | `null` | `null` |
| `invalid` | `BAD_SIGNATURE`, `MALFORMED_TOKEN`, `LEGACY_FORMAT`, `TOKEN_NOT_FOUND`, `TOKEN_REVOKED` | Red "Invalid code" + `message` | `null` | `null` |

Original print:

```json
{
  "eventId": "evt_X1c9…",
  "checkedAt": "2026-10-23T09:55:41.120Z",
  "result": "authentic",
  "reasonCode": "CDP_MATCH",
  "message": "Original label: the copy-detection pattern matches a first-generation print.",
  "score": 0.9433,
  "threshold": 0.6,
  "product": { "publicId": "VQ-TJWX-392C", "name": "Meridian Chronograph 42 mm", "manufacturer": "Aurelle Horlogerie (fictional)",
               "category": "Watches", "batchNumber": "B-2026-0917", "productionDate": "2026-09-17", "status": "active" },
  "scan": { "scanNumber": 9, "repeatScan": true, "rulesTriggered": [] },
  "components": { "cellCorrelation": 0.988, "pixelCorrelation": 0.896, "hfRatio": 4.2, "hfScore": 1, "isolatedContrast": 0.877, "fidelity": 0.96, "rotation": 0, "scale": 1 },
  "diagnostics": { "pixelsPerCell": 4.56, "blurCells": 0.62, "sharpness": 0.77, "edgeWidthPx": 2.83, "qrSidePx": 914.6, "imageWidth": 3000, "imageHeight": 2400, "detector": "opencv", "bytes": 1843201 }
}
```

Photocopy / screen:

```json
{ "result": "copy_suspected", "reasonCode": "CDP_DEGRADED",
  "message": "Copy suspected: the copy-detection pattern is degraded. This label appears to be a reproduction (photocopy, re-print of a photo, or a screen).",
  "score": 0.2563, "threshold": 0.6, "product": { "…": "…" }, "scan": { "scanNumber": 10, "repeatScan": true, "rulesTriggered": [] }, "…": "…" }
```

Blurry capture (no guess is made):

```json
{ "eventId": "evt_…", "result": "unreadable", "reasonCode": "CAPTURE_TOO_BLURRY",
  "message": "The photo is too blurry to check the copy-detection pattern. Hold steady, tap to focus and retake.",
  "score": null, "threshold": 0.6, "product": null, "scan": null, "components": null,
  "diagnostics": { "pixelsPerCell": 4.5, "blurCells": 2.1, "sharpness": 0 } }
```

Show `score` vs `threshold` in small text only. They are calibration values, not percentages of "authenticity".

### Errors

| HTTP | `error.code` | App behaviour |
|---|---|---|
| 400 | `IMAGE_REQUIRED`, `BAD_UPLOAD` | Bug in the request (field must be named `image`) |
| 401 | `APP_KEY_MISSING`, `APP_KEY_INVALID` | "This app is not authorized" — configuration problem |
| 413 | `IMAGE_TOO_LARGE` | > 20 MB; should not happen with phone JPEGs |
| 429 | `RATE_LIMITED` | Wait and retry |
| 503 | `CDP_SERVICE_UNAVAILABLE` | Server-side analysis service down — "Try again later" |

Use a **30 s timeout**: analysis of a 12 MP photo takes ~1–3 s on a laptop, plus upload time.

### Dart sketch

```dart
import 'package:camera/camera.dart';
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> verifyPhysical(XFile photo, String scannerId) async {
  final req = http.MultipartRequest('POST', Uri.parse('$apiBase/api/verify-physical'))
    ..headers['X-App-Key'] = appKey
    ..fields['scannerId'] = scannerId
    ..fields['source'] = 'camera'
    // fromPath streams the file as captured: no decoding, resizing or re-encoding.
    ..files.add(await http.MultipartFile.fromPath('image', photo.path));
  final streamed = await req.send().timeout(const Duration(seconds: 30));
  final res = await http.Response.fromStream(streamed);
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (res.statusCode == 401) throw UnauthorizedAppException(body['error']['code']);
  if (res.statusCode != 200) throw Exception(body['error']?['message'] ?? 'HTTP ${res.statusCode}');
  return body; // switch on body['result']
}
```

Capture with the `camera` package: `CameraController(backCamera, ResolutionPreset.max, enableAudio: false)`, `setFlashMode(FlashMode.off)`, `setFocusPoint` on tap, then `takePicture()`.

---

## 6. Notes from the reference implementation (`mobile/`)

The VERIQ Scanner app in `mobile/` implements §5. Points worth copying:

- **Capture:** `CameraController(backCamera, ResolutionPreset.max, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg)`, `setFlashMode(FlashMode.off)` at start (the toggle switches `FlashMode.torch`), `setFocusMode(FocusMode.auto)`. Tap-to-focus maps the tap from the cover-scaled preview back into preview coordinates before `setFocusPoint`/`setExposurePoint`. `mobile_scanner` is **not** used: two plugins competing for the camera is fragile, and the server decodes the QR anyway.
- **Upload unmodified:** `takePicture()` returns an `XFile` path; `http.MultipartFile.fromPath('image', path, contentType: MediaType('image', 'jpeg'))` streams the file from disk. Nothing decodes or re-encodes it. A test asserts the bytes arrive unchanged.
- **Timeout:** 30 s around both `send()` and reading the response.
- **Error mapping** (`lib/api/api_error.dart`): `SocketException`/`ClientException` → "Cannot reach the VERIQ server at … same Wi-Fi?"; `TimeoutException` → timeout; 401 → "app key rejected" (or "no app key" for `APP_KEY_MISSING`); 503 → "analysis service not running"; 429/413/4xx/5xx → specific messages. Only network/timeout/503/429/5xx offer *Retry upload* (same photo).
- **Test connection** (Settings): `GET /api/health`, then a multipart `POST /api/verify-physical` **without an image** and with the key. The API checks `X-App-Key` before parsing the upload, so `401` means a bad key and `400 IMAGE_REQUIRED` means the key works. Nothing is analysed or logged.
- **scannerId:** UUID v4 generated on first launch, stored in `shared_preferences`, sent with every scan.
- **Server URL:** the app calls the Express API directly (`http://<PC-IP>:4000`). The Vite dev server (`:5173`) also proxies `/api` and works too.
- **Android:** `INTERNET` and `CAMERA` permissions in the main manifest (release builds need `INTERNET` there explicitly). The in-app rationale screen is shown before the system prompt, with *Open settings* if permanently denied. `minSdk 23`. Cleartext only via `network_security_config.xml` for the LAN demo.
- **Privacy:** the photo file is deleted after the result screen closes; History keeps result, score, product name and time only (last 50).

---

## Production notes

- **An app key is an identifier, not a secret.** Anything compiled into an app can be extracted. Combine the key with **app attestation**: Google Play Integrity on Android and App Attest / DeviceCheck on iOS. The server should verify the attestation token before accepting a scan, and keys should be rotatable per app version.
- Use HTTPS only, with certificate pinning in the app.
- Scanner and device identities should come from device enrolment, not self-reported strings.
- Copying the label is still possible: the signature prevents forging *new* payloads, not photographing existing ones. The anomaly rules flag suspicious patterns; physical protection (tamper-evident or secure labels, secure NFC) is needed for stronger guarantees.
