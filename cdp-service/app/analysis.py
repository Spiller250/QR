"""
Copy Detection Pattern (CDP) analysis.

Geometry contract (shared with server/lib/cdp.ts), in QR *module* units, origin at the
top-left corner of the QR symbol (quiet zone excluded):

    N   qr_modules        symbol size (e.g. 37 for version 5)
    k   clear_modules     white square of k x k modules cleared at the centre
    P   grid_size         pattern has P x P cells (row-major bits, "1" = black)
    pm  pattern_modules   pattern side length in modules (P * cell_mm / module_mm)

The pattern is centred in the symbol. Its cells are far smaller than QR modules, so a
first-generation print keeps them crisp while copying (scan/print, photo of a screen,
re-print of a photo) smears or aliases them. We measure how well the captured cells still
match the expected random template.

This is a heuristic signal that must be calibrated against real prints and copies. It is
not a guarantee.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

# Canonical resampling resolution: pixels per CDP cell after rectification.
CANON_PX_PER_CELL = 8
# Capture-quality gates (tuned on synthetic captures; see tests/).
MIN_PIXELS_PER_CELL = 2.2
MAX_BLUR_CELLS = 1.35
# High-frequency ratio normalisation (pattern vs QR-module Laplacian energy).
HF_RATIO_LO = 1.0
HF_RATIO_HI = 4.0
# Isolated-cell contrast of a good first-generation print (ratio vs uniform blocks).
ISO_REFERENCE = 0.85
# Pixel-level template correlation mapped from [PIX_LO, PIX_HI] to [0, 1].
PIX_LO, PIX_HI = 0.5, 0.9
# Fidelity weights; the weighted sum is gated by the cell correlation (template match).
W_ISOLATED, W_PIXEL, W_HF = 0.5, 0.3, 0.2
DETECT_MAX_SIDES = (1600, 2400, None)


@dataclass
class Geometry:
    qr_modules: int
    clear_modules: int
    grid_size: int
    pattern_modules: float

    @property
    def cell_modules(self) -> float:
        return self.pattern_modules / self.grid_size

    @property
    def clear_origin(self) -> float:
        return (self.qr_modules - self.clear_modules) / 2

    @property
    def pattern_origin(self) -> float:
        return (self.qr_modules - self.pattern_modules) / 2


def parse_grid(bits: str, size: int) -> np.ndarray:
    bits = bits.strip()
    if len(bits) != size * size or any(c not in "01" for c in bits):
        raise ValueError(f"grid must be {size * size} characters of 0/1")
    return (np.frombuffer(bits.encode(), dtype=np.uint8) - ord("0")).reshape(size, size)


def load_image(data: bytes) -> Optional[np.ndarray]:
    arr = np.frombuffer(data, dtype=np.uint8)
    if arr.size == 0:
        return None
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


# --------------------------------------------------------------------------- detection


def _order_corners(pts: np.ndarray) -> np.ndarray:
    return np.asarray(pts, dtype=np.float32).reshape(4, 2)


def detect_qr(gray: np.ndarray) -> tuple[Optional[str], Optional[np.ndarray], str]:
    """Returns (decoded_text, corners[4x2] in full-res pixel coords, detector_name)."""
    h, w = gray.shape[:2]
    detector = cv2.QRCodeDetector()
    wechat = None
    if hasattr(cv2, "wechat_qrcode_WeChatQRCode"):
        try:
            wechat = cv2.wechat_qrcode_WeChatQRCode()
        except cv2.error:
            wechat = None

    for max_side in DETECT_MAX_SIDES:
        scale = 1.0 if max_side is None else min(1.0, max_side / max(h, w))
        if max_side is not None and scale == 1.0 and max(h, w) <= max_side and max_side != DETECT_MAX_SIDES[0]:
            continue  # same as a previous attempt
        img = gray if scale == 1.0 else cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        try:
            text, pts, _ = detector.detectAndDecode(img)
        except cv2.error:
            text, pts = "", None
        if text and pts is not None:
            return text, _order_corners(pts) / scale, "opencv"
        if wechat is not None:
            try:
                texts, points = wechat.detectAndDecode(img)
            except cv2.error:
                texts, points = [], []
            if texts and len(points) and texts[0]:
                return texts[0], _order_corners(points[0]) / scale, "wechat"
    return None, None, "none"


# --------------------------------------------------------------------------- diagnostics


def capture_diagnostics(gray: np.ndarray, corners: np.ndarray, geom: Optional[Geometry]) -> dict:
    side = float(np.mean([np.linalg.norm(corners[i] - corners[(i + 1) % 4]) for i in range(4)]))
    x0, y0 = np.floor(corners.min(axis=0)).astype(int)
    x1, y1 = np.ceil(corners.max(axis=0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0)
    crop = gray[y0 : y1 + 1, x0 : x1 + 1].astype(np.float32)
    lo, hi = np.percentile(crop, [5, 95]) if crop.size else (0.0, 0.0)
    contrast = float(hi - lo)
    gx = cv2.Sobel(crop, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(crop, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt(gx * gx + gy * gy) / 8.0
    slope = float(np.percentile(grad, 99.5)) if grad.size else 0.0
    # For an edge of contrast C spread over w pixels the peak slope is ~C/w.
    edge_width = contrast / slope if slope > 1e-6 else float("inf")

    out = {
        "imageWidth": int(gray.shape[1]),
        "imageHeight": int(gray.shape[0]),
        "qrSidePx": round(side, 1),
        "contrast": round(contrast, 1),
        "edgeWidthPx": round(edge_width, 2),
    }
    if geom is not None:
        ppc = side / geom.qr_modules * geom.cell_modules
        blur_cells = edge_width / ppc if ppc > 0 else float("inf")
        out.update(
            {
                "pixelsPerCell": round(ppc, 2),
                "blurCells": round(blur_cells, 3),
                # 1.0 = perfectly sharp; 0 = edge spread over >= MAX_BLUR_CELLS cells.
                "sharpness": round(float(np.clip(1 - (blur_cells - 0.4) / (MAX_BLUR_CELLS - 0.4), 0, 1)), 3),
            }
        )
    return out


# --------------------------------------------------------------------------- scoring


def _normalise(img: np.ndarray, sigma: float) -> np.ndarray:
    mu = cv2.GaussianBlur(img, (0, 0), sigma)
    sq = cv2.GaussianBlur(img * img, (0, 0), sigma)
    sd = np.sqrt(np.maximum(sq - mu * mu, 1e-6))
    return (img - mu) / (sd + 1e-3)


def _template(grid: np.ndarray, px: int) -> np.ndarray:
    # Dark cells -> -1, light -> +1, matching intensity polarity.
    t = np.where(grid == 1, -1.0, 1.0).astype(np.float32)
    return cv2.resize(t, (grid.shape[1] * px, grid.shape[0] * px), interpolation=cv2.INTER_NEAREST)


def _cell_means(region: np.ndarray, p: int, cell_px: float, inset: float = 0.25) -> np.ndarray:
    means = np.empty((p, p), dtype=np.float32)
    for r in range(p):
        y0, y1 = int(round((r + inset) * cell_px)), int(round((r + 1 - inset) * cell_px))
        for c in range(p):
            x0, x1 = int(round((c + inset) * cell_px)), int(round((c + 1 - inset) * cell_px))
            patch = region[y0:max(y1, y0 + 1), x0:max(x1, x0 + 1)]
            means[r, c] = float(patch.mean()) if patch.size else 0.0
    return means


def _isolated_contrast_ratio(means: np.ndarray, grid: np.ndarray) -> float:
    """
    Contrast of isolated cells (all 4 neighbours differ) relative to cells inside uniform
    blocks (all 4 neighbours equal). Optical copying spreads ink/light across neighbouring
    cells, so isolated cells lose contrast first; a first-generation print keeps the ratio
    close to its own baseline.
    """
    g = grid.astype(np.int8)
    pad = np.pad(g, 1, mode="edge")
    same = (
        (pad[:-2, 1:-1] == g).astype(np.int8)
        + (pad[2:, 1:-1] == g)
        + (pad[1:-1, :-2] == g)
        + (pad[1:-1, 2:] == g)
    )
    iso, uni = same == 0, same == 4
    def contrast(mask: np.ndarray) -> Optional[float]:
        white, black = means[mask & (g == 0)], means[mask & (g == 1)]
        if white.size < 3 or black.size < 3:
            return None
        return float(white.mean() - black.mean())
    ci, cu = contrast(iso), contrast(uni)
    if ci is None or cu is None or cu <= 1e-6:
        return 0.0
    return float(np.clip(ci / cu, 0.0, 1.5))


def _cell_correlation(region: np.ndarray, grid: np.ndarray, cell_px: float) -> float:
    """Pearson correlation between per-cell mean intensity and the expected bits."""
    means = _cell_means(region, grid.shape[0], cell_px)
    v = -means.ravel()  # dark = 1
    b = grid.ravel().astype(np.float32)
    if v.std() < 1e-6 or b.std() < 1e-6:
        return 0.0
    return float(np.corrcoef(v, b)[0, 1])


def analyze_capture(img: np.ndarray, geom: Optional[Geometry] = None, grid: Optional[np.ndarray] = None) -> dict:
    """Full pipeline. Without geom/grid it only decodes and reports capture diagnostics."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    text, corners, detector = detect_qr(gray)
    if text is None or corners is None:
        return {"status": "unreadable", "reasonCode": "NO_QR_FOUND", "decoded": None, "diagnostics": {"detector": detector}}

    diag = capture_diagnostics(gray, corners, geom)
    diag["detector"] = detector
    result: dict = {"status": "ok", "reasonCode": None, "decoded": text, "diagnostics": diag}
    if geom is None or grid is None:
        return result

    if diag["pixelsPerCell"] < MIN_PIXELS_PER_CELL:
        result.update(status="unreadable", reasonCode="CAPTURE_TOO_FAR")
        return result
    if diag["blurCells"] > MAX_BLUR_CELLS:
        result.update(status="unreadable", reasonCode="CAPTURE_TOO_BLURRY")
        return result

    result.update(_score(gray, corners, geom, grid))
    return result


