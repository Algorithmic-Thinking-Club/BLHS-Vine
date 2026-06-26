"""PHASE 1 - build the precise top-down GAME model from the OSM vectors.
Emits reference/research/campus-model.json (feet, local frame) and renders a detailed
top-down preview for harsh validation against the aerial. Source of truth = OSM geometry
(geo-dossier section 6 frame). Everything in feet, X=East, Y=North, origin=building centroid."""
import json
import math
from PIL import Image, ImageDraw

LON0, LAT0 = -122.169044, 47.159454
FT_LON = 75720 * 3.28084
FT_LAT = 111320 * 3.28084


def to_ft(lat, lon):
    return ((lon - LON0) * FT_LON, (lat - LAT0) * FT_LAT)


els = []
for f in ['reference/research/_overpass-result.json', 'reference/research/_ovp2.json']:
    els += json.load(open(f)).get('elements', [])
ways = {e['id']: e for e in els if e.get('type') == 'way' and 'geometry' in e}
def P(i): return [to_ft(p['lat'], p['lon']) for p in ways[i]['geometry']] if i in ways else []

BUILDING = 1337560793
BOUNDARY = 550592662
AUX = [1337560984, 1337561518]
TANKS = [1337560794, 1337560795]
FOOTBALL = 529273153
DIAMONDS = [550592651, 1513888697, 550592657]
TENNIS = [1446402139, 1446402140, 1446402141, 1446402142, 1446402143, 1446402144]
PARKING = [1368560815, 1368560816, 1368560817, 1368560818, 1368560819, 1368560820, 1368560824]
COURT = [1368560825, 1368560826]

boundary = P(BOUNDARY)
building = P(BUILDING)


def centroid(poly):
    return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))


def inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1):
            c = not c
    return c


walkways = [P(i) for i, w in ways.items()
            if w.get('tags', {}).get('highway') == 'service' and P(i)
            and inside(centroid(P(i)), boundary)]

# building entrances: nearest footprint vertex to each real zone direction (from floor plan:
# gym NW, PAC N, commons/main S-front, wings E). Refined later against the floor plan.
bc = centroid(building)
def nearest_vertex(ang_deg):
    target = (math.cos(math.radians(ang_deg)), math.sin(math.radians(ang_deg)))
    best, bestd = None, -1e9
    for v in building:
        dx, dy = v[0] - bc[0], v[1] - bc[1]
        d = dx * target[0] + dy * target[1]
        if d > bestd:
            bestd, best = d, v
    return best
entrances = [
    {'kind': 'gym', 'label': 'Gym', 'pt': nearest_vertex(135), 'grapeId': 'gym'},
    {'kind': 'pac', 'label': 'PAC', 'pt': nearest_vertex(90), 'grapeId': 'pac'},
    {'kind': 'commons', 'label': 'Main Entrance / Commons', 'pt': nearest_vertex(250), 'grapeId': 'commons'},
    {'kind': 'wing', 'label': 'Classroom Wings', 'pt': nearest_vertex(0), 'grapeId': 'atc'},
]

model = {
    'units': 'feet', 'frame': 'local (origin=building centroid)',
    'boundary': boundary,
    'building': {'footprint': building, 'entrances': entrances},
    'football': P(FOOTBALL),
    'diamonds': [P(i) for i in DIAMONDS],
    'tennis': [P(i) for i in TENNIS],
    'parking': [P(i) for i in PARKING],
    'courtyards': [P(i) for i in COURT],
    'aux': [P(i) for i in AUX],
    'tanks': [P(i) for i in TANKS],
    'walkways': walkways,
    # open multi-use practice field directly E of the building (VE plan zone L-102 "MULTI-USE FIELD";
    # untagged in OSM -> placed from the aerial + site plan, refine later). Oriented ~ to the building.
    'practice_field': [(395, -40), (620, -40), (620, 205), (395, 205)],
    # north transportation center = a SEPARATE facility (bus depot). Bounded placeholder only,
    # so it can be appended later. Uses the real bus-depot footprints where present.
    'north_placeholder': [P(i) for i in (1337560796, 1337561020, 1337561095) if i in ways],
    'terraces': [  # base elevation per zone (ft), from geo-dossier section 5
        {'name': 'football', 'elev': 644}, {'name': 'building', 'elev': 653},
        {'name': 'north_lot', 'elev': 647}, {'name': 'east_fields', 'elev': 690},
        {'name': 'ravine', 'elev': 627},
    ],
}
json.dump(model, open('reference/research/campus-model.json', 'w'))

