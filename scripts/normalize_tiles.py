"""Normalize a PixelLab variant-tile family to one shared base color so the runtime tint ramp
has full control of the surface's value/hue. The patchwork problem: 16 variant tiles each carry a
different baked mean color, so hash-picking them makes adjacent tiles jump in value. Fix: measure
each tile's median top-face color, multiply the whole tile so that median lands on ONE bright
shared target, keep every per-pixel deviation (ripples, glints, grain). The engine then tints the
normalized tiles down a smooth depth ramp -> value continuity by construction, texture preserved.

Usage: python scripts/normalize_tiles.py public/art/intro/water-v public/art/intro/water-n 170,216,210
       python scripts/normalize_tiles.py public/art/intro/sand-v  public/art/intro/sand-n  auto
(target 'auto' = the mean of all tile medians, i.e. keep the family's own average color.)
Prints per-tile stats (median color + busyness = mean abs deviation) to help pick variant pools.
"""
import os
import sys

from PIL import Image


def face_pixels(im):
    """Opaque pixels of the diamond top face (upper half of the block tile)."""
    w, h = im.size
    px = im.load()
    out = []
    for y in range(0, h // 2 + 4):
        for x in range(w):
            p = px[x, y]
            if p[3] > 200:
                out.append(p)
    return out


def median_rgb(pixels):
    med = []
    for c in range(3):
        v = sorted(p[c] for p in pixels)
        med.append(v[len(v) // 2])
    return med


def main():
    src, dst, target = sys.argv[1], sys.argv[2], sys.argv[3]
    files = sorted(f for f in os.listdir(src) if f.endswith(".png"))
    stats = {}
    for f in files:
        im = Image.open(os.path.join(src, f)).convert("RGBA")
        pix = face_pixels(im)
        med = median_rgb(pix)
        busy = sum(
            (abs(p[0] - med[0]) + abs(p[1] - med[1]) + abs(p[2] - med[2])) / 3 for p in pix
        ) / len(pix)
        stats[f] = (med, busy, im)

    if target == "auto":
        tgt = [
            round(sum(s[0][c] for s in stats.values()) / len(stats)) for c in range(3)
        ]
    else:
        tgt = [int(v) for v in target.split(",")]
    print(f"target base color: {tuple(tgt)}")

    # hue-safe recolor: each pixel's brightness relative to the tile's median face brightness
    # scales the TARGET color. Texture (ripples/glints/grain) = luma deviation; hue = target only.
    # Per-channel gain was tried first and blew dark teal walls into pink (red gain up to 21x).
    luma = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
    os.makedirs(dst, exist_ok=True)
    for f, (med, busy, im) in stats.items():
        base = max(1.0, luma(med))
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a > 0:
                    k = luma((r, g, b)) / base
                    px[x, y] = (
                        min(255, round(tgt[0] * k)),
                        min(255, round(tgt[1] * k)),
                        min(255, round(tgt[2] * k)),
                        a,
                    )
        im.save(os.path.join(dst, f))
        print(f"{f}: median {tuple(med)} busy {busy:.1f}")


if __name__ == "__main__":
    main()
