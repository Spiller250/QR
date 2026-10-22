/**
 * QR payload format (v1):  VQ1.<token>.<sig>
 *   token  16 random bytes, base64url without padding (22 chars) — the secret label token
 *   sig    first 16 chars of base64url(HMAC-SHA256(QR_SIGNING_SECRET, "VQ1." + token))
 *
 * The payload is deliberately not a URL, so a regular camera app shows plain text and
 * offers nothing to open. Signing happens server-side only; clients never hold the secret.
 */
export const PAYLOAD_VERSION = 'VQ1';
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const SIGNATURE_LENGTH = 16;
const PAYLOAD_PATTERN = /^VQ1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{16})$/;

export type ParsedPayload =
  | { kind: 'vq1'; token: string; signature: string }
  /** Retired `…/v/<token>` URL labels. Treated as malformed by the API. */
  | { kind: 'legacy_url'; token: string }
  | { kind: 'malformed' };

export function parsePayload(input: string): ParsedPayload {
  const value = input.trim();
  const m = value.match(PAYLOAD_PATTERN);
  if (m) return { kind: 'vq1', token: m[1], signature: m[2] };
  const legacy = value.match(/^https?:\/\/[^\s]+\/v\/([A-Za-z0-9_-]{22})(?:[?#].*)?$/);
  if (legacy) return { kind: 'legacy_url', token: legacy[1] };
  return { kind: 'malformed' };
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Masked form for display, e.g. `VQ1.s1y…LqKQ.‹sig›`. */
export function maskPayload(payload: string): string {
  const p = parsePayload(payload);
  if (p.kind !== 'vq1') return payload.length > 24 ? `${payload.slice(0, 20)}…` : payload;
  return `VQ1.${p.token.slice(0, 3)}…${p.token.slice(-4)}.${p.signature.slice(0, 3)}…`;
}
