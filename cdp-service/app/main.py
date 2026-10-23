"""
VERIQ CDP analysis service (internal). Called only by the Express API, never by clients.
Bind it to 127.0.0.1 (see run-cdp.ps1).
"""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from . import analysis
from .analysis import Geometry, analyze_capture, load_image, parse_grid

MAX_IMAGE_BYTES = 25 * 1024 * 1024

app = FastAPI(title="VERIQ CDP service", version="1.0.0", docs_url="/docs", redoc_url=None)


async def _read_image(image: UploadFile):
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")
    img = load_image(data)
    return img, len(data)


def _unsupported():
    return {"status": "unreadable", "reasonCode": "UNSUPPORTED_IMAGE", "decoded": None, "diagnostics": {}}


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "opencv": analysis.cv2.__version__,
        "wechatDetector": hasattr(analysis.cv2, "wechat_qrcode_WeChatQRCode"),
        "gates": {"minPixelsPerCell": analysis.MIN_PIXELS_PER_CELL, "maxBlurCells": analysis.MAX_BLUR_CELLS},
    }


@app.post("/decode")
async def decode(image: UploadFile = File(...)) -> dict:
    """Detect + decode the QR code and report basic capture diagnostics."""
    img, nbytes = await _read_image(image)
    if img is None:
        return _unsupported()
    out = analyze_capture(img)
    out["diagnostics"]["bytes"] = nbytes
    return out


@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    grid: str = Form(...),
    gridSize: int = Form(...),
    qrModules: int = Form(...),
    clearModules: int = Form(...),
    patternModules: float = Form(...),
    expectedPayload: Optional[str] = Form(None),
) -> dict:
    """Score the CDP in the image against the expected template for this label."""
    try:
        bits = parse_grid(grid, gridSize)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    if not (21 <= qrModules <= 177) or not (0 < patternModules < clearModules < qrModules):
        raise HTTPException(status_code=422, detail="Invalid geometry")

    img, nbytes = await _read_image(image)
    if img is None:
        return _unsupported()
    geom = Geometry(qr_modules=qrModules, clear_modules=clearModules, grid_size=gridSize, pattern_modules=patternModules)
    out = analyze_capture(img, geom, bits)
    out["diagnostics"]["bytes"] = nbytes
    if expectedPayload is not None and out.get("decoded") not in (None, expectedPayload.strip()):
        # The photo shows a different code than the one the caller looked up.
        return {"status": "unreadable", "reasonCode": "PAYLOAD_MISMATCH", "decoded": out.get("decoded"), "diagnostics": out["diagnostics"]}
    return out
