import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from tests.synth import CELL_PX, grid_bits, make_grid, photo_sim, print_sim, render_label

client = TestClient(app)
PAYLOAD = "VQ1.abcDEF0123456789_-abcd.0123456789abcdef"


def jpeg(img: np.ndarray) -> bytes:
    ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    return enc.tobytes()


def capture():
    grid = make_grid(5)
    img, geom = render_label(PAYLOAD, grid, CELL_PX)
    rng = np.random.default_rng(1)
    return grid, geom, jpeg(photo_sim(print_sim(img, CELL_PX, rng), CELL_PX, rng))


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_decode_returns_payload():
    _, _, data = capture()
    r = client.post("/decode", files={"image": ("c.jpg", data, "image/jpeg")})
    assert r.status_code == 200
    assert r.json()["decoded"] == PAYLOAD


def test_analyze_scores_and_checks_payload():
    grid, geom, data = capture()
    form = {
        "grid": grid_bits(grid),
        "gridSize": str(geom.grid_size),
        "qrModules": str(geom.qr_modules),
        "clearModules": str(geom.clear_modules),
        "patternModules": str(geom.pattern_modules),
        "expectedPayload": PAYLOAD,
    }
    r = client.post("/analyze", files={"image": ("c.jpg", data, "image/jpeg")}, data=form)
    body = r.json()
    assert body["status"] == "ok" and body["score"] > 0.6

    mismatch = client.post("/analyze", files={"image": ("c.jpg", data, "image/jpeg")}, data={**form, "expectedPayload": "VQ1.other"})
    assert mismatch.json()["reasonCode"] == "PAYLOAD_MISMATCH"


def test_rejects_bad_grid_and_non_images():
    _, geom, data = capture()
    bad = client.post(
        "/analyze",
        files={"image": ("c.jpg", data, "image/jpeg")},
        data={"grid": "0101", "gridSize": "40", "qrModules": "37", "clearModules": "11", "patternModules": "7.4"},
    )
    assert bad.status_code == 422
    junk = client.post("/decode", files={"image": ("x.jpg", b"not an image", "image/jpeg")})
    assert junk.json()["reasonCode"] == "UNSUPPORTED_IMAGE"
