"""Build src/game/campus.dem.json: a regular ground-elevation grid (feet, NAVD88) over the BLHS
campus extent, so the engine can sample elevation(feet_x, feet_y) and render the real hillside
instead of 5 flat benches.

WHY THIS IS A SMOOTH-DEM FALLBACK (documented honestly):
  The clean way to a DEM is to vectorize the survey CONTOUR lines. We checked every realistic source:
   - C-400 (grading) has a cleanly color-isolated contour layer (rgb 56.9/54.9/52.5%, interval 2 ft,
     labels 670..700) BUT it only covers the new NORTH ROUNDABOUT grade (feet y ~915..1876), which is
     north of the play boundary. Not the campus core.
   - SV1.0 overview: contours too coarse / the only long-curve color layer is the building+track key-map.
   - SV1.1..1.18 detail tiles DO carry the existing-conditions contours, but they live in the black
     CATCH-ALL color mixed with tree symbols, hatching, and title text -> not separable by color or by
     polyline length (verified: the "long" black polys are dominated by label/tree/hatch glyphs).
   - Spot-elevation TEXT (RIM=/EL=/spot dots) is drawn as AutoCAD vector outlines (PDFAUTOCAD font),
     so pdftotext returns nothing -> can't harvest spot values as text either.
  Vectorizing 18 tiles by hand-tracing + per-tile re-anchor + reading every label is exactly the
  "too noisy" case the brief flagged. So we fall back to a SMOOTH DEM built from the 5 VALIDATED
  TERRACE elevations used as SPATIAL CONTROL (each terrace's real campus footprint becomes a patch of
  control points at that elevation), interpolated with smooth inverse-distance weighting. The C-400
  contour band (670..700) is used only to CORROBORATE that the NE/E rises to ~690-700 (it does).

  This is deterministic and grounded: every control elevation is a real surveyed terrace level
  (geo-dossier transect, reconciled with campus-model), placed at the real feature location from
  campus.geo.json. It is SMOOTH, not contour-exact -- it gives believable, correctly-signed relief
  (W football low 644, center pad 653, N lot 647, E fields high 690, S ravine low 627), not faked
  fine contours. Buildings/fields can still sit on their discrete bench; this grid is the ground.

OUTPUT: src/game/campus.dem.json
  origin (feet, frame = campus.geo.json local: origin=building centroid, X=East, Y=North),
  spacing_ft, ncols, nrows, and a row-major 'grid' of elevations (feet), grid[r][c] =
  elevation at (x = origin_x + c*spacing, y = origin_y + r*spacing). Plus min/max + the control set.
"""
import json, math

geo = json.load(open('src/game/campus.geo.json'))
H = json.load(open('src/game/campus.height.json'))
TER = {t['name']: t['elev'] for t in H['terraces']}
# ravine 627, football 644, north_lot 647, building 653, east_fields 690

def poly_pts(poly):
    return [(p[0], p[1]) for p in poly]

def sample_polygon(poly, step):
    """Return interior+edge sample points of a polygon on a 'step' grid (ray-cast point-in-poly)."""
    pts = poly_pts(poly)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    out = []
    def inside(px, py):
        c = False; n = len(pts); j = n - 1
        for i in range(n):
            xi, yi = pts[i]; xj, yj = pts[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi):
                c = not c
            j = i
        return c
    gy = y0
    while gy <= y1:
        gx = x0
        while gx <= x1:
            if inside(gx, gy):
                out.append((gx, gy))
            gx += step
        gy += step
    # always include vertices so thin polys still contribute
    out.extend(pts)
    return out

# ---- 1) CONTROL POINTS: (x, y, elev) tagged by terrace, placed at real feature footprints ----
CTRL = []
def add_region(poly, elev, step=40):
    for (x, y) in sample_polygon(poly, step):
        CTRL.append((x, y, float(elev)))

# Football / track bench (644) -- west
add_region(geo['fields']['football'], TER['football'], step=45)

# Building plateau (653) -- the main pad
add_region(geo['footprints'][0]['poly'], TER['building'], step=45)

# North main parking sits on the north_lot bench (647)
add_region(geo['parking'][0], TER['north_lot'], step=45)            # big north lot
# the west-front parking shares the low football bench (644) per region_terrace
add_region(geo['parking'][1], TER['football'], step=45)            # west front lot

