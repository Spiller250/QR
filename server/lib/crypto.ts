import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PAYLOAD_VERSION, SIGNATURE_LENGTH } from '../../shared/token';

/** 128-bit secret verification token from the OS CSPRNG, base64url encoded (22 chars). */
export function generateVerificationToken(): string {
  return randomBytes(16).toString('base64url');
}

export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token, 'utf8').digest('hex');
}

/** Truncated (96-bit) HMAC over "VQ1.<token>". See shared/token.ts for the payload format. */
export function signToken(token: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(`${PAYLOAD_VERSION}.${token}`, 'utf8').digest('base64url').slice(0, SIGNATURE_LENGTH);
}

export function buildQrPayload(token: string, signingSecret: string): string {
  return `${PAYLOAD_VERSION}.${token}.${signToken(token, signingSecret)}`;
}

/** Constant-time signature check. Both values are fixed-length ASCII after format validation. */
export function verifySignature(token: string, signature: string, signingSecret: string): boolean {
  const expected = Buffer.from(signToken(token, signingSecret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Short, non-reversible fingerprint for correlating attempts in logs without storing the input. */
export function fingerprint(tokenHash: string): string {
  return tokenHash.slice(0, 10);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ha = Buffer.from(sha256(a), 'hex');
  const hb = Buffer.from(sha256(b), 'hex');
  return timingSafeEqual(ha, hb);
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Public, non-secret product identifier, e.g. VQ-7K2M-QX9D. Safe to print in plain text. */
export function generatePublicId(): string {
  const chars = Array.from({ length: 8 }, () => CROCKFORD[randomInt(CROCKFORD.length)]);
  return `VQ-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
