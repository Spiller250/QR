import { createHmac } from 'node:crypto';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { CdpConfig } from '../config';

/**
 * Copy Detection Pattern (CDP).
 *
 * A P x P random binary grid is derived from HMAC-SHA256(CDP_SECRET, token) and printed in
 * the centre of the label's QR code. Cells are much smaller than QR modules (default
 * 0.15 mm), so a first-generation print keeps them crisp while copies lose them. Nothing
 * is stored: the grid is regenerated from the token whenever it is needed.
 *
 * Geometry (shared with cdp-service/app/analysis.py), in module units:
 *   N  = QR modules (error-correction level H)
 *   pm = pattern side = P * cellMm / moduleMm, centred
 *   k  = cleared square = ceil(pm + 2) modules (>= 1 white module around the pattern),
 *        adjusted to N's parity so it is centred on whole modules
 */

export const MAX_OVERLAY_COVERAGE = 0.12;
const QUIET_MODULES = 4;
const MM_TO_PT = 72 / 25.4;

export interface LabelGeometry {
  qrModules: number;
  moduleMm: number;
  gridSize: number;
  cellMm: number;
  patternModules: number;
  patternMm: number;
  clearModules: number;
  /** Fraction of the QR symbol area replaced by the cleared square. */
  coverage: number;
}

export interface LabelModel {
  payload: string;
  modules: boolean[][];
  geometry: LabelGeometry;
  /** Row-major, 1 = black. */
  grid: Uint8Array;
}

export interface LabelText {
  name: string;
  publicId: string;
  line2?: string;
}

/** Deterministic P*P bits from an HMAC-SHA256 stream keyed with CDP_SECRET. */
export function cdpGrid(token: string, secret: string, size: number): Uint8Array {
  const bits = new Uint8Array(size * size);
  let i = 0;
  for (let counter = 0; i < bits.length; counter++) {
    const block = createHmac('sha256', secret).update(`VERIQ-CDP-v1|${token}|${counter}`, 'utf8').digest();
    for (const byte of block) {
      for (let b = 7; b >= 0 && i < bits.length; b--) bits[i++] = (byte >> b) & 1;
    }
  }
  return bits;
}

export function gridToBits(grid: Uint8Array): string {
  return Array.from(grid, (b) => (b ? '1' : '0')).join('');
}

export function labelGeometry(qrModules: number, cfg: Pick<CdpConfig, 'gridSize' | 'cellMm' | 'qrMm'>): LabelGeometry {
  const moduleMm = cfg.qrMm / qrModules;
  const patternModules = (cfg.gridSize * cfg.cellMm) / moduleMm;
  let clearModules = Math.ceil(patternModules + 2);
  if ((qrModules - clearModules) % 2 !== 0) clearModules += 1;
  const coverage = (clearModules / qrModules) ** 2;
  if (coverage > MAX_OVERLAY_COVERAGE) {
    throw new Error(
      `CDP overlay covers ${(coverage * 100).toFixed(1)}% of the QR symbol (max ${MAX_OVERLAY_COVERAGE * 100}%). Reduce CDP_GRID_SIZE/CDP_CELL_MM or increase LABEL_QR_MM.`,
    );
  }
  return {
    qrModules,
    moduleMm,
    gridSize: cfg.gridSize,
    cellMm: cfg.cellMm,
    patternModules,
    patternMm: cfg.gridSize * cfg.cellMm,
    clearModules,
    coverage,
  };
}

export function buildLabelModel(payload: string, token: string, cfg: CdpConfig): LabelModel {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const modules: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(Boolean(qr.modules.get(r, c)));
    modules.push(row);
  }
  return { payload, modules, geometry: labelGeometry(n, cfg), grid: cdpGrid(token, cfg.secret, cfg.gridSize) };
}

