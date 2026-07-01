"""Trim a transparent-bg strip asset to its content and make it horizontally seamless by
crossfading the left edge over the right edge (foam/cloud-like stochastic strips hide the blend).

Usage: python scripts/make_seamless_x.py in.png out.png [blend_px]
"""
import sys

from PIL import Image


def main():
    src, dst = sys.argv[1], sys.argv[2]
    blend = int(sys.argv[3]) if len(sys.argv) > 3 else 48
    im = Image.open(src).convert("RGBA")
    box = im.getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    blend = min(blend, w // 4)
    out = im.crop((0, 0, w - blend, h))
    left = im.crop((0, 0, blend, h)).load()
    px = out.load()
    ow = w - blend
    for x in range(blend):
        a = x / blend  # 0 -> keep right edge, 1 -> fully left edge
        for y in range(h):
            rp = px[ow - blend + x, y]
            lp = left[x, y]
            ra, la = rp[3] / 255, lp[3] / 255
            na = ra * (1 - a) + la * a
            if na <= 0:
                px[ow - blend + x, y] = (0, 0, 0, 0)
                continue
            nc = tuple(
                round((rp[c] * ra * (1 - a) + lp[c] * la * a) / na) for c in range(3)
            )
            px[ow - blend + x, y] = (nc[0], nc[1], nc[2], round(na * 255))
    out.save(dst)
    print(f"{dst}: {out.size[0]}x{out.size[1]} (from {w}x{h}, blend {blend})")


if __name__ == "__main__":
    main()
