"""The port alignment sandbox: replicate BeachIso's placement math offline, composite the
port sprites at REAL positions, and render walkable-tile + Thor-standin overlays so the
joints can be verified pixel-tight BEFORE touching the game. Also straightens the pier
(its drawn axis is -0.651, not true-iso -0.5) via lossless per-column vertical shear
-> pier-iso2.png. Prints the exact constants + surf tiles to paste into BeachIso.tsx.
"""
import math
import sys
from PIL import Image, ImageDraw

HW, HH = 32, 16
iso = lambda tx, ty: ((tx - ty) * HW, (tx + ty) * HH)
shore_at = lambda d: 104 + 10 * math.sin(d * 0.028) + 5 * math.sin(d * 0.06 + 1.3)

# ---------- 1. straighten the pier ----------
SHEAR_REF = 20  # cap-mid x of the SW end; shear pivots there
# measured caps (original px): SW mid (20,120), NE mid (187.5,11) -> slope -109/167.5
K = 109 / 167.5 - 0.5  # 0.1507: how much steeper than 2:1 the drawn axis runs


def straighten():
    im = Image.open("public/art/intro/port/pier-iso.png").convert("RGBA")
    w, h = im.size
    pad = int(math.ceil(K * (w - 1 - SHEAR_REF))) + 1
    out = Image.new("RGBA", (w, h + pad), (0, 0, 0, 0))
    px, po = im.load(), out.load()
    for x in range(w):
        s = round(K * (x - SHEAR_REF)) if x > SHEAR_REF else 0
        for y in range(h):
            p = px[x, y]
            if p[3]:
                po[x, y + s] = p
    out.save("public/art/intro/port/pier-iso2.png")
    return out


# ---------- 2. landmarks (sprite px, AFTER shear for the pier) ----------
def sheared(x, y):
    return (x, y + (round(K * (x - SHEAR_REF)) if x > SHEAR_REF else 0))

CAP_SW = sheared(20, 120)     # walkway start cap midpoint (shore end)
CAP_NE = sheared(187.5, 11)   # walkway end cap midpoint (sea end)
PLAT = {"N": (123, 47), "E": (216, 80), "S": (123, 124), "W": (31, 80)}  # dock-platform2
PLAT_SWMID = ((PLAT["W"][0] + PLAT["S"][0]) / 2, (PLAT["W"][1] + PLAT["S"][1]) / 2)  # (77,102)
JET = {"N": (72, 76), "E": (108, 92), "S": (72, 110), "W": (36, 96)}
JET_NEMID = ((JET["N"][0] + JET["E"][0]) / 2, (JET["N"][1] + JET["E"][1]) / 2)  # (90,84)
JET_STAIRFOOT = (20, 143)
JET_LANTERN = (26, 65)
SC_PIER, SC_PLAT, SC_JET, SC_SHIP = 1.0, 1.0, 0.63, 1.0
DECK_LIFT = 30  # jetty deck height above sand: 47px drawn * 0.63

# ---------- 3. placement math (exactly what the TSX will do) ----------
PIER_TX, TY0 = 73, 43          # first walkway tile (shore end)
SEG_ADV = 5.0                  # tiles of ty one segment advances (0.23 cap overlap)
A = iso(PIER_TX, TY0)          # world px of the start tile center
DECK_Y = (A[0], A[1] - DECK_LIFT)

