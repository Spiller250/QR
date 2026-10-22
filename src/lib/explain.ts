import type { RuleEvaluation, VerifyResponse } from '../../shared/types';

export type ScenarioKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Tone = 'ok' | 'warn' | 'bad' | 'info';
export interface Point {
  tone: Tone;
  text: string;
}

function describeRule(r: RuleEvaluation): string {
  switch (r.code) {
    case 'HIGH_SCAN_COUNT':
      return `HIGH_SCAN_COUNT — this is verification #${r.observed}; the configured maximum is ${r.threshold}.`;
    case 'MULTIPLE_DEVICES':
      return `MULTIPLE_DEVICES — ${r.observed} distinct scanners within the window; the configured maximum is ${r.threshold}.`;
    case 'MULTIPLE_LOCATIONS':
      return `MULTIPLE_LOCATIONS — ${r.observed} distinct locations within the window; the configured maximum is ${r.threshold}.`;
    case 'RAPID_DEVICE_SWITCH':
      return `RAPID_DEVICE_SWITCH — a different scanner presented the same token ${r.observed} min after the previous scan (rule window: ${r.threshold} min).`;
  }
}

/** Plain-language explanation of why the server accepted, flagged or rejected a scan. */
export function explain(r: VerifyResponse, scenario?: ScenarioKey): Point[] {
  const points: Point[] = [];
  const triggered = r.scan?.rules.filter((x) => x.triggered) ?? [];

  switch (r.result) {
    case 'authentic':
      points.push({ tone: 'ok', text: 'The token was found in the registry and its label is active.' });
      if (r.scan?.scanNumber === 1) {
        points.push({ tone: 'ok', text: 'No earlier verification exists for this token, so the event is recorded as the first scan.' });
      } else if (r.scan) {
        points.push({
          tone: 'info',
          text: `This token has now been verified ${r.scan.scanNumber} times. Repeat scans are expected — buyers re-check purchases and retailers check stock — so a repeat alone is not treated as counterfeit.`,
        });
      }
      points.push({ tone: 'info', text: 'No repeat-scan rule exceeded its configured limit, so no warning was raised.' });
      if (r.reasonCode === 'PRODUCT_RECALLED') points.push({ tone: 'warn', text: 'The label is genuine, but the brand owner has marked this product as recalled.' });
      if (r.reasonCode === 'PRODUCT_INACTIVE') points.push({ tone: 'warn', text: 'The label is genuine, but the brand owner has marked this product as inactive.' });
      points.push({ tone: 'ok', text: 'Public product details were disclosed because the token resolved to an active label.' });
      break;
    case 'suspicious':
      points.push({ tone: 'ok', text: 'The token is a genuine, active VERIQ token — it was found in the registry.' });
      for (const rule of triggered) points.push({ tone: 'warn', text: describeRule(rule) });
      points.push({ tone: 'warn', text: 'The warning is a risk signal for review, not proof of counterfeiting. Thresholds are configurable in Settings.' });
      break;
    case 'invalid':
      if (r.reasonCode === 'BAD_SIGNATURE') {
        points.push({
          tone: 'bad',
          text: 'The payload has the VQ1 format, but its signature does not match the token. Only the VERIQ server holds the signing key, so a modified or forged payload cannot carry a valid signature.',
        });
        points.push({ tone: 'ok', text: 'The signature was checked in constant time before any registry lookup — forged codes never reach the token database.' });
      } else if (r.reasonCode === 'LEGACY_FORMAT') {
        points.push({ tone: 'bad', text: 'The code uses the retired URL format. Only signed VQ1 payloads are accepted.' });
      } else if (r.reasonCode === 'MALFORMED_TOKEN') {
        points.push({ tone: 'bad', text: 'The decoded content is not a VERIQ payload (expected VQ1.<token>.<signature>).' });
      } else {
        points.push({ tone: 'bad', text: 'The signature is valid, but no label in the registry matches this token (for example, a label from a deleted batch).' });
      }
      points.push({ tone: 'ok', text: 'No product details were disclosed to the scanner.' });
      points.push({ tone: 'info', text: 'The attempt was logged with a short HMAC fingerprint — the raw value is not stored.' });
      break;
    case 'revoked':
      points.push({ tone: 'bad', text: 'The token exists, but its label has been revoked. Revoked tokens can never verify again.' });
      points.push({ tone: 'ok', text: 'No product details were disclosed for the revoked label.' });
      points.push({ tone: 'info', text: 'The replacement label issued for this product continues to verify normally.' });
      break;
  }

  if (scenario === 'E') {
    points.push({
      tone: 'info',
      text: 'The copy decodes to exactly the same signed payload as the original label. The signature proves the payload was issued by VERIQ — not that the physical label is the original — so the server has no information about the object that was scanned.',
    });
    points.push(
      r.result === 'suspicious'
        ? { tone: 'warn', text: 'The warning comes from scan-pattern heuristics (timing, scanner, location). The system did not physically detect a copy.' }
        : { tone: 'warn', text: 'No rule fired, so the copy was accepted exactly like the original. A standard QR code alone cannot distinguish them.' },
    );
  }
  return points;
}
