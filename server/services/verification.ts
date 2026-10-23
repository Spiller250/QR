import { RULE_DESCRIPTIONS } from '../../shared/constants';
import type { RepeatScanRules } from '../../shared/schemas';
import { parsePayload } from '../../shared/token';
import type { Product, PublicProductInfo, RuleCode, RuleEvaluation, ScanSource, VerificationResult, VerifyResponse } from '../../shared/types';
import { transaction } from '../db';
import { fingerprint, hashToken, verifySignature } from '../lib/crypto';
import type { PriorScan, Store, TokenRecord } from '../store';

export interface VerifyInput {
  /** Raw QR content, expected `VQ1.<token>.<sig>`. */
  payload: string;
  scannerId?: string;
  location?: string;
  source?: ScanSource;
  userAgent?: string | null;
  /** Authorized client ID resolved from X-App-Key. */
  appClient?: string | null;
  /** Injected clock, used by the seed generator and tests. */
  now?: Date;
}

/**
 * Pure rule evaluation: given prior successful scans of a token (newest first) and the
 * current scan, decide which repeat-scan heuristics fire. Heuristics only — a repeat
 * scan is never proof of counterfeiting.
 */
export function evaluateRules(
  rules: RepeatScanRules,
  prior: PriorScan[],
  current: { scannerId: string; location: string | null; at: Date },
): RuleEvaluation[] {
  const windowStart = current.at.getTime() - rules.windowHours * 3_600_000;
  const inWindow = prior.filter((p) => Date.parse(p.createdAt) >= windowStart);
  const devices = new Set([current.scannerId, ...inWindow.map((p) => p.scannerId)]);
  const locations = new Set(
    [current.location, ...inWindow.map((p) => p.location)].filter((l): l is string => Boolean(l)).map((l) => l.toLowerCase()),
  );
  const scanNumber = prior.length + 1;

  const last = prior[0];
  const minutesSinceLast = last ? (current.at.getTime() - Date.parse(last.createdAt)) / 60_000 : Infinity;
  const rapidSwitch =
    rules.rapidSwitchMinutes > 0 && last !== undefined && last.scannerId !== current.scannerId && minutesSinceLast <= rules.rapidSwitchMinutes;

  const make = (code: RuleCode, observed: number, threshold: number, fired: boolean): RuleEvaluation => ({
    code,
    observed,
    threshold,
    triggered: rules.enabled[code] && fired,
    description: RULE_DESCRIPTIONS[code],
  });

  return [
    make('HIGH_SCAN_COUNT', scanNumber, rules.scanCountThreshold, scanNumber > rules.scanCountThreshold),
    make('MULTIPLE_DEVICES', devices.size, rules.distinctDeviceThreshold, devices.size > rules.distinctDeviceThreshold),
    make('MULTIPLE_LOCATIONS', locations.size, rules.distinctLocationThreshold, locations.size > rules.distinctLocationThreshold),
    make(
      'RAPID_DEVICE_SWITCH',
      Number.isFinite(minutesSinceLast) ? Math.round(minutesSinceLast) : 0,
      rules.rapidSwitchMinutes,
      rapidSwitch,
    ),
  ];
}

export type FailureCode = 'LEGACY_FORMAT' | 'MALFORMED_TOKEN' | 'BAD_SIGNATURE' | 'TOKEN_NOT_FOUND' | 'TOKEN_REVOKED';

/** Outcome of checking a payload against format, signature and registry — without recording anything. */
export type Inspection =
  | { ok: false; reasonCode: FailureCode; fingerprint: string; productId: string | null; tokenId: string | null }
  | { ok: true; token: TokenRecord; product: Product; fingerprint: string };

export function publicProduct(product: Product): PublicProductInfo {
  return {
    publicId: product.publicId,
    name: product.name,
    manufacturer: product.manufacturer,
    category: product.category,
    batchNumber: product.batchNumber,
    productionDate: product.productionDate,
    status: product.status,
  };
}

export const MESSAGES = {
  MALFORMED_TOKEN: 'The scanned code is not a valid VERIQ verification code. It may be damaged, modified or not issued by VERIQ.',
  LEGACY_FORMAT: 'This label uses a retired URL format that is no longer accepted. Please contact the brand owner for a replacement label.',
  BAD_SIGNATURE: 'The code failed the signature check. It has been modified or forged and was not issued by VERIQ.',
  TOKEN_NOT_FOUND: 'This code is not registered. It may have been modified, forged or issued by another system.',
  TOKEN_REVOKED: 'This label has been revoked and is no longer active. Please contact the brand owner or retailer.',
  FIRST_SCAN: 'Registered label. This is the first verification of this code.',
  REPEAT_SCAN: 'Registered label. This code has been verified before; repeat scans by owners and retailers are normal.',
  PRODUCT_RECALLED: 'Registered label, but the product has been recalled by the manufacturer.',
  PRODUCT_INACTIVE: 'Registered label, but the product is currently marked inactive by the brand owner.',
  SUSPICIOUS_PATTERN:
    'Registered label, but the scan pattern matches one or more anomaly rules. The label may have been copied. The server cannot tell which physical label is the original.',
} as const;

