import numpy as np
import pytest

from app.analysis import analyze_capture
from tests.synth import CELL_PX, copy_sim, make_grid, photo_sim, print_sim, render_label, screen_sim

PAYLOAD = "VQ1.s1yQm3k0Xr7bT9cVwLqKQA.7RDp2xM_fK0aZ1nQ"

# Default decision threshold shipped in .env.example (CDP_THRESHOLD).
THRESHOLD = 0.6


@pytest.fixture(scope="module")
def label():
    grid = make_grid(42)
    img, geom = render_label(PAYLOAD, grid, CELL_PX)
    return grid, img, geom


def run(capture, geom, grid):
    return analyze_capture(capture, geom, grid)


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_original_print_scores_high_and_copies_low(label, seed):
    grid, img, geom = label
    rng = np.random.default_rng(seed)
    printed = print_sim(img, CELL_PX, rng)

    original = run(photo_sim(printed, CELL_PX, rng), geom, grid)
    copy = run(photo_sim(copy_sim(printed, CELL_PX, rng), CELL_PX, rng), geom, grid)
    screen = run(photo_sim(screen_sim(printed, CELL_PX, rng), CELL_PX, rng), geom, grid)

    assert original["status"] == "ok", original
    assert original["decoded"] == PAYLOAD
    for r in (copy, screen):
        assert r["decoded"] == PAYLOAD  # the copy still carries the same QR content
    scores = {k: v.get("score", 0.0) for k, v in {"original": original, "copy": copy, "screen": screen}.items()}
    assert scores["original"] >= THRESHOLD + 0.15, scores
    assert scores["copy"] < THRESHOLD, scores
    assert scores["screen"] < THRESHOLD, scores
    assert scores["original"] - max(scores["copy"], scores["screen"]) >= 0.25, scores


def test_wrong_template_does_not_match(label):
    grid, img, geom = label
    rng = np.random.default_rng(7)
    capture = photo_sim(print_sim(img, CELL_PX, rng), CELL_PX, rng)
    other = make_grid(999)
    assert run(capture, geom, other)["score"] < THRESHOLD


def test_blurry_capture_is_unreadable_not_guessed(label):
    grid, img, geom = label
    rng = np.random.default_rng(11)
    capture = photo_sim(print_sim(img, CELL_PX, rng), CELL_PX, rng, blur_px=5.0)
    out = run(capture, geom, grid)
    assert out["status"] == "unreadable"
    assert out["reasonCode"] in ("CAPTURE_TOO_BLURRY", "NO_QR_FOUND")
    assert "score" not in out


def test_distant_capture_is_unreadable(label):
    grid, img, geom = label
    rng = np.random.default_rng(12)
    capture = photo_sim(print_sim(img, CELL_PX, rng), CELL_PX, rng, target_ppc=1.6, blur_px=0.5)
    out = run(capture, geom, grid)
    assert out["status"] == "unreadable"
    assert out["reasonCode"] in ("CAPTURE_TOO_FAR", "NO_QR_FOUND")


def test_no_qr_in_image():
    noise = (np.random.default_rng(3).random((800, 600, 3)) * 255).astype(np.uint8)
    out = analyze_capture(noise)
    assert out == {"status": "unreadable", "reasonCode": "NO_QR_FOUND", "decoded": None, "diagnostics": out["diagnostics"]}


def test_diagnostics_reported(label):
    grid, img, geom = label
    rng = np.random.default_rng(5)
    out = run(photo_sim(print_sim(img, CELL_PX, rng), CELL_PX, rng), geom, grid)
    d = out["diagnostics"]
    assert 3.5 < d["pixelsPerCell"] < 5.5
    assert 0 <= d["sharpness"] <= 1
    assert set(out["components"]) >= {"cellCorrelation", "hfRatio", "hfScore"}
