"""Offline preview of the campus (mirrors campus-model.ts + IsoCampus.tsx).
Buildings are single detailed sprites, scaled to footprint, with a soft grounding shadow."""
from PIL import Image, ImageDraw, ImageFilter
import math
import os

HW, HH, GAY = 32, 16, 38
COLS, ROWS = 80, 54

CAMPUS = [  # x,y,w,d,sprite
    (26, 20, 6, 8, 'gym'), (32, 19, 8, 8, 'commons'), (33, 13, 8, 6, 'wing'),
    (42, 18, 8, 7, 'wing'), (31, 27, 12, 4, 'wing2'), (44, 9, 8, 6, 'pac'),
    (34, 31, 8, 4, 'welcome'),
]
SPAWN = (38, 38)
GROUND_RECTS = [
    (28, 2, 24, 10, 'parking'), (33, 31, 22, 13, 'parking'), (40, 40, 11, 6, 'court'),
    (26, 35, 18, 2, 'concrete'), (37, 35, 2, 6, 'concrete'), (24, 18, 2, 12, 'concrete'),
]
STAD = (15, 22, 12, 9, 8.5, 5)
BALL = [(57, 18, 7), (66, 46, 8)]

G = {n: Image.open(f'public/art/iso/{n}.png').convert('RGBA')
     for n in ['grass', 'concrete', 'asphalt', 'turf', 'track', 'dirt', 'court', 'parking']}
PROP = {n: Image.open(f'public/art/iso/props/{n}.png').convert('RGBA')
        for n in ['evergreen', 'deciduous', 'car']}
PROP['grandstand'] = Image.open('public/art/iso/grandstand.png').convert('RGBA')
PROP_META = {'evergreen': (0.62, 0.92), 'deciduous': (0.6, 0.9), 'car': (0.72, 0.84), 'grandstand': (1.0, 47 / 64)}
thor = Image.open('public/art/characters/thor/south.png').convert('RGBA')


def load_b(name):
    p = f'public/art/iso/buildings/{name}.png'
    if not os.path.exists(p):
        p = 'public/art/iso/buildings/commons.png'
    return Image.open(p).convert('RGBA')


BSPR = {n: load_b(n) for n in ['gym', 'commons', 'wing', 'wing2', 'pac', 'welcome']}


def ell(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2


def ground_at(x, y):
    cx, cy, rx, ry, irx, iry = STAD
    if ell(x, y, cx, cy, rx, ry) <= 1:
        return 'turf' if ell(x, y, cx, cy, irx, iry) <= 1 else 'track'
    for bx, by, br in BALL:
        if ell(x, y, bx, by, br, br) <= 1:
            return 'dirt' if abs(x - bx) + abs(y - by) - br * 0.62 <= 0 else 'turf'
    for rx_, ry_, rw, rh, g in GROUND_RECTS:
        if rx_ <= x < rx_ + rw and ry_ <= y < ry_ + rh:
            return g
    return 'grass'


def in_b(x, y):
    return any(bx <= x < bx + bw and by <= y < by + bd for bx, by, bw, bd, _ in CAMPUS)


def h(x, y):
    n = math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - math.floor(n)


def build_props():
    p = []
    for x in range(COLS):
        for y in range(ROWS):
            if in_b(x, y):
                continue
            g = ground_at(x, y)
            if g == 'grass':
                ed = min(x, COLS - 1 - x, y, ROWS - 1 - y)
                forest = x < 7 or x > COLS - 7 or y > ROWS - 8 or (y < 9 and (x < 24 or x > 56)) or ed < 2
                hv = h(x, y)
                if (hv > 0.5) if forest else (hv > 0.95):
                    p.append((x, y, 'deciduous' if h(y, x) > 0.78 else 'evergreen'))
            elif g == 'parking' and x % 2 == 0 and y % 2 == 1 and h(x, y) > 0.35:
                p.append((x, y, 'car'))
    for y in range(18, 27, 2):
        p.append((26, y, 'grandstand'))
    return p


PROPS = build_props()

minsx = (0 - (ROWS - 1)) * HW
W = ((COLS - 1)) * HW - minsx + 200
Ht = ((COLS - 1) + (ROWS - 1)) * HH + 320
OX, OY = -minsx + 100, 150
canvas = Image.new('RGBA', (W, Ht), (57, 64, 44, 255))


def gplace(img, x, y):
    canvas.alpha_composite(img, (OX + (x - y) * HW - HW, OY + (x + y) * HH - GAY))


for s in range(COLS + ROWS):
    for x in range(COLS):
        y = s - x
        if 0 <= y < ROWS:
            gplace(G[ground_at(x, y)], x, y)

# depth-sorted: buildings (sprite + shadow), props, thor
items = []
for bx, by, bw, bd, spr in CAMPUS:
    items.append(('bld', (bx + bw - 1 + by + bd - 1), bx, by, bw, bd, spr))
for x, y, t in PROPS:
    items.append(('prop', x + y, x, y, t))
items.append(('thor', SPAWN[0] + SPAWN[1], SPAWN[0], SPAWN[1]))

for it in sorted(items, key=lambda t: t[1]):
    if it[0] == 'bld':
        _, _, bx, by, bw, bd, spr = it
        im = BSPR[spr]
        scale = min(1.3, (bw + bd) * HW / im.width)
        im2 = im.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST)
        cx, cy = bx + bw / 2 - 0.5, by + bd / 2 - 0.5
        bxp = OX + int((cx - cy) * HW)
        byp = OY + int((cx + cy) * HH)
        # grounding shadow: soft ellipse on the footprint
        shw, shh = int((bw + bd) * HW * 0.5), int((bw + bd) * HH * 0.7)
        sh = Image.new('RGBA', (shw * 2, shh * 2), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([0, 0, shw * 2, shh * 2], fill=(20, 24, 16, 110))
        sh = sh.filter(ImageFilter.GaussianBlur(6))
        canvas.alpha_composite(sh, (bxp - shw, byp - shh))
        canvas.alpha_composite(im2, (bxp - im2.width // 2, byp - int(im2.height * 0.9)))
    elif it[0] == 'prop':
        _, _, x, y, t = it
        sc, ay = PROP_META[t]
        im = PROP[t]
        if sc != 1.0:
            im = im.resize((int(im.width * sc), int(im.height * sc)), Image.NEAREST)
        canvas.alpha_composite(im, (OX + (x - y) * HW - im.width // 2, OY + (x + y) * HH - int(im.height * ay)))
    else:
        _, _, x, y = it
        t = thor if thor.width <= 80 else thor.resize((thor.width // 2, thor.height // 2))
        canvas.alpha_composite(t, (OX + (x - y) * HW - t.width // 2, OY + (x + y) * HH - int(t.height * 0.86)))

canvas.save('reference/floorplans-maps/rendered/campus-preview.png')
canvas.resize((W * 3 // 5, Ht * 3 // 5)).save('reference/floorplans-maps/rendered/campus-small.png')
print('wrote campus-preview', canvas.size)