/** Geometry parameters sent to the analysis service. */
export function analysisParams(model: LabelModel) {
  const g = model.geometry;
  return {
    grid: gridToBits(model.grid),
    gridSize: g.gridSize,
    qrModules: g.qrModules,
    clearModules: g.clearModules,
    patternModules: g.patternModules,
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** All black rectangles of the QR + CDP in millimetres, origin = top-left of the symbol. Horizontal runs are merged. */
export function labelRects(model: LabelModel): Rect[] {
  const g = model.geometry;
  const n = g.qrModules;
  const m = g.moduleMm;
  const c0 = (n - g.clearModules) / 2;
  const c1 = c0 + g.clearModules;
  const rects: Rect[] = [];
  for (let r = 0; r < n; r++) {
    let start = -1;
    for (let c = 0; c <= n; c++) {
      const cleared = r >= c0 && r < c1 && c >= c0 && c < c1;
      const on = c < n && model.modules[r][c] && !cleared;
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        rects.push({ x: start * m, y: r * m, w: (c - start) * m, h: m });
        start = -1;
      }
    }
  }
  const p = g.gridSize;
  const origin = ((n - g.patternModules) / 2) * m;
  const cell = g.cellMm;
  for (let r = 0; r < p; r++) {
    let start = -1;
    for (let c = 0; c <= p; c++) {
      const on = c < p && model.grid[r * p + c] === 1;
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        rects.push({ x: origin + start * cell, y: origin + r * cell, w: (c - start) * cell, h: cell });
        start = -1;
      }
    }
  }
  return rects;
}

const f = (v: number) => Number(v.toFixed(4)).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Print-ready vector label at exact physical size (mm). */
export function renderLabelSvg(model: LabelModel, text?: LabelText): string {
  const g = model.geometry;
  const quiet = QUIET_MODULES * g.moduleMm;
  const qrMm = g.qrModules * g.moduleMm;
  const symbolW = qrMm + 2 * quiet;
  // Approximate caption width (Helvetica ≈ 0.6 em per character) so long names are not clipped.
  const captionW = text ? Math.max(text.name.length * 2.6 * 0.6, (text.publicId.length + (text.line2?.length ?? 0) + 3) * 2.1 * 0.55) + 2 : 0;
  const width = Math.max(symbolW, captionW);
  const ox = (width - symbolW) / 2;
  const textH = text ? 9 : 0;
  const height = symbolW + textH;
  const rects = labelRects(model)
    .map((r) => `<rect x="${f(r.x + quiet + ox)}" y="${f(r.y + quiet)}" width="${f(r.w)}" height="${f(r.h)}"/>`)
    .join('');
  const caption = text
    ? `<g font-family="Helvetica, Arial, sans-serif" fill="#000">` +
      `<text x="${f(width / 2)}" y="${f(symbolW + 2.4)}" font-size="2.6" font-weight="700" text-anchor="middle">${esc(text.name)}</text>` +
      `<text x="${f(width / 2)}" y="${f(symbolW + 5.4)}" font-size="2.1" text-anchor="middle">${esc(text.publicId)}${text.line2 ? ` · ${esc(text.line2)}` : ''}</text>` +
      `<text x="${f(width / 2)}" y="${f(symbolW + 8.1)}" font-size="1.8" text-anchor="middle">Verify with the official VERIQ app</text></g>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}mm" height="${f(height)}mm" viewBox="0 0 ${f(width)} ${f(height)}" shape-rendering="crispEdges">` +
    `<rect width="${f(width)}" height="${f(height)}" fill="#fff"/>` +
    `<g fill="#000">${rects}</g>${caption}</svg>`
  );
}

/** Zoomed view of the pattern and its white border, for on-screen inspection (not for print). */
export function renderPatternSvg(model: LabelModel): string {
  const g = model.geometry;
  const p = g.gridSize;
  const border = 2;
  const size = p + 2 * border;
  let cells = '';
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < p; c++) {
      if (model.grid[r * p + c]) cells += `<rect x="${c + border}" y="${r + border}" width="1" height="1"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${cells}</g></svg>`
  );
}

