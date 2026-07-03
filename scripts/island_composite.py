"""THE ISLAND COMPOSITE (sail view, master plan 2.-1 — confirmed 2026-07-03).

At map zoom the island is ONE composed painting on the live sea. This script is the
assembly bench: it mirrors terrain.ts (KEEP IN SYNC), renders the geometry GUIDE,
extracts the coast polyline with its per-arc grammar (cliff vs bay, lip heights,
facing), and stamps regional pieces along it into the composite canvas.

Art space: 1 canvas px = 4 world px (the proven scale-4 texel ceiling; the engine
mounts the result at scale 4 with zero further resample).

Usage:
  python scripts/island_composite.py guide            -> _guide.png (zones + polyline)
  python scripts/island_composite.py mock             -> composite from c3 harvest (free v0)
  python scripts/island_composite.py build            -> composite from real pieces/
Outputs land in reference/_archive/pixellab-gens/island-composite/.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

OUT = 'reference/_archive/pixellab-gens/island-composite'
PIECES = f'{OUT}/pieces'
os.makedirs(PIECES, exist_ok=True)

# ---- terrain.ts mirror (KEEP IN SYNC with src/game/island/terrain.ts) ----
CX, CY = 100.0, 100.0
LAGOON_C, LAGOON_W = -0.55, 0.95
COVE_C, COVE_W = 0.79, 0.45
DELTA_C, DELTA_W = 2.2, 0.4
SKEL = json.load(open('public/art/island/skeleton.json'))


def hash2(x, y):
    s = math.sin(x * 127.1 + y * 311.7) * 43758.5
    return s - math.floor(s)


def vnoise(x, y):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    u = fx * fx * (3 - 2 * fx)
    v = fy * fy * (3 - 2 * fy)
    a = hash2(ix, iy); b = hash2(ix + 1, iy); c = hash2(ix, iy + 1); d = hash2(ix + 1, iy + 1)
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v


def skel_at(arr, theta):
    bins = SKEL['bins']
    u = ((theta + math.pi) / (2 * math.pi)) * bins
    i = int(math.floor(u)) % bins
    j = (i + 1) % bins
    f = u - math.floor(u)
    return arr[i] * (1 - f) + arr[j] * f


def coast_r(theta):
    raw = skel_at(SKEL['radius'], theta)
    return max(27.0, 38.0 + (raw - 38.0) * 0.55)


def az_win(theta, c, w):
    d = abs(((theta - c + math.pi * 3) % (math.pi * 2)) - math.pi)
    k = max(0.0, 1 - d / w)
    return k * k * (3 - 2 * k)


def beach_k(theta):
    return max(az_win(theta, LAGOON_C, LAGOON_W),
               0.85 * az_win(theta, COVE_C, COVE_W),
               0.8 * az_win(theta, DELTA_C, DELTA_W))


def delta_k(theta):
    return az_win(theta, DELTA_C, DELTA_W)


def cliff_k(theta):
    return max(0.0, min(1.0, 1 - beach_k(theta) * 1.6))


def cliff_lip_h(theta):
    k = cliff_k(theta)
    if k <= 0.02:
        return 0.0
    north_k = 0.5 + 0.5 * math.cos(theta + 2.36)
    wob = vnoise(math.cos(theta) * 2.7 + 21, math.sin(theta) * 2.7 + 13)
    return k * (44 + 30 * north_k + 40 * wob)


# ---- art space: 1 px = 4 world px; origin = island center's iso point ----
S = 4.0


def iso_art(tx, ty):
    return ((tx - ty) * 32.0 / S, ((tx + ty) - (CX + CY)) * 16.0 / S)


def coast_samples(n=1440):
    """The coast polyline in art space with per-sample grammar."""
    out = []
    for i in range(n):
        th = -math.pi + (2 * math.pi) * i / n
        r = coast_r(th)
        tx, ty = CX + math.cos(th) * r, CY + math.sin(th) * r
        x, y = iso_art(tx, ty)
        out.append({
            'th': th, 'x': x, 'y': y,
            'bk': beach_k(th), 'ck': cliff_k(th),
            'lip': cliff_lip_h(th) / S,  # art px
            'dk': delta_k(th),
        })
    # facing: outward normal in art space (screen-down = wall visible)
    for i, s in enumerate(out):
        p, q = out[i - 1], out[(i + 1) % len(out)]
        txv, tyv = q['x'] - p['x'], q['y'] - p['y']
        L = math.hypot(txv, tyv) or 1.0
        # coast runs CCW in tile theta; outward normal = tangent rotated -90
        s['nx'], s['ny'] = tyv / L, -txv / L
    return out


def canvas_bounds(samples, margin=40, headroom=150):
    xs = [s['x'] for s in samples]
    ys = [s['y'] for s in samples]
    x0, x1 = min(xs) - margin, max(xs) + margin
    y0, y1 = min(ys) - margin - headroom, max(ys) + margin + 30
    return x0, y0, int(math.ceil(x1 - x0)), int(math.ceil(y1 - y0))


def land_mask(w, h, x0, y0):
    """Boolean land mask in art space (vectorized radial test)."""
    yy, xx = np.mgrid[0:h, 0:w]
    ax, ay = xx + x0, yy + y0
    # invert iso: tx-ty = ax*S/32 ; tx+ty = ay*S/16 + (CX+CY)
    d1 = ax * S / 32.0
    d2 = ay * S / 16.0 + (CX + CY)
    tx = (d2 + d1) / 2.0
    ty = (d2 - d1) / 2.0
    dx, dy = tx - CX, ty - CY
    d = np.sqrt(dx * dx + dy * dy)
    th = np.arctan2(dy, dx)
    # vectorized coast_r via table lookup
    bins = SKEL['bins']
    table = np.array([coast_r(-math.pi + (2 * math.pi) * i / (bins * 4)) for i in range(bins * 4)])
    idx = ((th + math.pi) / (2 * math.pi) * (bins * 4)).astype(int) % (bins * 4)
    return d <= table[idx]


def render_guide():
    samples = coast_samples()
    x0, y0, w, h = canvas_bounds(samples)
    img = np.zeros((h, w, 4), np.uint8)
    img[..., :] = (18, 52, 66, 255)  # deep sea placeholder
    land = land_mask(w, h, x0, y0)
    img[land] = (110, 140, 88, 255)  # meadow base
    for s in samples:
        px, py = int(s['x'] - x0), int(s['y'] - y0)
        if not (0 <= px < w and 0 <= py < h):
            continue
        if s['bk'] > 0.35:  # bay
            c = (60, 60, 62, 255) if s['dk'] > 0.5 else (240, 220, 168, 255)
        else:  # cliff, colored by facing
            c = (196, 106, 74, 255) if s['ny'] > 0.2 else (120, 60, 46, 255)
        for r in range(-2, 3):
            for q in range(-2, 3):
                if 0 <= py + r < h and 0 <= px + q < w:
                    img[py + r, px + q] = c
        # lip height ticks every ~20 samples
        if s['ck'] > 0.3 and int(round((s['th'] + math.pi) * 229)) % 20 == 0:
            for k in range(int(s['lip'])):
                if 0 <= py - k < h:
                    img[py - k, px] = (255, 255, 255, 255)
    Image.fromarray(img).save(f'{OUT}/_guide.png')
    print(f'guide {w}x{h} -> {OUT}/_guide.png')
    print(f"lip range (art px): {min(s['lip'] for s in samples):.1f}"
          f" .. {max(s['lip'] for s in samples):.1f}")
    arcs = classify_arcs(samples)
    for a in arcs:
        print(f"arc {a['kind']:>10} facing={a['facing']:>5} n={len(a['idx'])}"
              f" lip~{a['lip']:.0f}px")
    return samples, (x0, y0, w, h)


def classify_arcs(samples):
    """Split the polyline into contiguous arcs of one grammar (the stamping units)."""
    def kind_of(s):
        if s['bk'] > 0.35:
            return 'delta' if s['dk'] > 0.5 else 'beach'
        return 'cliff'

    def facing_of(s):
        return 'near' if s['ny'] > 0.15 else ('far' if s['ny'] < -0.15 else 'side')

    arcs = []
    cur = None
    for i, s in enumerate(samples):
        key = (kind_of(s), facing_of(s) if kind_of(s) == 'cliff' else '-')
        if cur is None or cur['key'] != key:
            if cur:
                arcs.append(cur)
            cur = {'key': key, 'kind': key[0], 'facing': key[1], 'idx': [], 'lip': 0.0}
        cur['idx'].append(i)
        cur['lip'] = max(cur['lip'], s['lip'])
    if cur:
        arcs.append(cur)
    # merge a trailing arc that wraps onto the leading one
    if len(arcs) > 1 and arcs[0]['key'] == arcs[-1]['key']:
        arcs[0]['idx'] = arcs[-1]['idx'] + arcs[0]['idx']
        arcs[0]['lip'] = max(arcs[0]['lip'], arcs[-1]['lip'])
        arcs.pop()
    return arcs


# ---- the assembly bench ----

# anchor per piece as a FRACTION of content height (measured on audit-sheet2):
# cliff runs anchor at the lip line, aprons at the wet line
ANCHOR_F = {
    'cliff-run-a': 0.22, 'cliff-run-b': 0.22, 'cliff-low': 0.3,
    'apron-e': 0.55, 'apron-s': 0.5, 'apron-delta': 0.55,
}


def load_piece(name, crop_margin=0.0):
    p = f'{PIECES}/{name}.png'
    if not os.path.exists(p):
        return None
    a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float64)
    if crop_margin > 0:  # meadows: cut the baked vignette/corner-prop frame
        h0, w0 = a.shape[:2]
        my, mx = int(h0 * crop_margin), int(w0 * crop_margin)
        a = a[my:h0 - my, mx:w0 - mx]
    op = a[..., 3] > 8
    if not op.any():
        return None
    ys, xs = np.nonzero(op)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # key the piece's own flat sea from its bottom rows so the LIVE sea shows through;
    # near-white foam is protected and survives onto the composite. The dark-blue
    # kill is GATED to the water zone (below the anchor) — ungated it ate the strata
    # wall's violet shadow bands (the mount_volcano beheading lesson, coastal edition).
    H0 = a.shape[0]
    yy0 = np.arange(H0)[:, None]
    wz = yy0 > H0 * 0.45
    bot = a[-8:, :, :3].reshape(-1, 3)
    wm = np.median(bot, axis=0)
    dd = np.abs(a[..., :3] - wm).sum(axis=2)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    deep = (b > r * 1.25) & (b > 60) & (lum < 96) & wz
    # any teal/aqua in the water zone dies (the LIVE sea's designed lagoon supplies
    # the shallow collar — a painted one just duplicates it as panels); foam lives
    teal = (g > r * 1.05) & (b > g * 0.55) & (g > 120) & wz
    a[..., 3] = np.where(((dd < 90) & wz | deep | teal) & (lum < 205), 0, a[..., 3])
    # strip a 2px border: gens paint to the canvas edge and stamped edges read as
    # picture frames
    a[:2, :, 3] = 0; a[-2:, :, 3] = 0; a[:, :2, 3] = 0; a[:, -2:, 3] = 0
    # aprons: dither the INLAND (top) edge so dry sand dissolves into the meadow
    # instead of ending on a ruler line
    if name.startswith('apron'):
        H1, W1 = a.shape[:2]
        yy1, xx1 = np.mgrid[0:H1, 0:W1]
        hsh = np.abs(np.sin(xx1 * 12.9898 + yy1 * 78.233) * 43758.5453) % 1.0
        edge = np.clip((H1 * 0.18 - yy1) / (H1 * 0.18), 0, 1)  # 1 at the very top
        a[..., 3] = np.where(hsh < edge * 1.15, 0, a[..., 3])
    # meadow hygiene: flower BLOBS erased structurally (recolor kept blob shapes —
    # replace them with grass sampled 24px left, value-jittered)
    if name.startswith('meadow'):
        blob = ((r > 150) & (r > g * 1.18) & (b > g * 0.85)) | (lum < 52)
        # dilate the mask a touch so halos die with the blob
        bl = blob.copy()
        bl[1:] |= blob[:-1]; bl[:-1] |= blob[1:]
        bl[:, 1:] |= blob[:, :-1]; bl[:, :-1] |= blob[:, 1:]
        src = np.roll(a[..., :3], 24, axis=1)
        jit = 0.96 + 0.08 * (np.sin(np.arange(a.shape[1]) * 12.9898)[None, :] % 1.0)
        for c in range(3):
            a[..., c] = np.where(bl, src[..., c] * jit, a[..., c])
    return a


def regime_chunks(pts):
    """Split an arc into chunks by coast orientation: 'h' where the shoreline runs
    across the screen (column curtain), 'v' where it runs down-screen (row curtain).
    Decided over 24-point windows, consecutive same-regime chunks merged."""
    chunks = []
    for i in range(0, len(pts), 24):
        w = pts[i:i + 24 + 1]
        if len(w) < 2:
            if chunks:
                chunks[-1][1].extend(w)
            continue
        dx = abs(w[-1][0] - w[0][0]) + sum(abs(w[j + 1][0] - w[j][0]) for j in range(len(w) - 1)) * 0.2
        dy = abs(w[-1][1] - w[0][1]) + sum(abs(w[j + 1][1] - w[j][1]) for j in range(len(w) - 1)) * 0.2
        m = 'h' if dx >= dy else 'v'
        if chunks and chunks[-1][0] == m:
            chunks[-1][1].extend(w)
        else:
            chunks.append([m, list(w)])
    return chunks


def monotonic_segments(pts, min_len=26, axis=0):
    """Split points into runs monotonic along `axis` (curtains need a function)."""
    segs = []
    cur = [pts[0]]
    sign = 0
    for p in pts[1:]:
        dv = p[axis] - cur[-1][axis]
        s = 1 if dv > 0.35 else (-1 if dv < -0.35 else 0)
        if s != 0 and sign != 0 and s != sign:
            segs.append(cur)
            cur = [cur[-1]]
            sign = 0
        else:
            sign = s or sign
        cur.append(p)
    segs.append(cur)
    return [s for s in segs if abs(s[-1][axis] - s[0][axis]) >= min_len]


def walk_fill(seg, axis=0):
    """Every integer coordinate along `axis` between consecutive points, with the
    other coordinate interpolated PER PAIR — fills the 1.6px sampling gaps without
    ever interpolating across a fold or a concave corner."""
    out = []
    seen = set()
    for i in range(len(seg) - 1):
        (x0, y0), (x1, y1) = seg[i], seg[i + 1]
        a0, b0 = (x0, y0) if axis == 0 else (y0, x0)
        a1, b1 = (x1, y1) if axis == 0 else (y1, x1)
        lo, hi = (a0, a1) if a0 <= a1 else (a1, a0)
        for av in range(int(math.ceil(lo)), int(math.floor(hi)) + 1):
            if av in seen:
                continue
            seen.add(av)
            t = (av - a0) / (a1 - a0) if a1 != a0 else 0.0
            bv = b0 + (b1 - b0) * t
            out.append((av, bv, i / max(1, len(seg) - 1)))
    return out


def stamp_curtain(img, seg, pieces, jseed=7, mode='h', water_dir=1):
    """Dress a coast segment with strip pieces. mode 'h': piece columns follow y(x).
    mode 'v': the piece rotates 90° (lossless) and rows follow x(y) — water_dir=+1
    puts the piece's water edge toward +x (an east-facing shore), -1 toward -x."""
    H, W = img.shape[:2]
    span = 150 + int(hash2(jseed, 3) * 60)
    steps = walk_fill(seg, axis=0 if mode == 'h' else 1)
    n = len(steps)
    for k, (av, bv, frac) in enumerate(steps):
        # ends fade by ALPHA, never by skipping columns — sparse surviving columns
        # at segment ends stamped as lone full-height streaks ("picture frames")
        endk = min(1.0, min(k, n - 1 - k) / 10.0)
        pi = int(frac * len(seg) / span + hash2(jseed, av * 0.013) * 0.35) % len(pieces)
        pc = pieces[pi]
        if pc is None:
            continue
        art, anchor = pc
        ph, pw = art.shape[:2]
        cyc = (av + int(hash2(jseed + 1, 0) * pw)) % (2 * pw)
        sx = cyc if cyc < pw else 2 * pw - 1 - cyc
        jit = int((vnoise(av / 23 + jseed, 0.7) - 0.5) * 3)
        if mode == 'h':
            x = av
            if not (0 <= x < W):
                continue
            top = int(round(bv)) - anchor + jit
            col = art[:, sx]
            y_a, y_b = max(0, top), min(H, top + ph)
            if y_b <= y_a:
                continue
            src = col[y_a - top:y_b - top]
            dst = img[y_a:y_b, x]
        else:
            y = av
            if not (0 <= y < H):
                continue
            # SLAB band: a steep iso coast has a compressed footprint — lay only a
            # narrow cut around the piece's anchor line (lip/wet-line ± the working
            # zone) so geology stays horizontal and no sand shelf hangs into the sea
            s0 = max(0, anchor - 7)
            s1 = min(ph, anchor + 34)
            row = art[s0:s1, sx]
            if water_dir < 0:
                row = row[::-1]
            slabw = s1 - s0
            off = (anchor - s0) if water_dir > 0 else (slabw - (anchor - s0))
            left = int(round(bv)) - off + jit
            x_a, x_b = max(0, left), min(W, left + slabw)
            if x_b <= x_a:
                continue
            src = row[x_a - left:x_b - left]
            dst = img[y, x_a:x_b]
        al = (src[:, 3:4] / 255.0) * endk
        dst[:, :3] = src[:, :3] * al + dst[:, :3] * (1 - al)
        dst[:, 3] = np.maximum(dst[:, 3], src[:, 3] * endk)