def _score(gray: np.ndarray, corners: np.ndarray, geom: Geometry, grid: np.ndarray) -> dict:
    px = CANON_PX_PER_CELL
    s = px / geom.cell_modules  # canonical pixels per QR module
    margin = 2.0  # modules of QR data kept around the cleared square
    roi0 = geom.clear_origin - margin
    roi_mod = geom.clear_modules + 2 * margin
    size = int(round(roi_mod * s))

    canon = np.array([[0, 0], [geom.qr_modules, 0], [geom.qr_modules, geom.qr_modules], [0, geom.qr_modules]], dtype=np.float32)
    dst = (canon - roi0) * s
    m = cv2.getPerspectiveTransform(dst.astype(np.float32), corners.astype(np.float32))
    roi = cv2.warpPerspective(gray.astype(np.float32), m, (size, size), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)

    norm = _normalise(roi, sigma=1.5 * s).astype(np.float32)

    # Align the template (translation, scale, 90-degree rotations) to absorb corner error.
    exp = (geom.pattern_origin - roi0) * s
    search = int(round(1.6 * s))
    best = (-2.0, 0, 1.0, (0, 0))
    for rot in range(4):
        g = np.rot90(grid, rot)
        for scale in np.arange(0.92, 1.081, 0.02):
            cell_px = px * scale
            tsize = int(round(g.shape[0] * cell_px))
            tmpl = cv2.resize(_template(g, px), (tsize, tsize), interpolation=cv2.INTER_NEAREST)
            x0 = int(max(0, exp - search))
            y0 = x0
            x1 = int(min(size, exp + tsize + search))
            window = norm[y0:x1, x0:x1]
            if window.shape[0] < tsize or window.shape[1] < tsize:
                continue
            res = cv2.matchTemplate(window, tmpl, cv2.TM_CCOEFF_NORMED)
            _, mx, _, loc = cv2.minMaxLoc(res)
            if mx > best[0]:
                best = (float(mx), rot, float(scale), (loc[0] + x0, loc[1] + y0))
    pixel_ncc, rot, scale, (bx, by) = best
    g = np.rot90(grid, rot)
    cell_px = px * scale
    tsize = int(round(g.shape[0] * cell_px))
    region = norm[by : by + tsize, bx : bx + tsize]
    ncc = max(0.0, _cell_correlation(region, g, cell_px))

    # High-frequency energy: Laplacian variance in the pattern vs in the QR-module ring,
    # on the contrast-stretched (not locally normalised) image.
    lo, hi = np.percentile(roi, [2, 98])
    r01 = ((roi - lo) / max(float(hi - lo), 1e-3)).astype(np.float32)
    lap = cv2.Laplacian(r01, cv2.CV_32F, ksize=3)
    pat = lap[by + 2 : by + tsize - 2, bx + 2 : bx + tsize - 2]
    ring_mask = np.ones_like(lap, dtype=bool)
    c0 = int(round(margin * s))
    c1 = int(round((margin + geom.clear_modules) * s))
    ring_mask[c0:c1, c0:c1] = False
    ring = lap[ring_mask]
    hf_ratio = float(pat.var() / max(ring.var(), 1e-6)) if pat.size and ring.size else 0.0
    hf = float(np.clip((hf_ratio - HF_RATIO_LO) / (HF_RATIO_HI - HF_RATIO_LO), 0, 1))
    iso_ratio = _isolated_contrast_ratio(_cell_means(r01[by : by + tsize, bx : bx + tsize], g.shape[0], cell_px, inset=0.3), g)

    iso = float(np.clip(iso_ratio / ISO_REFERENCE, 0, 1))
    pix = float(np.clip((pixel_ncc - PIX_LO) / (PIX_HI - PIX_LO), 0, 1))
    # Cell correlation says "this is the expected pattern"; the fidelity terms say "and it is
    # a first-generation print". A wrong or missing pattern drives the whole score to ~0.
    fidelity = W_ISOLATED * iso + W_PIXEL * pix + W_HF * hf
    score = ncc * fidelity
    return {
        "score": round(float(score), 4),
        "components": {
            "cellCorrelation": round(ncc, 4),
            "pixelCorrelation": round(pixel_ncc, 4),
            "hfRatio": round(hf_ratio, 3),
            "hfScore": round(hf, 4),
            "isolatedContrast": round(iso_ratio, 4),
            "fidelity": round(float(fidelity), 4),
            "rotation": rot * 90,
            "scale": round(scale, 3),
        },
    }
