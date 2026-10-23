"""
Synthetic label rendering and capture simulation for tests.

The geometry rules mirror server/lib/cdp.ts:
    module_mm = qr_mm / N
    pattern_modules = P * cell_mm / module_mm
    clear_modules = ceil(pattern_modules + 2), bumped by 1 so it shares N's parity
"""

from __future__ import annotations

import math

import cv2
import numpy as np
import qrcode

from app.analysis import Geometry

QR_MM = 30.0
CELL_MM = 0.15
GRID = 40
QUIET = 4
CELL_PX = 10


def make_grid(seed: int, size: int = GRID) -> np.ndarray:
    return np.random.default_rng(seed).integers(0, 2, size=(size, size), dtype=np.uint8)


def grid_bits(grid: np.ndarray) -> str:
    return "".join(str(int(b)) for b in grid.ravel())


def qr_matrix(payload: str) -> np.ndarray:
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=1, border=0)
    q.add_data(payload)
    q.make(fit=True)
    return np.array(q.get_matrix(), dtype=np.uint8)


def geometry_for(n: int, grid_size: int = GRID, qr_mm: float = QR_MM, cell_mm: float = CELL_MM) -> Geometry:
    module_mm = qr_mm / n
    pm = grid_size * cell_mm / module_mm
    k = math.ceil(pm + 2)
    if (n - k) % 2:
        k += 1
    return Geometry(qr_modules=n, clear_modules=k, grid_size=grid_size, pattern_modules=pm)


def render_label(payload: str, grid: np.ndarray, cell_px: int = 10) -> tuple[np.ndarray, Geometry]:
    """Ideal 'digital' label: white background, black QR modules with embedded CDP."""
    m = qr_matrix(payload)
    n = m.shape[0]
    geom = geometry_for(n, grid.shape[0])
    mpx = cell_px / geom.cell_modules
    total = int(round((n + 2 * QUIET) * mpx))
    img = np.full((total, total), 255, dtype=np.uint8)
    off = QUIET * mpx

    def px(v: float) -> int:
        return int(round(off + v * mpx))

    c0, c1 = geom.clear_origin, geom.clear_origin + geom.clear_modules
    for r in range(n):
        for c in range(n):
            if not m[r, c]:
                continue
            if c0 <= c < c1 and c0 <= r < c1:
                continue  # cleared centre
            img[px(r) : px(r + 1), px(c) : px(c + 1)] = 0
    p0 = geom.pattern_origin
    cm = geom.cell_modules
    for r in range(grid.shape[0]):
        for c in range(grid.shape[1]):
            if grid[r, c]:
                img[px(p0 + r * cm) : px(p0 + (r + 1) * cm), px(p0 + c * cm) : px(p0 + (c + 1) * cm)] = 0
    return img, geom


def _blur(img: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(img, (0, 0), sigma) if sigma > 0 else img


def print_sim(label: np.ndarray, cell_px: int, rng: np.random.Generator) -> np.ndarray:
    """First-generation laser print: slight toner spread, paper tone and texture."""
    f = label.astype(np.float32)
    f = _blur(f, 0.12 * cell_px)
    f = 18 + f * (235 - 18) / 255.0
    f += rng.normal(0, 2.0, f.shape)
    return np.clip(f, 0, 255).astype(np.uint8)


def copy_sim(printed: np.ndarray, cell_px: int, rng: np.random.Generator) -> np.ndarray:
    """Photocopy / scan-and-reprint: scanner blur, binarisation, lower resolution, re-print blur."""
    f = _blur(printed.astype(np.float32), 0.45 * cell_px)
    f = np.where(f > 128, 255.0, 0.0).astype(np.float32)
    h, w = f.shape
    small = cv2.resize(f, (w // 3, h // 3), interpolation=cv2.INTER_AREA)
    f = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    f = np.where(f > 128, 255.0, 0.0).astype(np.uint8)
    return print_sim(f, cell_px, rng)


def screen_sim(printed: np.ndarray, cell_px: int, rng: np.random.Generator) -> np.ndarray:
    """Photo of the label shown on a screen: display resampling, pixel-grid moiré, glow."""
    h, w = printed.shape
    disp = cv2.resize(printed, (int(w / cell_px * 1.7), int(h / cell_px * 1.7)), interpolation=cv2.INTER_AREA)
    f = cv2.resize(disp, (w, h), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    period = cell_px * 0.62
    moire = 0.5 + 0.5 * np.sin(2 * np.pi * (xx * math.cos(0.3) + yy * math.sin(0.3)) / period)
    f = f * (0.78 + 0.22 * moire)
    f = _blur(f, 0.35 * cell_px)
    f = 30 + f * 0.85
    return np.clip(f, 0, 255).astype(np.uint8)


def photo_sim(
    surface: np.ndarray,
    cell_px: int,
    rng: np.random.Generator,
    target_ppc: float = 4.5,
    blur_px: float = 0.7,
    canvas: tuple[int, int] = (3000, 2400),
    jpeg_quality: int = 88,
    tilt: float = 0.03,
) -> np.ndarray:
    """Phone photo: perspective, rotation, lighting gradient, lens blur, sensor noise, JPEG."""
    h, w = surface.shape
    scale = target_ppc / cell_px
    cw, ch = canvas
    out_w, out_h = w * scale, h * scale
    cx, cy = cw / 2 + rng.uniform(-80, 80), ch / 2 + rng.uniform(-80, 80)
    ang = rng.uniform(-0.12, 0.12)
    src = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
    base = np.array([[-out_w / 2, -out_h / 2], [out_w / 2, -out_h / 2], [out_w / 2, out_h / 2], [-out_w / 2, out_h / 2]], dtype=np.float32)
    rot = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]], dtype=np.float32)
    dst = base @ rot.T + np.array([cx, cy], dtype=np.float32)
    dst += rng.uniform(-tilt, tilt, dst.shape).astype(np.float32) * out_w
    m = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    img = cv2.warpPerspective(surface.astype(np.float32), m, (cw, ch), flags=cv2.INTER_AREA, borderValue=200.0)
    yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
    img *= 0.85 + 0.25 * (xx / cw) * (0.6 + 0.4 * yy / ch)
    img = _blur(img, blur_px)
    img += rng.normal(0, 3.0, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode(".jpg", cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
    assert ok
    return cv2.imdecode(enc, cv2.IMREAD_COLOR)
