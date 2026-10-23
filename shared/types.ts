import type {
  AUTH_STATES,
  CALIBRATION_TAGS,
  CHECK_TYPES,
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
export type CheckType = (typeof CHECK_TYPES)[number];
export type CalibrationTag = (typeof CALIBRATION_TAGS)[number];

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
  /** `payload` = /api/verify (QR text), `physical` = /api/verify-physical (photo + CDP). */
  checkType: CheckType;
  cdpScore: number | null;
  cdpThreshold: number | null;
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
  daily: ({ date: string } & Record<VerificationResult, number>)[];
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
  cdp: CdpSettings;
  /** Private IPv4 addresses of the server, for opening /scan-physical from a phone on the same Wi-Fi. */
  lanAddresses: string[];
}

export interface CdpSettings {
  threshold: number;
  defaultThreshold: number;
  gridSize: number;
  cellMm: number;
  patternMm: number;
  qrMm: number;
  serviceUrl: string;
  serviceOnline: boolean;
}

export type PhysicalResult = 'authentic' | 'copy_suspected' | 'unreadable' | 'invalid';

export interface CdpDiagnosticsInfo {
  pixelsPerCell?: number;
  blurCells?: number;
  sharpness?: number;
  edgeWidthPx?: number;
  qrSidePx?: number;
  imageWidth?: number;
  imageHeight?: number;
  detector?: string;
  bytes?: number;
}

/** Response of POST /api/verify-physical. */
export interface PhysicalVerifyResponse {
  eventId: string | null;
  checkedAt: string;
  result: PhysicalResult;
  reasonCode: string;
  message: string;
  score: number | null;
  threshold: number;
  product: PublicProductInfo | null;
  scan: { scanNumber: number; repeatScan: boolean; rulesTriggered: RuleCode[] } | null;
  components: Record<string, number> | null;
  diagnostics: CdpDiagnosticsInfo;
}

export interface CalibrationSample {
  id: string;
  createdAt: string;
  tag: CalibrationTag;
  note: string | null;
  status: PhysicalResult;
  reasonCode: string | null;
  score: number | null;
  productId: string | null;
  productName: string | null;
  components: Record<string, number>;
  diagnostics: CdpDiagnosticsInfo;
}

export interface CalibrationSummary {
  items: CalibrationSample[];
  threshold: number;
  suggestion: {
    threshold: number;
    lowestOriginal: number;
    highestCopy: number;
    separable: boolean;
  } | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