seg1 = (DECK_Y[0] - CAP_SW[0] * SC_PIER, DECK_Y[1] - CAP_SW[1] * SC_PIER)
seg2 = (seg1[0] + SEG_ADV * HW, seg1[1] - SEG_ADV * HH)
cap_ne_w = (seg2[0] + CAP_NE[0] * SC_PIER, seg2[1] + CAP_NE[1] * SC_PIER)
# platform pulled 6px shoreward along the axis so the cap planks lap onto the deck
plat_attach = (cap_ne_w[0] - 6, cap_ne_w[1] + 3)
plat = (plat_attach[0] - PLAT_SWMID[0] * SC_PLAT, plat_attach[1] - PLAT_SWMID[1] * SC_PLAT)
# jetty deck edge tucks 2px under the cap start
jet_attach = (DECK_Y[0] + 2, DECK_Y[1] - 1)
jet = (jet_attach[0] - JET_NEMID[0] * SC_JET, jet_attach[1] - JET_NEMID[1] * SC_JET)
# ship moors along the platform's NE edge (the boarding side faces the deck)
plat_ne_mid = (plat[0] + (PLAT["N"][0] + PLAT["E"][0]) / 2 * SC_PLAT,
               plat[1] + (PLAT["N"][1] + PLAT["E"][1]) / 2 * SC_PLAT)
SHIP_OFF = (-101, -164)  # sprite top-left rel. the platform NE edge midpoint (hull kisses the edge)
ship = (plat_ne_mid[0] + SHIP_OFF[0], plat_ne_mid[1] + SHIP_OFF[1])

# ---------- 4. surf tiles ----------
def inv_iso(x, y):
    return (x / HW + y / HH) / 2, (y / HH - x / HW) / 2

def in_quad(p, quad):
    x, y = p
    sgn = 0
    for i in range(4):
        x1, y1 = quad[i]; x2, y2 = quad[(i + 1) % 4]
        c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
        if c:
            if sgn == 0: sgn = 1 if c > 0 else -1
            elif (c > 0) != (sgn > 0): return False
    return True

walk_ty = []   # walkway column tiles
ty = TY0
end_ty = None
while True:
    c = iso(PIER_TX, ty)
    t = (c[0], c[1] - DECK_LIFT)
    along = (t[0] - DECK_Y[0]) / HW  # tiles from start along the axis
    if along > 2 * SEG_ADV + 0.4:    # past the cap -> platform territory
        end_ty = ty
        break
    walk_ty.append(ty)
    ty -= 1

plat_quad = [(plat[0] + PLAT[k][0] * SC_PLAT, plat[1] + PLAT[k][1] * SC_PLAT) for k in ("N", "E", "S", "W")]
plat_tiles = []
for dty in range(-8, 3):
    for dtx in range(-4, 4):
        ttx, tty = PIER_TX + dtx, (end_ty or TY0) + dty
        c = iso(ttx, tty)
        if in_quad((c[0], c[1] - DECK_LIFT), plat_quad) and (ttx, tty) not in [(PIER_TX, t) for t in walk_ty]:
            plat_tiles.append((ttx, tty))

jet_quad = [(jet[0] + JET[k][0] * SC_JET, jet[1] + JET[k][1] * SC_JET) for k in ("N", "E", "S", "W")]
jet_center_w = (jet[0] + 72 * SC_JET, jet[1] + 93 * SC_JET)
jet_tile = tuple(round(v) for v in inv_iso(jet_center_w[0], jet_center_w[1] + DECK_LIFT))
stairfoot_w = (jet[0] + JET_STAIRFOOT[0] * SC_JET, jet[1] + JET_STAIRFOOT[1] * SC_JET)
stairfoot_tile = tuple(round(v) for v in inv_iso(*stairfoot_w))

