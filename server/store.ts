import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
import type { Db } from './db';
import { DEFAULT_RULES, rulesSchema, type ProductInput, type ProductUpdate, type RepeatScanRules } from '../shared/schemas';
import { VERIFICATION_RESULTS } from '../shared/constants';
import type {
  AuthState,
  CalibrationSample,
  CalibrationTag,
  CheckType,
  PhysicalResult,
  OverviewStats,
  Paginated,
  Product,
  QrCodeRow,
  QrLabel,
  RuleCode,
  ScanSource,
  VerificationEvent,
  VerificationResult,
} from '../shared/types';
import { generateId, generatePublicId } from './lib/crypto';

type Row = Record<string, SQLOutputValue>;
type Cell = SQLOutputValue | undefined;

export interface TokenRecord {
  id: string;
  productId: string;
  tokenHash: string;
  tokenPlain: string | null;
  tokenPreview: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface NewEvent {
  createdAt: string;
  result: VerificationResult;
  reasonCode: string;
  reason: string;
  productId: string | null;
  tokenId: string | null;
  tokenFingerprint: string;
  scannerId: string;
  location: string | null;
  source: ScanSource;
  repeatScan: boolean;
  flagged: boolean;
  rulesTriggered: RuleCode[];
  scanNumber: number | null;
  userAgent: string | null;
  appClient: string | null;
  checkType?: CheckType;
  cdpScore?: number | null;
  cdpThreshold?: number | null;
}

export interface NewCalibrationSample {
  tag: CalibrationTag;
  note: string | null;
  status: PhysicalResult;
  reasonCode: string | null;
  score: number | null;
  productId: string | null;
  components: Record<string, number>;
  diagnostics: CalibrationSample['diagnostics'];
}

/** Renders the QR payload for a token. Injected so the store never sees the signing secret. */
export type PayloadSigner = (token: string) => string;

export interface PriorScan {
  createdAt: string;
  scannerId: string;
  location: string | null;
}

const str = (v: Cell): string => String(v);
const strOrNull = (v: Cell): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: Cell): number => Number(v ?? 0);

const PRODUCT_CTE = `
WITH base AS (
  SELECT p.*, t.id AS active_token_id,
    (SELECT COUNT(*) FROM verification_events e WHERE e.product_id = p.id AND e.result IN ('authentic','suspicious')) AS scan_count,
    (SELECT COUNT(*) FROM verification_events e WHERE e.product_id = p.id AND e.flagged = 1) AS flagged_count,
    (SELECT MAX(e.created_at) FROM verification_events e WHERE e.product_id = p.id) AS last_scan_at,
    (SELECT COUNT(*) FROM verification_events e WHERE e.token_id = t.id AND e.result IN ('authentic','suspicious')) AS active_scans,
    (SELECT COUNT(*) FROM verification_events e WHERE e.token_id = t.id AND e.flagged = 1) AS active_flags
  FROM products p
  LEFT JOIN qr_tokens t ON t.product_id = p.id AND t.status = 'active'
),
derived AS (
  SELECT *, CASE
    WHEN active_token_id IS NULL THEN 'no_active_label'
    WHEN active_flags > 0 THEN 'flagged'
    WHEN active_scans > 0 THEN 'verified'
    ELSE 'not_scanned' END AS auth_state
  FROM base
)`;

const SORTS: Record<string, string> = {
  created_desc: 'created_at DESC',
  created_asc: 'created_at ASC',
  name_asc: 'name COLLATE NOCASE ASC',
  name_desc: 'name COLLATE NOCASE DESC',
  scans_desc: 'scan_count DESC, created_at DESC',
};

const EVENT_SELECT = `
SELECT e.*, p.name AS product_name, p.public_id AS product_public_id
FROM verification_events e
LEFT JOIN products p ON p.id = e.product_id`;

export class Store {
  constructor(private readonly db: Db) {}

  get raw(): Db {
    return this.db;
  }

  // ---------- Products ----------