def build(mode='build'):
    samples = coast_samples()
    x0, y0, w, h = canvas_bounds(samples)
    img = np.zeros((h, w, 4), np.float64)
    land = land_mask(w, h, x0, y0)

    # 1) MEADOW: distortion-bombed base — every land pixel samples meadow-a through
    # smooth ±jitter fields (repetition breaks with NO cell borders), then a low-freq
    # value/hue mottle lays bon3's meadow patchiness over it. (meadow-b failed audit:
    # busy motif grid — reserved for stage-2 region variation if rerolled.)
    ma = load_piece('meadow-a', crop_margin=0.18)
    if ma is not None:
        sh, sw = ma.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
        # smooth jitter fields (two octaves, ±34 px)
        jx = np.zeros((h, w)); jy = np.zeros((h, w))
        for f, amp in ((90.0, 13.0), (41.0, 6.0)):
            # vectorized smooth noise via random-phase sines (cheap, aperiodic)
            jx += amp * (np.sin(xx / f * 2.1 + yy / f * 1.3 + 1.7) * np.sin(xx / f * 0.7 - yy / f * 1.9 + 4.2))
            jy += amp * (np.sin(xx / f * 1.4 - yy / f * 2.2 + 2.9) * np.sin(xx / f * 1.9 + yy / f * 0.8 + 0.6))
        # a pinch of per-pixel hash breaks the sine flow's directional smear
        hj = np.sin(xx * 127.1 + yy * 311.7) * 43758.5
        hj -= np.floor(hj)
        jx += (hj - 0.5) * 3.0
        jy += (np.roll(hj, 7, axis=0) - 0.5) * 3.0
        sx = ((xx + jx) % sw).astype(int)
        sy = ((yy + jy) % sh).astype(int)
        base = ma[sy, sx]
        # GRADE for the game: the engine's golden-hour matrix multiplies R and sinks
        # B — raw meadow-a turns acid mustard under it. Pre-cool toward bon3's olive
        # (deeper green, restrained red) so the on-screen result lands right.
        # Then value structure: strong low-freq mottle + a BROAD field (lighter on
        # the sunward SE, deeper NW and toward the island heart) — bon3's meadow is
        # patchwork, never one flat value.
        mot = (np.sin(xx / 130 + yy / 97 + 2.2) * np.sin(xx / 71 - yy / 152 + 0.8))
        broad = (np.sin(xx / 310 + 0.6) * np.sin(yy / 240 + 1.9)
                 + np.clip((xx - yy * 0.6 - w * 0.18) / (w * 0.9), -1, 1) * 0.7)
        v = 0.9 + 0.1 * mot + 0.075 * broad
        img[land, 0] = np.clip(base[..., 0] * v * 0.86 * (1 + 0.045 * mot), 0, 255)[land]
        img[land, 1] = np.clip(base[..., 1] * v * 0.97, 0, 255)[land]
        img[land, 2] = np.clip(base[..., 2] * v * 1.02 * (1 - 0.05 * mot), 0, 255)[land]
        img[land, 3] = 255

    # 2) coast arcs (cliff-run-b failed its audit — bare rock curtains, no coast
    # anatomy; run-a mirror-tiles for now, reroll b only if repetition reads)
    arcs = classify_arcs(samples)
    run_a = load_piece('cliff-run-a')
    low = load_piece('cliff-low')
    ap_e, ap_s, ap_d = load_piece('apron-e'), load_piece('apron-s'), load_piece('apron-delta')

    def anch(pc, name):
        return (pc, int(pc.shape[0] * ANCHOR_F[name]))

    def pts_of(arc):
        return [(samples[i]['x'] - x0, samples[i]['y'] - y0) for i in arc['idx']]

    # per-point normals for local water direction (segment-level, never arc-level:
    # an arc-wide direction pushed slabs into the sea on bending shoulders)
    nrm = {}
    for i, s in enumerate(samples):
        nrm[(round(s['x'] - x0, 1), round(s['y'] - y0, 1))] = s['nx']

    def dress(arc, pts, pieces, jseed):
        """Chunk the arc by orientation and stamp each chunk in its regime."""
        for m, cpts in regime_chunks(pts):
            axis = 0 if m == 'h' else 1
            for seg in monotonic_segments(cpts, min_len=22, axis=axis):
                nxs = [nrm.get((round(p[0], 1), round(p[1], 1)), 0) for p in seg]
                wd = 1 if sum(nxs) >= 0 else -1
                stamp_curtain(img, seg, pieces, jseed=jseed, mode=m, water_dir=wd)

    for ai, arc in enumerate(arcs):
        pts = pts_of(arc)
        if arc['kind'] == 'cliff' and arc['facing'] == 'near':
            if run_a is None:
                continue
            dress(arc, pts, [anch(run_a, 'cliff-run-a')], ai * 3 + 5)
        # ('side'-facing cliffs get the far-rim edge band below — a lateral iso coast
        # shows edge, not wall; cliff-low slabs there read as debris)
        elif arc['kind'] in ('beach', 'delta'):
            nm = 'apron-delta' if arc['kind'] == 'delta' else ('apron-e' if len(arc['idx']) > 150 else 'apron-s')
            pick = {'apron-delta': ap_d, 'apron-e': ap_e, 'apron-s': ap_s}[nm]
            if pick is None:
                continue
            dress(arc, pts, [anch(pick, nm)], ai * 3 + 7)

    # 3) FAR rim (the whole N sweep): no wall visible — a real edge band: dark rock
    # underscore with SMOOTHLY wandering thickness (per-column jumps made picket
    # teeth), a lit lip, and a soft shadow on the water beyond. Pair-stepped along
    # the polyline so steep stretches leave no gaps.
    edge_dark = (86, 52, 44)
    edge_lit = (212, 172, 122)
    rim = [s for s in samples if s['ck'] > 0.3 and s['ny'] < 0.15]
    thicks = [3 + 2.5 * vnoise(s['th'] * 2.2 + 3, 1.2) for s in rim]
    thicks = [sum(thicks[max(0, i - 2):i + 3]) / len(thicks[max(0, i - 2):i + 3]) for i in range(len(thicks))]
    drawn = set()
    for i in range(len(rim) - 1):
        s0, s1 = rim[i], rim[i + 1]
        if abs(s1['th'] - s0['th']) > 0.2:  # a gap between rim arcs — don't bridge
            continue
        steps = int(max(abs(s1['x'] - s0['x']), abs(s1['y'] - s0['y']))) + 1
        for k in range(steps):
            t = k / steps
            px = int(round((s0['x'] + (s1['x'] - s0['x']) * t) - x0))
            py = int(round((s0['y'] + (s1['y'] - s0['y']) * t) - y0))
            if (px, py) in drawn or not (0 <= px < w):
                continue
            drawn.add((px, py))
            thick = int(round(thicks[i] + (thicks[i + 1] - thicks[i]) * t))
            for r2 in range(thick):
                yq = py + r2
                if 0 <= yq < h:
                    vshade = 1 - 0.35 * (r2 / max(1, thick))
                    img[yq, px, :3] = [c * vshade for c in edge_dark]
                    img[yq, px, 3] = 255
            if 0 <= py + thick < h:
                img[py + thick, px, :3] = edge_lit
                img[py + thick, px, 3] = 255
            for r2 in range(1, 4):
                yq = py - r2
                if 0 <= yq < h and img[yq, px, 3] < 10:
                    img[yq, px, :3] = (10, 24, 30)
                    img[yq, px, 3] = 150 - r2 * 38

    out = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(f'{OUT}/composite.png')
    # stage the live copy + placement meta (art px -> world: x4; canvas top-left in
    # iso world coords so the renderer mounts with zero guesswork)
    Image.fromarray(out).save('public/art/island/composite.png')
    meta = {'w': w, 'h': h, 'wx': x0 * S, 'wy': y0 * S + (CX + CY) * 16.0, 's': S}
    json.dump(meta, open('public/art/island/composite.meta.json', 'w'))
    print(f'composite {w}x{h} -> {OUT}/composite.png + public/art/island/')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'guide'
    if mode == 'guide':
        render_guide()
    elif mode in ('build', 'mock'):
        build(mode)
    else:
        print('modes: guide | build')