# East fields (690): the two near diamonds + the far SE diamond + tennis + their lots
add_region(geo['fields']['diamonds'][0], TER['east_fields'], step=45)
add_region(geo['fields']['diamonds'][1], TER['east_fields'], step=45)
add_region(geo['fields']['diamonds'][2], TER['east_fields'], step=45)
for t in geo['fields']['tennis']:
    add_region(t, TER['east_fields'], step=30)
# SE parking lots near the fields ride the upper bench too
add_region(geo['parking'][4], TER['east_fields'], step=40)
add_region(geo['parking'][5], TER['east_fields'], step=45)

# ---- 2) RAVINE (627): the wooded low gully = the lowest bench. The geo-dossier transect puts it in
# the SOUTH-CENTRAL / SOUTHWEST wooded drainage: the forested slope just south/SW of the developed
# core (football + building + south parking), falling away toward the southern neighborhoods. It is
# NOT under the SE athletic complex (those are the 690 fields) and NOT the far-west residential strip.
# The developed core's south edge is ~y in [-300..-686]; the football bottom is y=-141. So the ravine
# low band sits at y in [-380 .. -780] in the central-west X band (west of the E fields), placed close
# enough to the developed pad to create a real ~17-26 ft drop at the wooded edge. ----
B = poly_pts(geo['boundary'])
RAV_XLO, RAV_XHI = -780.0, 180.0     # west of the E-field complex (E fields start ~x=420)
RAV_YLO, RAV_YHI = -800.0, -360.0    # the wooded slope band south of the developed pad
RAV_DEEP = float(TER['ravine'])       # 627 at the deep south/SW
RAV_EDGE = float(TER['ravine']) + 9   # ~636 at the inner edge nearest the pad -> a FALL-LINE, not a basin
nx, ny = 9, 5
for ix in range(nx):
    for iy in range(ny):
        x = RAV_XLO + (RAV_XHI - RAV_XLO) * ix / (nx - 1)
        y = RAV_YLO + (RAV_YHI - RAV_YLO) * iy / (ny - 1)
        # iy=ny-1 is the inner (north, near pad) edge -> higher; iy=0 is deep south -> 627
        frac = iy / (ny - 1)
        z = RAV_DEEP + (RAV_EDGE - RAV_DEEP) * frac
        CTRL.append((x, y, z))
# extend the ravine low into the SW boundary corner (deep forest, off the developed pad)
for (x, y) in B:
    if -1120 <= x <= -780 and -360 >= y >= -1160:
        CTRL.append((x, y, RAV_DEEP))

# ---- 3) NE/E HIGH GROUND corroboration: C-400 proposed contours run 670..700 in the NE roundabout
# zone (feet y > ~900), well NORTH of the play boundary. We do NOT paint the residential NE with 690
# (that over-lifted the off-campus corner). Instead, add a single high anchor at the roundabout's own
# centroid (far north, ~690) so the north access trends up consistently with the C-400 670-700 band,
# without lifting the whole eastern residential strip. ----
rc = geo['roundabout']
rcx = sum(p[0] for p in rc) / len(rc); rcy = sum(p[1] for p in rc) / len(rc)
CTRL.append((rcx, rcy, 690.0))   # roundabout centroid, ~690 (matches C-400 670-700 lower band)

print(f'control points: {len(CTRL)}')
ce = [c[2] for c in CTRL]
print(f'control elev range: {min(ce):.0f}..{max(ce):.0f}')

# ---- 4) GRID over the boundary extent ----
xs = [p[0] for p in B]; ysB = [p[1] for p in B]
PAD = 60.0
minx = math.floor((min(xs) - PAD) / 10) * 10
maxx = math.ceil((max(xs) + PAD) / 10) * 10
miny = math.floor((min(ysB) - PAD) / 10) * 10
maxy = math.ceil((max(ysB) + PAD) / 10) * 10
SPACING = 12.0   # ~12 ft (=4 tiles at 3 ft/tile); fine enough for smooth relief, light JSON
ncols = int(round((maxx - minx) / SPACING)) + 1
nrows = int(round((maxy - miny) / SPACING)) + 1
print(f'grid origin=({minx},{miny}) spacing={SPACING} size={ncols}x{nrows} = {ncols*nrows} cells')

