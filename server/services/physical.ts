import { parsePayload } from '../../shared/token';
import type { PhysicalResult, PhysicalVerifyResponse, RuleCode, ScanSource } from '../../shared/types';
import type { CdpConfig } from '../config';
import { transaction } from '../db';
import { analysisParams, buildLabelModel } from '../lib/cdp';
import type { CdpClient, CdpDiagnostics, CdpImage } from '../lib/cdpClient';
import type { Store } from '../store';
import { evaluateRules, MESSAGES, publicProduct, type VerificationService } from './verification';

export const PHYSICAL_MESSAGES: Record<string, string> = {
  CDP_MATCH: 'Original label: the copy-detection pattern matches a first-generation print.',
  CDP_DEGRADED:
    'Copy suspected: the copy-detection pattern is degraded. This label appears to be a reproduction (photocopy, re-print of a photo, or a screen).',
  NO_QR_FOUND: 'No VERIQ code was found in the photo. Centre the QR code in the frame and retake the photo.',
  CAPTURE_TOO_BLURRY: 'The photo is too blurry to check the copy-detection pattern. Hold steady, tap to focus and retake.',
  CAPTURE_TOO_FAR: 'The label is too small in the photo. Move closer (8–12 cm) and retake.',
  UNSUPPORTED_IMAGE: 'The image format is not supported. Use a JPEG or PNG photo straight from the camera.',
  PAYLOAD_MISMATCH: 'The photo could not be analysed consistently. Retake the photo.',
};

export interface PhysicalInput {
  image: CdpImage;
  scannerId?: string;
  location?: string;
  source?: Exclude<ScanSource, 'seed' | 'public_page'>;
  appClient: string | null;
  userAgent?: string | null;
  /** false = calibration run: analyse only, do not write a verification event. */
  record: boolean;
}

export type PhysicalOutcome = PhysicalVerifyResponse & { productId: string | null };

const message = (code: string) => PHYSICAL_MESSAGES[code] ?? (MESSAGES as Record<string, string>)[code] ?? code;

function pickDiagnostics(d: CdpDiagnostics | undefined) {
  if (!d) return {};
  const keys = ['pixelsPerCell', 'blurCells', 'sharpness', 'edgeWidthPx', 'qrSidePx', 'imageWidth', 'imageHeight', 'detector', 'bytes'] as const;
  return Object.fromEntries(keys.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));
}

/**
 * POST /api/verify-physical: photo → QR decode (Python) → VQ1 signature + registry check
 * (same rules as /api/verify) → CDP score (Python) → threshold → logged event.
 */
export function createPhysicalVerifier(deps: { store: Store; verifier: VerificationService; cdp: CdpClient; cdpConfig: CdpConfig }) {
  const { store, verifier, cdp, cdpConfig } = deps;

  async function check(input: PhysicalInput): Promise<PhysicalOutcome> {
    const checkedAt = new Date().toISOString();
    const threshold = store.getCdpThreshold(cdpConfig.defaultThreshold);
    const scannerId = input.scannerId?.trim() || 'UNREGISTERED';
    const location = input.location?.trim() || null;

    const finish = (o: {
      result: PhysicalResult;
      reasonCode: string;
      score?: number | null;
      productId?: string | null;
      tokenId?: string | null;
      fingerprint?: string;
      disclose?: boolean;
      components?: Record<string, number> | null;
      diagnostics?: CdpDiagnostics;
    }): PhysicalOutcome => {
      const score = o.score ?? null;
      let scan: PhysicalVerifyResponse['scan'] = null;
      let eventId: string | null = null;
      const counted = o.result === 'authentic' || o.result === 'copy_suspected';

      if (input.record) {
        eventId = transaction(store.raw, () => {
          let rulesTriggered: RuleCode[] = [];
          let scanNumber: number | null = null;
          if (counted && o.tokenId) {
            const prior = store.priorScans(o.tokenId);
            const rules = evaluateRules(store.getRules(), prior, { scannerId, location, at: new Date(checkedAt) });
            rulesTriggered = rules.filter((r) => r.triggered).map((r) => r.code);
            scanNumber = prior.length + 1;
            scan = { scanNumber, repeatScan: scanNumber > 1, rulesTriggered };
          }
          return store.insertEvent({
            createdAt: checkedAt,
            result: o.result,
            reasonCode: o.reasonCode,
            reason: message(o.reasonCode),
            productId: o.productId ?? null,
            tokenId: o.tokenId ?? null,
            tokenFingerprint: o.fingerprint ?? '',
            scannerId,
            location,
            source: input.source ?? 'camera',
            repeatScan: (scanNumber ?? 0) > 1,
            flagged: o.result === 'copy_suspected' || rulesTriggered.length > 0,
            rulesTriggered,
            scanNumber,
            userAgent: input.userAgent?.slice(0, 200) ?? null,
            appClient: input.appClient,
            checkType: 'physical',
            cdpScore: score,
            cdpThreshold: threshold,
          });
        });
      }

      const product = o.disclose && o.productId ? store.getProduct(o.productId) : null;
      return {
        eventId,
        checkedAt,
        result: o.result,
        reasonCode: o.reasonCode,
        message: message(o.reasonCode),
        score,
        threshold,
        product: product ? publicProduct(product) : null,
        scan,
        components: o.components ?? null,
        diagnostics: pickDiagnostics(o.diagnostics),
        productId: o.productId ?? null,
      };
    };

    // 1. Find and decode the QR code in the photo.
    const decoded = await cdp.decode(input.image);
    if (!decoded.decoded) {
      return finish({ result: 'unreadable', reasonCode: decoded.reasonCode ?? 'NO_QR_FOUND', diagnostics: decoded.diagnostics });
    }

    // 2. Same payload checks as /api/verify: format, signature (before DB), registry, status.
    const inspection = verifier.inspect(decoded.decoded);
    if (!inspection.ok) {
      return finish({
        result: 'invalid',
        reasonCode: inspection.reasonCode,
        productId: inspection.productId,
        tokenId: inspection.tokenId,
        fingerprint: inspection.fingerprint,
        diagnostics: decoded.diagnostics,
      });
    }
    const parsed = parsePayload(decoded.decoded);
    if (parsed.kind !== 'vq1') throw new Error('unreachable: inspected payload is not VQ1');

    // 3. Score the copy-detection pattern against the template derived from this token.
    const model = buildLabelModel(decoded.decoded.trim(), parsed.token, cdpConfig);
    const analysis = await cdp.analyze(input.image, { ...analysisParams(model), expectedPayload: decoded.decoded.trim() });
    const base = {
      productId: inspection.product.id,
      tokenId: inspection.token.id,
      fingerprint: inspection.fingerprint,
      diagnostics: analysis.diagnostics,
      components: analysis.components ?? null,
    };
    if (analysis.status !== 'ok' || typeof analysis.score !== 'number') {
      return finish({ ...base, result: 'unreadable', reasonCode: analysis.reasonCode ?? 'CAPTURE_TOO_BLURRY' });
    }

    // 4. Decision.
    const authentic = analysis.score >= threshold;
    return finish({
      ...base,
      result: authentic ? 'authentic' : 'copy_suspected',
      reasonCode: authentic ? 'CDP_MATCH' : 'CDP_DEGRADED',
      score: analysis.score,
      disclose: true,
    });
  }

  return { check };
}

export type PhysicalVerifier = ReturnType<typeof createPhysicalVerifier>;
