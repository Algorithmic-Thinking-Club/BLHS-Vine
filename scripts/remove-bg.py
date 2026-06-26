"""Border flood-fill background removal. Auto-detects the background color from the image
corners (PixelLab map-objects come back on a solid white OR grey-blue panel, not transparent),
then floods inward from the border removing connected pixels within tolerance of that color.
Interior pixels of similar color (windows, etc.) survive because they aren't border-connected.

Usage: python scripts/remove-bg.py img.png [more.png ...]   (writes in place, keeps .orig.png once)
"""
import sys
import os
from collections import deque, Counter
from PIL import Image

TOL = 42  # color distance treated as background


def remove_bg(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = Counter((c[0], c[1], c[2]) for c in corners).most_common(1)[0][0]

    def is_bg(p):
        if p[3] < 8:
            return True
        dr, dg, db = p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]
        return (dr * dr + dg * dg + db * db) ** 0.5 <= TOL

    mask = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]):
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]):
                q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if mask[i] or not is_bg(px[x, y]):
            continue
        mask[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))

    for y in range(h):
        for x in range(w):
            if mask[y * w + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    # 1px alpha feather on the cut edge
    feather = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
                    feather.append((x, y))
                    break
    for x, y in feather:
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, int(a * 0.8))

    orig = path[:-4] + ".orig.png"
    if not os.path.exists(orig):
        Image.open(path).save(orig)
    im.save(path)
    cleared = sum(mask)
    print(f"{os.path.basename(path)}: bg={bg} cleared {round(100*cleared/(w*h))}% -> transparent")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        remove_bg(p)