  private mapProduct(r: Row): Product {
    return {
      id: str(r.id),
      publicId: str(r.public_id),
      name: str(r.name),
      sku: str(r.sku),
      manufacturer: str(r.manufacturer),
      category: str(r.category) as Product['category'],
      batchNumber: str(r.batch_number),
      productionDate: str(r.production_date),
      status: str(r.status) as Product['status'],
      isDemo: num(r.is_demo) === 1,
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
      authState: str(r.auth_state) as AuthState,
      scanCount: num(r.scan_count),
      flaggedCount: num(r.flagged_count),
      lastScanAt: strOrNull(r.last_scan_at),
    };
  }

  listProducts(query: {
    q?: string;
    category?: string;
    status?: string;
    authState?: string;
    sort: string;
    page: number;
    pageSize: number;
  }): Paginated<Product> {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (query.q) {
      where.push('(name LIKE ? OR sku LIKE ? OR public_id LIKE ? OR id = ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like, query.q);
    }
    if (query.category) {
      where.push('category = ?');
      params.push(query.category);
    }
    if (query.status) {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query.authState) {
      where.push('auth_state = ?');
      params.push(query.authState);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = num(this.db.prepare(`${PRODUCT_CTE} SELECT COUNT(*) AS n FROM derived ${whereSql}`).get(...params)?.n);
    const order = SORTS[query.sort] ?? SORTS.created_desc;
    const rows = this.db
      .prepare(`${PRODUCT_CTE} SELECT * FROM derived ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, query.pageSize, (query.page - 1) * query.pageSize);
    return { items: rows.map((r) => this.mapProduct(r as Row)), total, page: query.page, pageSize: query.pageSize };
  }

  getProduct(id: string): Product | null {
    const row = this.db.prepare(`${PRODUCT_CTE} SELECT * FROM derived WHERE id = ?`).get(id);
    return row ? this.mapProduct(row as Row) : null;
  }

  skuExists(sku: string, exceptId?: string): boolean {
    const row = this.db.prepare('SELECT id FROM products WHERE sku = ? AND id != ?').get(sku, exceptId ?? '');
    return Boolean(row);
  }

  insertProduct(input: ProductInput, opts: { isDemo?: boolean; now?: string } = {}): string {
    const now = opts.now ?? new Date().toISOString();
    const id = generateId('prd');
    let publicId = generatePublicId();
    while (this.db.prepare('SELECT 1 FROM products WHERE public_id = ?').get(publicId)) publicId = generatePublicId();
    this.db
      .prepare(
        `INSERT INTO products (id, public_id, name, sku, manufacturer, category, batch_number, production_date, status, is_demo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, publicId, input.name, input.sku, input.manufacturer, input.category, input.batchNumber, input.productionDate, input.status, opts.isDemo ? 1 : 0, now, now);
    return id;
  }

  updateProduct(id: string, patch: ProductUpdate): void {
    const columns: Record<keyof ProductUpdate, string> = {
      name: 'name',
      sku: 'sku',
      manufacturer: 'manufacturer',
      category: 'category',
      batchNumber: 'batch_number',
      productionDate: 'production_date',
      status: 'status',
    };
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    for (const [key, column] of Object.entries(columns) as [keyof ProductUpdate, string][]) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(patch[key] as string);
      }
    }
    if (!sets.length) return;
    sets.push('updated_at = ?');
    params.push(new Date().toISOString(), id);
    this.db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  // ---------- Tokens ----------

  private mapToken(r: Row): TokenRecord {
    return {
      id: str(r.id),
      productId: str(r.product_id),
      tokenHash: str(r.token_hash),
      tokenPlain: strOrNull(r.token_plain),
      tokenPreview: str(r.token_preview),
      status: str(r.status) as TokenRecord['status'],
      createdAt: str(r.created_at),
      revokedAt: strOrNull(r.revoked_at),
      revokeReason: strOrNull(r.revoke_reason),
    };
  }

  insertToken(t: { productId: string; tokenHash: string; tokenPlain: string; tokenPreview: string; createdAt: string }): string {
    const id = generateId('tok');
    this.db
      .prepare(`INSERT INTO qr_tokens (id, product_id, token_hash, token_plain, token_preview, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)`)
      .run(id, t.productId, t.tokenHash, t.tokenPlain, t.tokenPreview, t.createdAt);
    return id;
  }

  /** Revokes the active token and discards its plaintext; the HMAC stays so old labels are still recognised as revoked. */
  revokeActiveToken(productId: string, reason: string, now: string): TokenRecord | null {
    const active = this.getActiveToken(productId);
    if (!active) return null;
    this.db
      .prepare(`UPDATE qr_tokens SET status = 'revoked', token_plain = NULL, revoked_at = ?, revoke_reason = ? WHERE id = ?`)
      .run(now, reason, active.id);
    return { ...active, status: 'revoked', tokenPlain: null, revokedAt: now, revokeReason: reason };
  }

  getActiveToken(productId: string): TokenRecord | null {
    const row = this.db.prepare(`SELECT * FROM qr_tokens WHERE product_id = ? AND status = 'active'`).get(productId);
    return row ? this.mapToken(row as Row) : null;
  }

  findTokenByHash(tokenHash: string): TokenRecord | null {
    const row = this.db.prepare('SELECT * FROM qr_tokens WHERE token_hash = ?').get(tokenHash);
    return row ? this.mapToken(row as Row) : null;
  }

  private tokenScanCount(tokenId: string): number {
    return num(
      this.db.prepare(`SELECT COUNT(*) AS n FROM verification_events WHERE token_id = ? AND result IN ('authentic','suspicious')`).get(tokenId)?.n,
    );
  }

  toLabel(t: TokenRecord, sign: PayloadSigner): QrLabel {
    return {
      tokenId: t.id,
      status: t.status,
      tokenPreview: t.tokenPreview,
      qrPayload: t.status === 'active' && t.tokenPlain ? sign(t.tokenPlain) : null,
      issuedAt: t.createdAt,
      revokedAt: t.revokedAt,
      revokeReason: t.revokeReason,
      scanCount: this.tokenScanCount(t.id),
    };
  }

  listTokensForProduct(productId: string): TokenRecord[] {
    return this.db
      .prepare('SELECT * FROM qr_tokens WHERE product_id = ? ORDER BY created_at DESC')
      .all(productId)
      .map((r) => this.mapToken(r as Row));
  }

  listQrCodes(filter: { status?: string; q?: string }, sign: PayloadSigner): QrCodeRow[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.status) {
      where.push('t.status = ?');
      params.push(filter.status);
    }
    if (filter.q) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.public_id LIKE ?)');
      const like = `%${filter.q}%`;
      params.push(like, like, like);
    }
    const rows = this.db
      .prepare(
        `SELECT t.*, p.name AS product_name, p.public_id AS product_public_id, p.sku AS sku
         FROM qr_tokens t JOIN products p ON p.id = t.product_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY t.created_at DESC`,
      )
      .all(...params) as Row[];
    return rows.map((r) => ({
      ...this.toLabel(this.mapToken(r), sign),
      productId: str(r.product_id),
      productName: str(r.product_name),
      productPublicId: str(r.product_public_id),
      sku: str(r.sku),
    }));
  }

  // ---------- Verification events ----------

  /** Prior successful lookups for a token, newest first. */
  priorScans(tokenId: string): PriorScan[] {
    return this.db
      .prepare(
        `SELECT created_at, scanner_id, location FROM verification_events
         WHERE token_id = ? AND result IN ('authentic','suspicious','copy_suspected') ORDER BY created_at DESC`,
      )
      .all(tokenId)
      .map((r) => ({ createdAt: str(r.created_at), scannerId: str(r.scanner_id), location: strOrNull(r.location) }));
  }

  insertEvent(e: NewEvent): string {
    const id = generateId('evt');
    this.db
      .prepare(
        `INSERT INTO verification_events
         (id, created_at, result, reason_code, reason, product_id, token_id, token_fingerprint, scanner_id, location, source, repeat_scan, flagged, rules_triggered, scan_number, user_agent, app_client, check_type, cdp_score, cdp_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        e.createdAt,
        e.result,
        e.reasonCode,
        e.reason,
        e.productId,
        e.tokenId,
        e.tokenFingerprint,
        e.scannerId,
        e.location,
        e.source,
        e.repeatScan ? 1 : 0,
        e.flagged ? 1 : 0,
        JSON.stringify(e.rulesTriggered),
        e.scanNumber,
        e.userAgent,
        e.appClient,
        e.checkType ?? 'payload',
        e.cdpScore ?? null,
        e.cdpThreshold ?? null,
      );
    return id;
  }

  private mapEvent(r: Row): VerificationEvent {
    return {
      id: str(r.id),
      createdAt: str(r.created_at),
      result: str(r.result) as VerificationResult,
      reasonCode: str(r.reason_code),
      reason: str(r.reason),
      productId: strOrNull(r.product_id),
      productName: strOrNull(r.product_name),
      productPublicId: strOrNull(r.product_public_id),
      tokenId: strOrNull(r.token_id),
      tokenFingerprint: str(r.token_fingerprint),
      scannerId: str(r.scanner_id),
      location: strOrNull(r.location),
      source: str(r.source) as ScanSource,
      repeatScan: num(r.repeat_scan) === 1,
      flagged: num(r.flagged) === 1,
      rulesTriggered: JSON.parse(str(r.rules_triggered)) as RuleCode[],
      scanNumber: r.scan_number === null ? null : num(r.scan_number),
      userAgent: strOrNull(r.user_agent),
      appClient: strOrNull(r.app_client),
      checkType: (strOrNull(r.check_type) ?? 'payload') as CheckType,
      cdpScore: r.cdp_score === null || r.cdp_score === undefined ? null : num(r.cdp_score),
      cdpThreshold: r.cdp_threshold === null || r.cdp_threshold === undefined ? null : num(r.cdp_threshold),
    };
  }

  getEvent(id: string): VerificationEvent | null {
    const row = this.db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id);
    return row ? this.mapEvent(row as Row) : null;
  }

  listEvents(query: {
    q?: string;
    result?: string;
    flagged?: string;
    productId?: string;
    source?: string;
    page: number;
    pageSize: number;
  }): Paginated<VerificationEvent> {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (query.q) {
      where.push(
        '(p.name LIKE ? OR p.public_id LIKE ? OR e.scanner_id LIKE ? OR e.location LIKE ? OR e.reason_code LIKE ? OR e.app_client LIKE ? OR e.id = ?)',
      );
      const like = `%${query.q}%`;
      params.push(like, like, like, like, like, like, query.q);
    }
    if (query.result) {
      where.push('e.result = ?');
      params.push(query.result);
    }
    if (query.flagged) {
      where.push('e.flagged = ?');
      params.push(query.flagged === 'true' ? 1 : 0);
    }
    if (query.productId) {
      where.push('e.product_id = ?');
      params.push(query.productId);
    }
    if (query.source) {
      where.push('e.source = ?');
      params.push(query.source);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = num(
      this.db.prepare(`SELECT COUNT(*) AS n FROM verification_events e LEFT JOIN products p ON p.id = e.product_id ${whereSql}`).get(...params)?.n,
    );
    const rows = this.db
      .prepare(`${EVENT_SELECT} ${whereSql} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, query.pageSize, (query.page - 1) * query.pageSize);
    return { items: rows.map((r) => this.mapEvent(r as Row)), total, page: query.page, pageSize: query.pageSize };
  }

  // ---------- Stats ----------

  overview(days = 14): OverviewStats {
    const one = (sql: string, ...p: SQLInputValue[]) => num(this.db.prepare(sql).get(...p)?.n);
    const authRows = this.db.prepare(`${PRODUCT_CTE} SELECT auth_state, COUNT(*) AS n FROM derived GROUP BY auth_state`).all();
    const authStateBreakdown: Record<AuthState, number> = { verified: 0, not_scanned: 0, flagged: 0, no_active_label: 0 };
    for (const r of authRows) authStateBreakdown[str(r.auth_state) as AuthState] = num(r.n);

    const resultRows = this.db.prepare('SELECT result, COUNT(*) AS n FROM verification_events GROUP BY result').all();
    const zero = () => Object.fromEntries(VERIFICATION_RESULTS.map((k) => [k, 0])) as Record<VerificationResult, number>;
    const resultBreakdown = zero();
    for (const r of resultRows) resultBreakdown[str(r.result) as VerificationResult] = num(r.n);

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const dailyRows = this.db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS d, result, COUNT(*) AS n FROM verification_events
         WHERE created_at >= ? GROUP BY d, result`,
      )
      .all(start.toISOString());
    const daily: OverviewStats['daily'] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      daily.push({ date: d.toISOString().slice(0, 10), ...zero() });
    }
    const byDate = new Map(daily.map((d) => [d.date, d]));
    for (const r of dailyRows) {
      const bucket = byDate.get(str(r.d));
      if (bucket) bucket[str(r.result) as VerificationResult] = num(r.n);
    }

    return {
      totalProducts: one('SELECT COUNT(*) AS n FROM products'),
      activeLabels: one(`SELECT COUNT(*) AS n FROM qr_tokens WHERE status = 'active'`),
      labelsIssued: one('SELECT COUNT(*) AS n FROM qr_tokens'),
      totalVerifications: one('SELECT COUNT(*) AS n FROM verification_events'),
      suspiciousScans: one('SELECT COUNT(*) AS n FROM verification_events WHERE flagged = 1'),
      invalidAttempts: resultBreakdown.invalid,
      revokedAttempts: resultBreakdown.revoked,
      authStateBreakdown,
      resultBreakdown,
      daily,
      recentEvents: this.listEvents({ page: 1, pageSize: 8 }).items,
    };
  }

  // ---------- Settings & sessions ----------

  getRules(): RepeatScanRules {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'rules'`).get();
    if (!row) return DEFAULT_RULES;
    const parsed = rulesSchema.safeParse(JSON.parse(str(row.value)));
    return parsed.success ? parsed.data : DEFAULT_RULES;
  }

  setRules(rules: RepeatScanRules): void {
    this.db.prepare(`INSERT INTO settings (key, value) VALUES ('rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(rules));
  }

  createSession(tokenHash: string, email: string, ttlMs: number): void {
    const now = Date.now();
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date(now).toISOString());
    this.db
      .prepare('INSERT INTO sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, email, new Date(now).toISOString(), new Date(now + ttlMs).toISOString());
  }

  findSession(tokenHash: string): { email: string } | null {
    const row = this.db.prepare('SELECT email FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, new Date().toISOString());
    return row ? { email: str(row.email) } : null;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  getCdpThreshold(fallback: number): number {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'cdp_threshold'`).get();
    const v = row ? Number(JSON.parse(str(row.value))) : NaN;
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  }

  setCdpThreshold(threshold: number): void {
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES ('cdp_threshold', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(JSON.stringify(threshold));
  }

  // ---------- Calibration samples ----------

  insertCalibrationSample(s: NewCalibrationSample): string {
    const id = generateId('cal');
    this.db
      .prepare(
        `INSERT INTO calibration_samples (id, created_at, tag, note, status, reason_code, score, product_id, components, diagnostics)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, new Date().toISOString(), s.tag, s.note, s.status, s.reasonCode, s.score, s.productId, JSON.stringify(s.components), JSON.stringify(s.diagnostics));
    return id;
  }

  listCalibrationSamples(): CalibrationSample[] {
    return this.db
      .prepare(
        `SELECT c.*, p.name AS product_name FROM calibration_samples c LEFT JOIN products p ON p.id = c.product_id ORDER BY c.created_at DESC`,
      )
      .all()
      .map((r) => ({
        id: str(r.id),
        createdAt: str(r.created_at),
        tag: str(r.tag) as CalibrationTag,
        note: strOrNull(r.note),
        status: str(r.status) as PhysicalResult,
        reasonCode: strOrNull(r.reason_code),
        score: r.score === null || r.score === undefined ? null : num(r.score),
        productId: strOrNull(r.product_id),
        productName: strOrNull(r.product_name),
        components: JSON.parse(str(r.components)) as Record<string, number>,
        diagnostics: JSON.parse(str(r.diagnostics)) as CalibrationSample['diagnostics'],
      }));
  }

  deleteCalibrationSample(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM calibration_samples WHERE id = ?').run(id).changes) > 0;
  }

  clearCalibrationSamples(): void {
    this.db.exec('DELETE FROM calibration_samples');
  }

  /**
   * Removes demo content (products, tokens, events) and restores default repeat-scan rules.
   * Sessions, calibration samples and the calibrated CDP threshold are kept: they describe
   * the printer/camera setup, not the demo catalogue.
   */
  wipeData(): void {
    this.db.exec("DELETE FROM verification_events; DELETE FROM qr_tokens; DELETE FROM products; DELETE FROM settings WHERE key = 'rules';");
  }
}