function drawRuler(page: PDFPage, x: number, y: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  const k = MM_TO_PT;
  page.drawLine({ start: { x, y }, end: { x: x + 10 * k, y }, thickness: 0.6 });
  for (let i = 0; i <= 10; i++) {
    const h = i % 5 === 0 ? 3 : 1.6;
    page.drawLine({ start: { x: x + i * k, y }, end: { x: x + i * k, y: y + h * k }, thickness: 0.4 });
  }
  page.drawText('10 mm — measure after printing; must be exactly 10 mm', { x: x + 12 * k, y: y - 0.5, size: 7, font });
}

/** A4 sheet with the label at 100 % scale, a calibration ruler and print instructions. */
export async function renderLabelPdf(model: LabelModel, text: LabelText): Promise<Uint8Array> {
  const k = MM_TO_PT;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`VERIQ label ${text.publicId}`);
  pdf.setCreator('VERIQ POC');
  const page = pdf.addPage([210 * k, 297 * k]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageH = 297 * k;
  const g = model.geometry;
  const quiet = QUIET_MODULES * g.moduleMm;
  const left = 25;
  const top = 45;

  page.drawText('VERIQ — print-ready authentication label', { x: 20 * k, y: pageH - 20 * k, size: 14, font: bold });
  page.drawText('Print at 100% / Actual size, laser printer recommended.', { x: 20 * k, y: pageH - 27 * k, size: 10, font: bold, color: rgb(0.7, 0.1, 0.1) });
  page.drawText('Disable "Fit to page" / "Shrink oversized pages". Use plain white paper or label stock at the highest quality setting.', {
    x: 20 * k,
    y: pageH - 32 * k,
    size: 8,
    font,
  });

  // Label (vector rectangles at exact millimetre positions).
  const sym = (xmm: number, ymm: number, wmm: number, hmm: number) =>
    page.drawRectangle({ x: (left + quiet + xmm) * k, y: pageH - (top + quiet + ymm + hmm) * k, width: wmm * k, height: hmm * k, color: rgb(0, 0, 0) });
  for (const r of labelRects(model)) sym(r.x, r.y, r.w, r.h);
  const labelW = g.qrModules * g.moduleMm + 2 * quiet;
  // Cut line: wide enough for the caption, centred on the QR.
  const textW = Math.max(bold.widthOfTextAtSize(text.name, 7.5), font.widthOfTextAtSize(`${text.publicId} · ${text.line2 ?? ''}`, 6)) / k + 4;
  const frameW = Math.max(labelW, textW);
  page.drawRectangle({
    x: (left + labelW / 2 - frameW / 2) * k,
    y: pageH - (top + labelW + 10) * k,
    width: frameW * k,
    height: (labelW + 10) * k,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.3,
  });
  const cx = (left + labelW / 2) * k;
  const centered = (s: string, size: number, yMm: number, fnt = font) =>
    page.drawText(s, { x: cx - fnt.widthOfTextAtSize(s, size) / 2, y: pageH - yMm * k, size, font: fnt });
  centered(text.name, 7.5, top + labelW + 3.2, bold);
  centered(`${text.publicId}${text.line2 ? ` · ${text.line2}` : ''}`, 6, top + labelW + 6.2);
  centered('Verify with the official VERIQ app', 5.2, top + labelW + 9);

  drawRuler(page, 25 * k, pageH - (top + labelW + 22) * k, font);

  const specs = [
    `QR symbol: ${(g.qrModules * g.moduleMm).toFixed(1)} mm (${g.qrModules} modules, error correction H)`,
    `Copy detection pattern: ${g.gridSize} x ${g.gridSize} cells of ${g.cellMm} mm = ${g.patternMm.toFixed(1)} mm, centred (${(g.coverage * 100).toFixed(1)}% of the symbol)`,
    'Do not scale, re-photograph or re-print this label — copies are designed to fail verification.',
  ];
  specs.forEach((s, i) => page.drawText(s, { x: 25 * k, y: pageH - (top + labelW + 32 + i * 5) * k, size: 8, font }));
  return pdf.save();
}