# ---------- detailed top-down render for validation ----------
allp = boundary + building + sum(model['diamonds'] + model['tennis'] + model['parking'], [])
allp += model['football'] + sum(model['north_placeholder'], [])
xs = [p[0] for p in allp]; ys = [p[1] for p in allp]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
MARGIN = 240  # forest margin (ft)
SC = 0.6
minx -= MARGIN; maxx += MARGIN; miny -= MARGIN; maxy += MARGIN
W = int((maxx - minx) * SC); H = int((maxy - miny) * SC)
img = Image.new('RGB', (W, H), (44, 56, 40))  # forest base
d = ImageDraw.Draw(img, 'RGBA')
def px(p): return ((p[0] - minx) * SC, (maxy - p[1]) * SC)
def poly(p, fill, outline=None, wd=1):
    if len(p) >= 2: d.polygon([px(q) for q in p], fill=fill, outline=outline, width=wd)

poly(boundary, (108, 122, 82, 255))  # grass inside boundary
poly(model['practice_field'], (92, 132, 70, 255), outline=(70, 100, 56, 255))  # mowed practice field (E of bldg)
for pk in model['parking']:
    poly(pk, (78, 78, 84, 255), outline=(40, 40, 44, 255))
    # aisle stripes along the longer extent
    pc = centroid(pk); xs2 = [q[0] for q in pk]; ys2 = [q[1] for q in pk]
    for gx in range(int(min(xs2)) + 8, int(max(xs2)), 18):
        d.line([px((gx, min(ys2) + 4)), px((gx, max(ys2) - 4))], fill=(150, 150, 140, 90), width=1)
# football turf + track oval (oval centered on the field, sized to its actual edges + track width)
fb = model['football']
if fb:
    pts = fb[:4]
    fc = (sum(p[0] for p in pts) / 4, sum(p[1] for p in pts) / 4)
    e1, e2 = math.dist(pts[0], pts[1]), math.dist(pts[1], pts[2])
    if e1 >= e2:
        longv, longlen, shortlen = (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), e1, e2
    else:
        longv, longlen, shortlen = (pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]), e2, e1
    ang = math.atan2(longv[1], longv[0])
    ra, rb = longlen / 2 + 42, shortlen / 2 + 42
    ring = [(fc[0] + ra * math.cos(t) * math.cos(ang) - rb * math.sin(t) * math.sin(ang),
             fc[1] + ra * math.cos(t) * math.sin(ang) + rb * math.sin(t) * math.cos(ang))
            for t in [i / 72 * 2 * math.pi for i in range(72)]]
    poly(ring, (150, 78, 64, 255))
    poly(fb, (74, 110, 60, 255))
for dm in model['diamonds']:
    poly(dm, (96, 120, 70, 255))  # outfield turf
    c = centroid(dm); r = max(math.dist(c, q) for q in dm) * 0.42
    inf = [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in [math.pi / 2 + i * math.pi / 2 for i in range(4)]]
    poly(inf, (158, 120, 80, 255))  # dirt infield diamond
for tc in model['tennis']:
    poly(tc, (66, 112, 120, 255), outline=(220, 220, 220, 120))
for c in model['courtyards']:
    poly(c, (150, 145, 120, 255))
for wk in walkways:
    if len(wk) >= 2: d.line([px(q) for q in wk], fill=(176, 170, 150, 220), width=3)
for t in model['tanks'] + model['aux']:
    poly(t, (120, 120, 126, 255), outline=(0, 0, 0, 150))
# building
poly(building, (96, 92, 96, 255), outline=(30, 28, 30, 255), wd=2)
# entrances
for e in entrances:
    x, y = px(e['pt'])
    d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(255, 210, 60, 255), outline=(0, 0, 0, 255))
# boundary outline
poly(boundary, (0, 0, 0, 0), outline=(255, 70, 70, 255), wd=2)
# north transportation-center placeholder (separate facility, append later) - hatched grey + label
for ph in model['north_placeholder']:
    poly(ph, (70, 70, 74, 160), outline=(150, 150, 150, 200), wd=1)
if model['north_placeholder']:
    allph = sum(model['north_placeholder'], [])
    pc = (sum(p[0] for p in allph) / len(allph), sum(p[1] for p in allph) / len(allph))
    tx, ty = px(pc)
    d.text((tx - 70, ty), 'TRANSPORTATION CENTER\n(separate facility - placeholder)', fill=(220, 220, 200, 255))

img.save('reference/floorplans-maps/rendered/campus-topdown.png')
print('campus-topdown', img.size, '| walkways', len(walkways), '| entrances', len(entrances))
print('campus ft extent:', round(maxx - minx), 'x', round(maxy - miny))
