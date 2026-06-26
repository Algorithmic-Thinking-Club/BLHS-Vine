"""FORM-CONTROLLED building renderer, proven on the PAC.
Build each volume (footprint + height + roof) at REAL proportions; texture iso faces with the
locked BLHS palette. Guarantees architecture, not the model's guess. Iterate vs
reference/campus-exterior/pac-east-elevation.jpg."""
import math
from PIL import Image, ImageDraw

KX, KY, KZ = 1.15, 0.575, 1.15
OFF = (470, 470)
P = {
    'parch': (200, 196, 182), 'zinc': (92, 96, 100), 'brick': (158, 116, 94),
    'brickD': (94, 61, 49), 'mortar': (176, 169, 154), 'roof': (54, 54, 58),
    'roofHi': (72, 72, 76), 'fascia': (234, 232, 224), 'glass': (82, 107, 121),
    'glassHi': (150, 173, 190), 'mull': (188, 192, 196),
}
items = []


def sh(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def sp(x, y, z):
    return ((x - y) * KX + OFF[0], (x + y) * KY - z * KZ + OFF[1])


def bil(c, u, v):
    bl, br, tr, tl = c
    return (bl[0] * (1 - u) * (1 - v) + br[0] * u * (1 - v) + tr[0] * u * v + tl[0] * (1 - u) * v,
            bl[1] * (1 - u) * (1 - v) + br[1] * u * (1 - v) + tr[1] * u * v + tl[1] * (1 - u) * v)


def add(depth, fn):
    items.append((depth, fn))


def wall(p0, p1, z0, z1, mat, depth, sun):
    def fn(d):
        c = [sp(*p0, z0), sp(*p1, z0), sp(*p1, z1), sp(*p0, z1)]
        H = z1 - z0
        bb = min(9.0, H * 0.34) / H
        d.polygon([bil(c, 0, 0), bil(c, 1, 0), bil(c, 1, bb), bil(c, 0, bb)], fill=sh(P['brick'], sun))
        nb = max(2, int(math.dist(p0, p1) / 4))
        for i in range(1, nb):
            d.line([bil(c, i / nb, 0), bil(c, i / nb, bb)], fill=sh(P['brickD'], sun))
        d.line([bil(c, 0, bb * 0.5), bil(c, 1, bb * 0.5)], fill=sh(P['mortar'], sun))
        up = P['zinc'] if mat == 'zinc' else P['parch']
        d.polygon([bil(c, 0, bb), bil(c, 1, bb), bil(c, 1, 1), bil(c, 0, 1)], fill=sh(up, sun))
        nv = max(3, int(math.dist(p0, p1) / 3))
        for i in range(1, nv):
            d.line([bil(c, i / nv, bb + .02), bil(c, i / nv, 1)], fill=sh(sh(up, .9), sun))
        if mat != 'zinc':
            wy0, wy1 = bb + (1 - bb) * .24, bb + (1 - bb) * .6
            ncol = max(2, int(math.dist(p0, p1) / 13))
            for i in range(ncol):
                u0, u1 = (i + .28) / ncol, (i + .72) / ncol
                d.polygon([bil(c, u0, wy0), bil(c, u1, wy0), bil(c, u1, wy1), bil(c, u0, wy1)],
                          fill=sh(P['glass'], sun), outline=sh(P['mull'], sun))
        if mat == 'sign':
            d.polygon([bil(c, 0, .80), bil(c, 1, .80), bil(c, 1, .90), bil(c, 0, .90)], fill=sh(P['fascia'], sun))
        # roof fascia cap at top edge
        d.line([bil(c, 0, 1), bil(c, 1, 1)], fill=sh(P['fascia'], sun), width=2)
    add(depth, fn)


def glasswall(p0, p1, z0, z1, depth, sun, peak=None):
    def fn(d):
        c = [sp(*p0, z0), sp(*p1, z0), sp(*p1, z1), sp(*p0, z1)]
        d.polygon([bil(c, 0, 0), bil(c, 1, 0), bil(c, 1, 1), bil(c, 0, 1)], fill=sh(P['glass'], sun))
        for i in range(1, 7):
            d.line([bil(c, i / 7, 0), bil(c, i / 7, 1)], fill=sh(P['mull'], sun))
        for j in range(1, 5):
            d.line([bil(c, 0, j / 5), bil(c, 1, j / 5)], fill=sh(P['mull'], sun))
        d.polygon([bil(c, .06, .05), bil(c, .34, .05), bil(c, .12, .66), bil(c, .06, .66)], fill=sh(P['glassHi'], sun))
        if peak is not None:  # gable triangle above eave
            mx = (p0[0] + p1[0]) / 2; my = (p0[1] + p1[1]) / 2
            tri = [sp(*p0, z1), sp(*p1, z1), sp(mx, my, peak)]
            d.polygon(tri, fill=sh(P['glass'], sun), outline=sh(P['mull'], sun))
    add(depth, fn)


def flat_roof(fp, z, depth):
    def fn(d):
        d.polygon([sp(*p, z) for p in fp], fill=P['roof'], outline=P['roofHi'])
        a0, a1 = sp(*fp[0], z), sp(*fp[1], z)
        b0, b1 = sp(*fp[3], z), sp(*fp[2], z)
        for i in range(1, 10):
            t = i / 10
            d.line([(a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t),
                    (b0[0] + (b1[0] - b0[0]) * t, b0[1] + (b1[1] - b0[1]) * t)], fill=P['roofHi'])
    add(depth, fn)


def gable_roof(x0, x1, y0, y1, zeave, zpeak, depth):
    ym = (y0 + y1) / 2

    def fn(d):
        d.polygon([sp(x0, ym, zpeak), sp(x1, ym, zpeak), sp(x1, y1, zeave), sp(x0, y1, zeave)], fill=sh(P['roof'], 1.1), outline=P['roofHi'])
        d.polygon([sp(x0, ym, zpeak), sp(x1, ym, zpeak), sp(x1, y0, zeave), sp(x0, y0, zeave)], fill=sh(P['roof'], .8), outline=P['roofHi'])
        d.line([sp(x0, y1, zeave), sp(x1, y1, zeave)], fill=P['fascia'], width=3)
    add(depth, fn)


# ---------- PAC volumes (feet; +x camera-right, +y camera-left) ----------
# flytower rises from the BACK of the hall (overlaps the hall's rear), zinc, tall
fx0, fx1, fy0, fy1, fh = 54, 92, -8, 28, 47
wall((fx1, fy0), (fx1, fy1), 0, fh, 'zinc', 1, 0.84)
wall((fx0, fy1), (fx1, fy1), 0, fh, 'zinc', 1, 1.04)
flat_roof([(fx0, fy0), (fx1, fy0), (fx1, fy1), (fx0, fy1)], fh, 2)
# hall (long low), front=+y face has signage
hx0, hx1, hy1, hh = 0, 140, 52, 28
wall((hx0, hy1), (hx1, hy1), 0, hh, 'sign', 10, 1.05)
wall((hx1, 0), (hx1, hy1), 0, hh, 'parch', 11, 0.84)
flat_roof([(hx0, 0), (hx1, 0), (hx1, hy1), (hx0, hy1)], hh, 12)
# entry gable pavilion (west/left, front), glass +y gable end
ex0, ex1, ey1, eve, epk = -46, 4, 52, 24, 34
glasswall((ex0, ey1), (ex1, ey1), 0, eve, 22, 1.06, peak=epk)
wall((ex1, 0), (ex1, ey1), 0, eve, 'parch', 21, 0.84)
gable_roof(ex0, ex1, 0, ey1, eve, epk, 24)

# ground shadow (drawn first)
add(-1000, lambda d: d.polygon([sp(-44, 2, 0), sp(140, 2, 0), sp(140, 52, 0), sp(-44, 52, 0)], fill=(24, 28, 20, 70)))

img = Image.new('RGBA', (1100, 760), (0, 0, 0, 0))
dr = ImageDraw.Draw(img, 'RGBA')
for _, fn in sorted(items, key=lambda t: t[0]):
    fn(dr)
img = img.crop(img.getbbox())
img.save('public/art/iso/landmarks/pac-built.png')
print('built form-controlled PAC', img.size)
