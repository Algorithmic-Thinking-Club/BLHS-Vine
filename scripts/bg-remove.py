#!/usr/bin/env python
"""Background removal for PixelLab map objects that came back with an opaque flat background.
Flood-fills from the image border, clearing pixels whose color is within TOL of the sampled
border color, and feathers the 1px edge so the cutout isn't jagged. Pixel-art safe (no blur of
the subject). Usage: python scripts/bg-remove.py <in.png> [out.png] [tol]
"""
import sys
from collections import deque
from PIL import Image


def main():
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else inp
    tol = int(sys.argv[3]) if len(sys.argv) > 3 else 28
    im = Image.open(inp).convert("RGBA")
    w, h = im.size
    px = im.load()
    # sample the background color = median-ish of the four corners
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    br = sum(c[0] for c in corners) // 4
    bg = sum(c[1] for c in corners) // 4
    bb = sum(c[2] for c in corners) // 4

    def near(c):
        return abs(c[0] - br) <= tol and abs(c[1] - bg) <= tol and abs(c[2] - bb) <= tol

    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y][x] and near(px[x, y]):
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x] and near(px[x, y]):
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and near(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))
    # feather: any remaining subject pixel that still reads as background-ish AND touches a cleared
    # pixel gets its alpha knocked down (kills the mint halo around the cutout)
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] == 0:
                continue
            if near(c):
                touches = any(
                    0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                )
                if touches:
                    px[x, y] = (c[0], c[1], c[2], 0)
    im.save(out)
    # report
    transp = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"{out}: bg=({br},{bg},{bb}) tol={tol} transparent={round(100*transp/(w*h),1)}%")


if __name__ == "__main__":
    main()