export function createVerificationService(store: Store, secrets: { tokenHashSecret: string; qrSigningSecret: string }) {
  /**
   * Format → constant-time signature check → registry lookup → label status. The signature is
   * verified before any database access, so forged payloads never touch the token table.
   */
  function inspect(payload: string): Inspection {
    const parsed = parsePayload(payload);
    // Lookup key for vq1 payloads; for anything else, a fingerprint of the raw input (never stored itself).
    const tokenHash = hashToken(parsed.kind === 'vq1' ? parsed.token : payload.trim(), secrets.tokenHashSecret);
    const fp = fingerprint(tokenHash);
    const fail = (reasonCode: FailureCode, productId: string | null = null, tokenId: string | null = null): Inspection => ({
      ok: false,
      reasonCode,
      fingerprint: fp,
      productId,
      tokenId,
    });
    if (parsed.kind === 'legacy_url') return fail('LEGACY_FORMAT');
    if (parsed.kind !== 'vq1') return fail('MALFORMED_TOKEN');
    if (!verifySignature(parsed.token, parsed.signature, secrets.qrSigningSecret)) return fail('BAD_SIGNATURE');
    const token = store.findTokenByHash(tokenHash);
    if (!token) return fail('TOKEN_NOT_FOUND');
    if (token.status !== 'active') return fail('TOKEN_REVOKED', token.productId, token.id);
    const product = store.getProduct(token.productId);
    if (!product) return fail('TOKEN_NOT_FOUND');
    return { ok: true, token, product, fingerprint: fp };
  }

  function verify(input: VerifyInput): VerifyResponse {
    const at = input.now ?? new Date();
    const checkedAt = at.toISOString();
    const scannerId = input.scannerId?.trim() || 'UNREGISTERED';
    const location = input.location?.trim() || null;
    const source: ScanSource = input.source ?? 'manual';
    const base = {
      createdAt: checkedAt,
      tokenFingerprint: '',
      scannerId,
      location,
      source,
      userAgent: input.userAgent?.slice(0, 200) ?? null,
      appClient: input.appClient ?? null,
    };

    return transaction(store.raw, () => {
      const check = inspect(input.payload);
      base.tokenFingerprint = check.fingerprint;
      const fail = (result: VerificationResult, reasonCode: keyof typeof MESSAGES, productId: string | null, tokenId: string | null): VerifyResponse => {
        const eventId = store.insertEvent({
          ...base,
          result,
          reasonCode,
          reason: MESSAGES[reasonCode],
          productId,
          tokenId,
          repeatScan: false,
          flagged: false,
          rulesTriggered: [],
          scanNumber: null,
        });
        // No product details are disclosed for invalid or revoked codes.
        return { eventId, checkedAt, result, reasonCode, message: MESSAGES[reasonCode], product: null, scan: null };
      };

      if (!check.ok) return fail(check.reasonCode === 'TOKEN_REVOKED' ? 'revoked' : 'invalid', check.reasonCode, check.productId, check.tokenId);
      const { token, product } = check;

      const prior = store.priorScans(token.id);
      const rules = evaluateRules(store.getRules(), prior, { scannerId, location, at });
      const rulesTriggered = rules.filter((r) => r.triggered).map((r) => r.code);
      const flagged = rulesTriggered.length > 0;
      const scanNumber = prior.length + 1;
      const repeatScan = scanNumber > 1;

      let reasonCode: keyof typeof MESSAGES = repeatScan ? 'REPEAT_SCAN' : 'FIRST_SCAN';
      if (product.status === 'recalled') reasonCode = 'PRODUCT_RECALLED';
      else if (product.status === 'inactive') reasonCode = 'PRODUCT_INACTIVE';
      if (flagged) reasonCode = 'SUSPICIOUS_PATTERN';
      const result: VerificationResult = flagged ? 'suspicious' : 'authentic';

      const eventId = store.insertEvent({
        ...base,
        result,
        reasonCode,
        reason: MESSAGES[reasonCode],
        productId: product.id,
        tokenId: token.id,
        repeatScan,
        flagged,
        rulesTriggered,
        scanNumber,
      });

      return {
        eventId,
        checkedAt,
        result,
        reasonCode,
        message: MESSAGES[reasonCode],
        product: publicProduct(product),
        scan: {
          scanNumber,
          repeatScan,
          firstVerifiedAt: prior.length ? prior[prior.length - 1].createdAt : checkedAt,
          flagged,
          rulesTriggered,
          rules,
        },
      };
    });
  }

  return { verify, inspect };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
