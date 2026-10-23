"""
Turns an ideal label raster into simulated phone photos for dry runs:
original print, photocopy, photo of a screen and a blurry capture.

    python -m tools.simulate_captures <label.pgm|png> <out_dir> [--cell-px 10] [--seed 1]

Used by scripts/cdp-smoke.ts. Simulations are approximations — always calibrate with real
prints, copies and screen photos on the Calibration page.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tests.synth import copy_sim, photo_sim, print_sim, screen_sim  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("out_dir")
    ap.add_argument("--cell-px", type=int, default=10)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()

    label = cv2.imread(a.label, cv2.IMREAD_GRAYSCALE)
    if label is None:
        sys.exit(f"cannot read {a.label}")
    rng = np.random.default_rng(a.seed)
    printed = print_sim(label, a.cell_px, rng)
    shots = {
        "original": photo_sim(printed, a.cell_px, rng),
        "photocopy": photo_sim(copy_sim(printed, a.cell_px, rng), a.cell_px, rng),
        "screen": photo_sim(screen_sim(printed, a.cell_px, rng), a.cell_px, rng),
        "blurry": photo_sim(printed, a.cell_px, rng, blur_px=5.0),
    }
    os.makedirs(a.out_dir, exist_ok=True)
    out = {}
    for name, img in shots.items():
        path = os.path.join(a.out_dir, f"{name}.jpg")
        cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        out[name] = path
    print(json.dumps(out))


if __name__ == "__main__":
    main()
