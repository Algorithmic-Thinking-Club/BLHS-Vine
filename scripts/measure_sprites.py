"""Measure the DRAWN geometry the engine needs, straight off the PNGs:
- thor walk frames: the real feet row + horizontal content center per frame (shadow + ground contact)
- prop bases: bottom-band opaque centroid + half-width (true collision footprints)
Prints a report; the numbers get baked into BeachIso.tsx tables.
"""
import json
import os
import sys
from PIL import Image

A = 24  # alpha threshold


def content_box(im):
    px = im.convert("RGBA").load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > A:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    return minx, miny, maxx, maxy


def base_band(im, frac=0.10, min_rows=4):
    """centroid-x + halfwidth of the opaque pixels in the bottom band of the content."""
    px = im.convert("RGBA").load()
    w, h = im.size
    _, _, _, maxy = content_box(im)
    rows = max(min_rows, int((maxy + 1) * frac * 0.5))
    y0 = max(0, maxy - rows + 1)
    xs = []
    for y in range(y0, maxy + 1):
        for x in range(w):
            if px[x, y][3] > A:
                xs.append(x)
    if not xs:
        return None
    cx = sum(xs) / len(xs)
    return {"cx": round(cx, 1), "halfw": round((max(xs) - min(xs)) / 2 + 0.5, 1), "bottom": maxy, "w": w, "h": h}


def main():
    print("== THOR walk frames (w x h, feet row = last opaque, cx of bottom band) ==")
    for d in ["south", "north", "east", "west", "south-east", "south-west", "north-east", "north-west"]:
        for i in range(6):
            p = f"public/art/characters/thor/walk/{d}/{i}.png"
            if not os.path.exists(p):
                continue
            im = Image.open(p)
            b = base_band(im, 0.06)
            minx, miny, maxx, maxy = content_box(im)
            print(f"  {d}/{i}: {im.size[0]}x{im.size[1]} feet_row={maxy} pad_below={im.size[1]-1-maxy} cx={b['cx']} content_x=[{minx},{maxx}]")

    print("\n== PROP base footprints (bottom-band centroid + halfw, sprite px) ==")
    props = {
        "palmA": "public/art/intro/palm-a.png", "palmB": "public/art/intro/palm-b.png",
        "palmC": "public/art/intro/props/palm-c.png", "palmD": "public/art/intro/props/palm-d.png",
        "bushA": "public/art/intro/props/bush-a.png", "bushB": "public/art/intro/props/bush-b.png",
        "bushC": "public/art/intro/props/bush-c.png", "rockA": "public/art/intro/props/rock-a.png",
        "rockB": "public/art/intro/props/rock-b.png", "panther": "public/art/intro/props/panther-rock.png",
        "logdrift": "public/art/intro/props/logdrift.png", "crates": "public/art/intro/port/crates.png",
        "rowboat": "public/art/intro/port/rowboat.png", "tidepool": "public/art/intro/props/tidepool.png",
        "driftwood": "public/art/intro/driftwood.png", "pennant": "public/art/intro/props/pennant.png",
        "lanternPost": "public/art/intro/port/lantern-post.png",
    }
    out = {}
    for k, p in props.items():
        if not os.path.exists(p):
            print(f"  {k}: MISSING {p}")
            continue
        im = Image.open(p)
        b = base_band(im)
        out[k] = b
        print(f"  {k}: {b['w']}x{b['h']} base_cx={b['cx']} (anchor_dx={b['cx'] - b['w']/2:+.1f}) halfw={b['halfw']} bottom_row={b['bottom']} pad_below={b['h']-1-b['bottom']}")
    with open("scripts/_footprints.json", "w") as f:
        json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