# ---------- 5. render ----------
def render(path="scripts/_port_sandbox.png", mag=2):
    pier2 = straighten()
    dock = Image.open("public/art/intro/port/dock-platform2.png").convert("RGBA")
    jets = Image.open("public/art/intro/port/lantern-post.png").convert("RGBA")
    shp = Image.open("public/art/intro/port/ship.png").convert("RGBA")

    xs = [seg1[0] - 80, plat[0] + 260]
    ys = [ship[1] - 40, jet[1] + 160]
    W, H = int(xs[1] - xs[0]), int(ys[1] - ys[0])
    cv = Image.new("RGBA", (W, H), (56, 130, 138, 255))
    dr = ImageDraw.Draw(cv)
    ox, oy = -xs[0], -ys[0]

    # water/sand split + tile grid for context
    for yy in range(0, H, 2):
        for xx in range(0, W, 2):
            tx, tyv = inv_iso(xx - ox, yy - oy)
            d, s = tx - tyv, tx + tyv
            if s > shore_at(d):
                dr.point((xx, yy), (222, 202, 150, 255))
    for t in range(20, 60):
        p1 = iso(PIER_TX - 8, t); p2 = iso(PIER_TX + 6, t)
        dr.line([(p1[0] + ox, p1[1] + oy), (p2[0] + ox, p2[1] + oy)], fill=(255, 255, 255, 28))
    for t in range(60, 90):
        p1 = iso(t, TY0 - 16); p2 = iso(t, TY0 + 8)
        dr.line([(p1[0] + ox, p1[1] + oy), (p2[0] + ox, p2[1] + oy)], fill=(255, 255, 255, 28))

    def blit(im, pos, sc):
        im2 = im.resize((int(im.width * sc), int(im.height * sc)), Image.NEAREST) if sc != 1 else im
        cv.alpha_composite(im2, (int(pos[0] + ox), int(pos[1] + oy)))

    blit(shp, ship, SC_SHIP)
    blit(dock, plat, SC_PLAT)
    blit(pier2, seg2, SC_PIER)
    blit(pier2, seg1, SC_PIER)
    blit(jets, jet, SC_JET)

    # overlays: walk tiles (green), platform (cyan), jetty deck (magenta), stairs (orange)
    def diamond(ttx, tty, lift, col):
        c = iso(ttx, tty)
        x, y = c[0] + ox, c[1] + oy - lift
        dr.polygon([(x, y - HH), (x + HW, y), (x, y + HH), (x - HW, y)], outline=col)
    for t in walk_ty: diamond(PIER_TX, t, DECK_LIFT, (0, 255, 60, 255))
    for (a, b) in plat_tiles: diamond(a, b, DECK_LIFT, (0, 220, 255, 255))
    diamond(*jet_tile, DECK_LIFT, (255, 0, 255, 255))
    diamond(*stairfoot_tile, 0, (255, 160, 0, 255))

    # Thor stand-ins: feet ellipse + body box at key spots
    def thor(ttx, tty, lift):
        c = iso(ttx, tty)
        x, y = c[0] + ox, c[1] + oy - lift
        dr.ellipse([x - 14, y - 7, x + 14, y + 7], outline=(255, 60, 60, 255))
        dr.rectangle([x - 14, y - 53, x + 14, y], outline=(255, 60, 60, 200))
    thor(PIER_TX, TY0 - 4, DECK_LIFT)
    if plat_tiles: thor(plat_tiles[len(plat_tiles) // 2][0], plat_tiles[len(plat_tiles) // 2][1], DECK_LIFT)
    thor(*jet_tile, DECK_LIFT)
    thor(stairfoot_tile[0], stairfoot_tile[1] + 1, 0)

    cv = cv.resize((W * mag, H * mag), Image.NEAREST)
    cv.convert("RGB").save(path)
    print("rendered", path, f"{W}x{H} world px")


print(f"CAP_SW={CAP_SW} CAP_NE={CAP_NE} axis_slope={(CAP_NE[1]-CAP_SW[1])/(CAP_NE[0]-CAP_SW[0]):.4f}")
print(f"seg1={tuple(round(v,1) for v in seg1)} seg2={tuple(round(v,1) for v in seg2)}")
print(f"plat={tuple(round(v,1) for v in plat)} jet={tuple(round(v,1) for v in jet)} ship={tuple(round(v,1) for v in ship)}")
print(f"walk_ty={walk_ty} end_ty={end_ty}")
print(f"plat_tiles={plat_tiles}")
print(f"jet_tile={jet_tile} stairfoot={stairfoot_tile}")
if __name__ == "__main__":
    render(mag=2 if len(sys.argv) < 2 else int(sys.argv[1]))
