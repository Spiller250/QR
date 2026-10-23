"""
Renders the VERIQ launcher icon (same geometry as the web favicon) as PNGs:
legacy mipmaps for Android 6–7 and a 512 px master. Re-run after changing colours:

    python tool/make_icons.py      (needs numpy + opencv-python)
"""
import os

import cv2
import numpy as np

NAVY = (0x30, 0x15, 0x0B)  # BGR of #0B1530
BLUE = (0xFF, 0x8C, 0x5B)  # BGR of #5B8CFF
WHITE = (255, 255, 255)
SIZES = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
ROOT = os.path.join(os.path.dirname(__file__), "..")


def render(size: int, ss: int = 8) -> np.ndarray:
    n = size * ss
    img = np.zeros((n, n, 4), dtype=np.uint8)
    s = n / 32.0
    r = int(7 * s)
    bgra = (*NAVY, 255)
    # Rounded square tile.
    cv2.rectangle(img, (r, 0), (n - 1 - r, n - 1), bgra, -1)
    cv2.rectangle(img, (0, r), (n - 1, n - 1 - r), bgra, -1)
    for cx, cy in ((r, r), (n - 1 - r, r), (r, n - 1 - r), (n - 1 - r, n - 1 - r)):
        cv2.circle(img, (cx, cy), r, bgra, -1)
    # Chevron + dot (favicon: M8 10 l8 13 8-13, circle 16,9 r2).
    pts = np.array([[8, 10], [16, 23], [24, 10]], dtype=np.float64) * s
    cv2.polylines(img, [pts.astype(np.int32)], False, (*BLUE, 255), thickness=int(3 * s), lineType=cv2.LINE_AA)
    for p in pts[[0, 2]]:
        cv2.circle(img, tuple(p.astype(int)), int(1.5 * s), (*BLUE, 255), -1, cv2.LINE_AA)
    cv2.circle(img, (int(16 * s), int(9 * s)), int(2 * s), (*WHITE, 255), -1, cv2.LINE_AA)
    return cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)


if __name__ == "__main__":
    res = os.path.join(ROOT, "android", "app", "src", "main", "res")
    for folder, size in SIZES.items():
        os.makedirs(os.path.join(res, folder), exist_ok=True)
        cv2.imwrite(os.path.join(res, folder, "ic_launcher.png"), render(size))
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    cv2.imwrite(os.path.join(ROOT, "assets", "veriq_icon_512.png"), render(512, ss=4))
    print("icons written")