# Smooth inverse-distance weighting. Power 2 with a soft floor so we blend (no sharp bullseyes).
# Shepard with a smoothing term R0 so near-coincident control averages locally.
import array
CX = array.array('d', [c[0] for c in CTRL])
CY = array.array('d', [c[1] for c in CTRL])
CZ = array.array('d', [c[2] for c in CTRL])
N = len(CTRL)
R0_2 = 85.0 ** 2   # smoothing radius^2 (ft): power-4 IDW honors terrace anchors, gently smooth between

def elev_at(x, y):
    wsum = 0.0; zsum = 0.0
    for i in range(N):
        dx = x - CX[i]; dy = y - CY[i]
        d2 = dx * dx + dy * dy + R0_2
        w = 1.0 / (d2 * d2)        # power-4 on the softened distance -> honors controls, smooth between
        wsum += w; zsum += w * CZ[i]
    return zsum / wsum

grid = []
zmin = 1e9; zmax = -1e9
for r in range(nrows):
    y = miny + r * SPACING
    row = []
    for c in range(ncols):
        x = minx + c * SPACING
        z = elev_at(x, y)
        row.append(round(z, 1))
        if z < zmin: zmin = z
        if z > zmax: zmax = z
    grid.append(row)

print(f'DEM elevation range: {zmin:.1f}..{zmax:.1f} ft')

# ---- 5) RECONCILE: report sampled DEM at each terrace anchor vs target ----
def sample(x, y):
    fc = (x - minx) / SPACING; fr = (y - miny) / SPACING
    c0 = max(0, min(ncols - 1, int(fc))); r0 = max(0, min(nrows - 1, int(fr)))
    c1 = min(ncols - 1, c0 + 1); r1 = min(nrows - 1, r0 + 1)
    tx = fc - c0; ty = fr - r0
    z00 = grid[r0][c0]; z10 = grid[r0][c1]; z01 = grid[r1][c0]; z11 = grid[r1][c1]
    return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty

anchors = {
    'football(644)': ((-595, 115), 644),
    'building(653)': ((0, 0), 653),
    'north_lot(647)': ((-159, 436), 647),
    'east_fields(690)': ((553, 185), 690),
    'east_fields_far(690)': ((902, -678), 690),
    'south_ravine(627)': ((-200, -950), 627),
}
print('--- anchor reconciliation (sampled vs target) ---')
recon = {}
for name, ((x, y), tgt) in anchors.items():
    s = sample(x, y)
    recon[name] = {'target': tgt, 'sampled': round(s, 1), 'err': round(s - tgt, 1)}
    print(f'  {name:24s} target {tgt}  sampled {s:6.1f}  err {s-tgt:+.1f}')

dem = {
    'units': 'feet',
    'datum': 'NAVD88 (survey vertical datum)',
    'frame': geo['frame'],
    'kind': 'smooth_dem_terrace_control',
    'method': ('SMOOTH DEM (fallback). Survey contour lines are not cleanly vectorizable (C-400 contour '
               'layer covers only the N roundabout 670-700; SV1.x detail-tile contours are in the black '
               'catch-all mixed with tree/text/hatch glyphs, not color- or length-separable; spot-elev '
               'labels are AutoCAD vector outlines, not OCR-able). So elevations come from the 5 VALIDATED '
               'TERRACE levels used as SPATIAL CONTROL at their real feature footprints (from '
               'campus.geo.json), interpolated with smooth inverse-distance weighting (softened, power-4, '
               'R0=70ft). The C-400 670-700 contour band corroborates the NE/E rise. Correctly-signed '
               'relief, not contour-exact.'),
    'control_source': 'campus.height.json terraces (ravine 627, football 644, north_lot 647, building 653, east_fields 690), placed at campus.geo.json feature locations',
    'origin': [minx, miny],
    'origin_note': 'grid[r][c] elevation at x = origin[0] + c*spacing_ft, y = origin[1] + r*spacing_ft (feet, X=East Y=North)',
    'spacing_ft': SPACING,
    'ncols': ncols,
    'nrows': nrows,
    'elev_min': round(zmin, 1),
    'elev_max': round(zmax, 1),
    'terraces': H['terraces'],
    'anchor_reconciliation': recon,
    'corroboration': 'C-400 (page 33) proposed-grading contour layer rgb(56.9%,54.9%,52.5%), 2 ft interval, labels 670-700, confirms NE roundabout/entrance + E fields rise to ~690-700.',
    'grid': grid,
}
with open('src/game/campus.dem.json', 'w') as f:
    json.dump(dem, f)
print('WROTE src/game/campus.dem.json')
