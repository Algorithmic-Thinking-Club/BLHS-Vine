"""Civil-set vector extractor (Phase 0). pdftocairo -svg gives paths whose stroke colour == the CAD
layer. Step 1: parse all paths, group by colour, render each layer separately so we can identify which
colour is building footprints vs contours vs parking vs surfaces. Deterministic, no guessing."""
import re, sys
from collections import defaultdict
from PIL import Image, ImageDraw

SVG = sys.argv[1] if len(sys.argv) > 1 else 'reference/floorplans-maps/_civil/C300.svg'
OUT = 'reference/floorplans-maps/_civil'
data = open(SVG, encoding='utf-8', errors='replace').read()

m = re.search(r'viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"', data)
PW, PH = float(m.group(1)), float(m.group(2))

path_re = re.compile(r'<path ([^>]*?)\sd="([^"]*)"', re.S)
def attr(name, s):
    mm = re.search(r'(?:^|\s)' + name + r'="([^"]*)"', s)
    return mm.group(1) if mm else None

def parse_d(d):
    toks = re.findall(r'[MmLlHhVvCcSsZz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    polys = []; pts = []; cx = cy = sx = sy = 0.0; i = 0; cmd = None
    def num():
        nonlocal i; v = float(toks[i]); i += 1; return v
    while i < len(toks):
        t = toks[i]
        if t in 'MmLlHhVvCcSsZz':
            cmd = t; i += 1
            if cmd in 'Zz':
                if pts: pts.append((sx, sy)); polys.append(pts); pts = []
                cx, cy = sx, sy; continue
        if cmd in 'Mm':
            x = num(); y = num()
            if cmd == 'm': x += cx; y += cy
            if pts: polys.append(pts)
            pts = [(x, y)]; cx, cy = x, y; sx, sy = x, y; cmd = 'l' if cmd == 'm' else 'L'
        elif cmd in 'Ll':
            x = num(); y = num()
            if cmd == 'l': x += cx; y += cy
            pts.append((x, y)); cx, cy = x, y
        elif cmd in 'Hh':
            x = num();  x = x + cx if cmd == 'h' else x
            pts.append((x, cy)); cx = x
        elif cmd in 'Vv':
            y = num();  y = y + cy if cmd == 'v' else y
            pts.append((cx, y)); cy = y
        elif cmd in 'CcSs':
            n = 6 if cmd in 'Cc' else 4
            vals = [num() for _ in range(n)]
            x, y = vals[-2], vals[-1]
            if cmd in 'cs': x += cx; y += cy
            pts.append((x, y)); cx, cy = x, y   # endpoint only (fine for layer ID)
        else:
            i += 1
    if pts: polys.append(pts)
    return polys

layers = defaultdict(list)
for am, d in path_re.findall(data):
    stroke = attr('stroke', am)
    fill = attr('fill', am)
    key = stroke if (stroke and stroke != 'none') else (fill if fill and fill != 'none' else None)
    if not key: continue
    layers[key].extend(parse_d(d))

# global content bbox (path coords are pre-transform; auto-fit so layers align in one frame)
gx0 = gy0 = 1e18; gx1 = gy1 = -1e18
for polys in layers.values():
    for pts in polys:
        for x, y in pts:
            gx0 = min(gx0, x); gy0 = min(gy0, y); gx1 = max(gx1, x); gy1 = max(gy1, y)
TW = 1100
scale = TW / (gx1 - gx0)
W, H = TW, int((gy1 - gy0) * scale)
def proj(x, y): return ((x - gx0) * scale, (y - gy0) * scale)
top = sorted(layers.items(), key=lambda kv: -len(kv[1]))[:8]
print(f'content bbox [{gx0:.0f},{gy0:.0f} {gx1:.0f},{gy1:.0f}]  ->  img {W}x{H}   layers={len(layers)}')
for idx, (col, polys) in enumerate(top):
    im = Image.new('RGB', (W, H), (250, 250, 250)); dr = ImageDraw.Draw(im)
    for pts in polys:
        if len(pts) >= 2:
            dr.line([proj(x, y) for x, y in pts], fill=(10, 10, 10), width=1)
    im.save(f'{OUT}/layer-{idx}.png')
    print(f'  layer-{idx}: {col[:34]:34s} polylines={len(polys):6d}')
