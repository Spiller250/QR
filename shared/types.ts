import type {
  AUTH_STATES,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  RULE_CODES,
  SCAN_SOURCES,
  TOKEN_STATUSES,
  VERIFICATION_RESULTS,
} from './constants';
import type { RepeatScanRules } from './schemas';

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type AuthState = (typeof AUTH_STATES)[number];
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];
export type ScanSource = (typeof SCAN_SOURCES)[number];
export type TokenStatus = (typeof TOKEN_STATUSES)[number];
export type RuleCode = keyof typeof RULE_CODES;

/** Admin-facing product record. Never includes secret tokens. */
export interface Product {
  id: string;
  publicId: string;
  name: string;
  sku: string;
  manufacturer: string;
  category: ProductCategory;
  batchNumber: string;
  productionDate: string;
  status: ProductStatus;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  authState: AuthState;
  scanCount: number;
  flaggedCount: number;
  lastScanAt: string | null;
}

/** Admin-only view of a label. `qrPayload` (VQ1.<token>.<sig>) embeds the secret token. */
export interface QrLabel {
  tokenId: string;
  status: TokenStatus;
  tokenPreview: string;
  qrPayload: string | null;
  issuedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  scanCount: number;
}

export interface ProductDetail extends Product {
  activeLabel: QrLabel | null;
  labelHistory: QrLabel[];
  recentEvents: VerificationEvent[];
}

export interface QrCodeRow extends QrLabel {
  productId: string;
  productName: string;
  productPublicId: string;
  sku: string;
}

export interface VerificationEvent {
  id: string;
  createdAt: string;
  result: VerificationResult;
  reasonCode: string;
  reason: string;
  productId: string | null;
  productName: string | null;
  productPublicId: string | null;
  tokenId: string | null;
  /** Non-reversible short fingerprint of the presented token, for correlating invalid attempts. */
  tokenFingerprint: string;
  scannerId: string;
  location: string | null;
  source: ScanSource;
  repeatScan: boolean;
  flagged: boolean;
  rulesTriggered: RuleCode[];
  scanNumber: number | null;
  userAgent: string | null;
  /** Authorized client application that submitted the scan (from its X-App-Key). Null for legacy rows. */
  appClient: string | null;
}

/** Public product info that may be disclosed to a scanner after a successful lookup. */
export interface PublicProductInfo {
  publicId: string;
  name: string;
  manufacturer: string;
  category: string;
  batchNumber: string;
  productionDate: string;
  status: ProductStatus;
}

export interface RuleEvaluation {
  code: RuleCode;
  triggered: boolean;
  observed: number;
  threshold: number;
  description: string;
}

export interface VerifyResponse {
  eventId: string;
  checkedAt: string;
  result: VerificationResult;
  reasonCode: string;
  message: string;
  product: PublicProductInfo | null;
  scan: {
    scanNumber: number;
    repeatScan: boolean;
    firstVerifiedAt: string | null;
    flagged: boolean;
    rulesTriggered: RuleCode[];
    rules: RuleEvaluation[];
  } | null;
}

export interface OverviewStats {
  totalProducts: number;
  activeLabels: number;
  labelsIssued: number;
  totalVerifications: number;
  suspiciousScans: number;
  invalidAttempts: number;
  revokedAttempts: number;
  authStateBreakdown: Record<AuthState, number>;
  resultBreakdown: Record<VerificationResult, number>;
  daily: { date: string; authentic: number; suspicious: number; invalid: number; revoked: number }[];
  recentEvents: VerificationEvent[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SettingsPayload {
  rules: RepeatScanRules;
  payloadFormat: string;
  /** IDs of authorized client applications (keys are never returned). */
  appClients: string[];
  rateLimitPerMinute: number;
  databasePath: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
