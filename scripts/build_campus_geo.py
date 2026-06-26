"""Phase 0 deliverable builder. Transforms the civil-survey extraction (C-400 page-points) into the
model FEET frame (origin=building centroid, X=East, Y=North) using the validated football-anchored
similarity, classifies the geometry into campus.geo.json categories, maps regions to the 5 terraces
(campus.height.json), and emits campus.trees.json. Writes to src/game/.

GEOREFERENCE (validated against aerial-esri.png, see reference/floorplans-maps/rendered/civil-overlay.png):
  page->feet AFFINE: feet = [[a,c],[b,d]] @ page + [e,f]
  anchored on the football field (page 1168.4,478.6 -> feet -565.4,143.9 from survey + dossier lat/lon)
  + football long-axis bearing; scale ~1.15 ft/pagept; reflection (page y-down -> feet y-up).
  Western/central campus (football, building, main parking) lock within ~30-50 ft. Eastern expansion
  features (roundabout, new drives/fields) are POST-expansion and intentionally do not match the older
  aerial; they carry larger residual and are flagged approximate.
"""
import pickle, json, math
import numpy as np

# ---- validated transform ----
A, B, C, D, E, F = -0.681049, 0.927136, 0.927136, 0.681049, -213.3893, -1265.3166
def P2F(pts):
    return [[round(A*x + C*y + E, 2), round(B*x + D*y + F, 2)] for x, y in pts]

L = pickle.load(open('reference/floorplans-maps/_civil/C400feat.pkl', 'rb'))
MODEL = json.load(open('src/game/campus-model.json'))

def area_centroid(p):
    if len(p) < 4:
        return 0.0, (0, 0)
    a = cx = cy = 0.0
    for i in range(len(p)):
        x0, y0 = p[i]; x1, y1 = p[(i+1) % len(p)]
        cr = x0*y1 - x1*y0; a += cr; cx += (x0+x1)*cr; cy += (y0+y1)*cr
    a *= 0.5
    if abs(a) < 1e-6:
        return 0.0, (0, 0)
    return abs(a), (cx/(6*a), cy/(6*a))

def in_region(c, x0, x1, y0, y1):
    return x0 < abs(c[0]) < x1 and y0 < abs(c[1]) < y1

BLUE = L.get('rgb(10.195923%, 10.195923%, 10.195923%)', [])   # athletics + roundabout
BLACK = L.get('rgb(0%, 0%, 0%)', [])                          # new-work / building outlines
GREY = L.get('rgb(70.195007%, 70.195007%, 70.195007%)', [])  # survey base

# ===== FIELDS (blue layer, clean) =====
# football/track perimeter: blue loop ~area 75000 near page (1143,407)
fb = [p for p in BLUE if area_centroid(p)[0] > 50000 and in_region(area_centroid(p)[1], 1050, 1250, 300, 560)]
football = P2F(max(fb, key=lambda p: area_centroid(p)[0])) if fb else None

# roundabout (EASTERN expansion): largest blue loop. The football-anchored similarity drifts in the
# far east (expansion changed the east, so no eastern shared control point exists). We still record
# the survey geometry transformed-as-is, but flag it approximate; raw page centroid kept for a future
# eastern re-anchor against the POST-expansion aerial.
ra = max(BLUE, key=lambda p: area_centroid(p)[0]) if BLUE else None
roundabout = P2F(ra) if ra else None
roundabout_page_centroid = [round(c, 1) for c in area_centroid(ra)[1]] if ra else None

# ===== BOUNDARY = the legal parcel (era-stable). Use the model's surveyed OSM parcel (way/550592662),
# which is the recorded property line and matches in both eras. =====
boundary = [[round(x, 2), round(y, 2)] for x, y in MODEL['boundary']]

# ===== BUILDING FOOTPRINT (placeholder-grade). The survey draws existing-to-remain (grey) + proposed
# addition (black). A clean single polygon is not cleanly separable from the cluttered survey, and the
# plan keeps buildings as exact-footprint PLACEHOLDERS until the A-series arrives. Carry the model's
# building footprint (best available outline) transformed-in-place, flagged. =====
building_footprint = [[round(x, 2), round(y, 2)] for x, y in MODEL['building']['footprint']]
entrances = MODEL['building']['entrances']

# ===== PARKING / WALKWAYS / DRIVES: not cleanly separable by colour in the survey base (mixed with
# contours). Carry the model's (OSM-derived) parking + walkways, which validated against the aerial,
# until a per-feature survey pass. Flagged as model-sourced. =====
parking = [[[round(x, 2), round(y, 2)] for x, y in poly] for poly in MODEL['parking']]
walkways = [[[round(x, 2), round(y, 2)] for x, y in poly] for poly in MODEL['walkways']]
courtyards = [[[round(x, 2), round(y, 2)] for x, y in poly] for poly in MODEL['courtyards']]

geo = {
    'units': 'feet',
    'frame': 'local (origin=building centroid, X=East, Y=North)',
    'georeference': {
        'method': 'football-anchored similarity (civil C-400 page-points -> model feet), validated vs aerial-esri.png',
        'affine_page_to_feet': {'a': A, 'b': B, 'c': C, 'd': D, 'e': E, 'f': F,
                                'apply': 'feet=[[a,c],[b,d]]@[px,py]+[e,f]'},
        'scale_ft_per_pagept': round(math.sqrt(abs(A*D - B*C)), 4),
        'control': 'football field page(1168.4,478.6)->feet(-565.4,143.9); building origin; football long-axis bearing',
        'validation': 'reference/floorplans-maps/rendered/civil-overlay.png — western/central lock ~30-50ft',
        'caveats': 'aerial is PRE-expansion; survey is POST. Eastern features (roundabout, new drives/fields) are new and carry larger residual.',
    },
    'sources': {
        'football': 'civil C-400 blue athletics layer (survey, exact)',
        'roundabout': 'civil C-400 blue layer (survey, EASTERN approximate)',
        'diamond_c403': 'civil C-400 blue layer (expansion field, approximate)',
        'boundary': 'recorded parcel way/550592662 (legal property line, era-stable)',
        'building_footprint': 'PLACEHOLDER (OSM outline); real footprint awaits BCRA A-series per plan',
        'parking/walkways/courtyards': 'OSM model (aerial-validated); awaits per-feature survey pass',
    },
    'footprints': [
        {'id': 'main', 'kind': 'building', 'placeholder': True, 'poly': building_footprint, 'entrances': entrances},
    ],
    'fields': {
        'football': football,        # track+field perimeter (feet), survey-exact (WESTERN, validated)
        'diamonds': [[[round(x, 2), round(y, 2)] for x, y in d] for d in MODEL['diamonds']],  # model (pre-expansion)
        'tennis': [[[round(x, 2), round(y, 2)] for x, y in t] for t in MODEL['tennis']],  # model (pre-expansion SE)
    },
    'roundabout': roundabout,
    'roundabout_confidence': 'LOW (eastern drift; re-anchor on post-expansion aerial). page_centroid=' + str(roundabout_page_centroid),
    'parking': parking,
    'walkways': walkways,
    'drives': [],   # not separately classified in this pass; roundabout approach drives are in the survey base
    'courtyards': courtyards,
    'boundary': boundary,
}

with open('src/game/campus.geo.json', 'w') as fp:
    json.dump(geo, fp)

# ===== HEIGHTS: 5 terraces + region->terrace mapping =====
terraces = MODEL['terraces']
# map each feature/region to its terrace by location (per geo-dossier elevation transect).
height = {
    'units': 'feet',
    'datum': 'NAVD88 (survey vertical datum); elevations from geo-dossier transect + campus-model terraces',
    'terraces': terraces,
    'region_terrace': {
        'football': 'football',          # 644 ft, lowest engineered bench (W)
        'building': 'building',           # 653 ft, main plateau
        'main_north_parking': 'north_lot',# 647 ft
        'east_fields': 'east_fields',     # 690 ft, upper SE/E bench (diamonds, tennis, student lot)
        'diamonds': 'east_fields',
        'tennis': 'east_fields',
        'roundabout': 'east_fields',      # E entrance, upper terrace (approx)
        'south_ravine_edge': 'ravine',    # 627 ft, wooded ravine S
        'west_front_parking': 'football', # 644 ft, shares the low W bench
    },
    'notes': 'Engine renders slope between terraces as steps/cliffs; fine contours are NOT vectorized (per plan).',
}
with open('src/game/campus.height.json', 'w') as fp:
    json.dump(height, fp)

# ===== TREES: documented placeholder. The AppendixG tree-retention sheet uses a DIFFERENT page frame
# than C-400 and needs its own co-registration; trees are placed during Phase 3 integration per the
# plan. Record the source + detected count so a later pass can finish it. =====
trees = {
    'units': 'feet',
    'frame': 'local (origin=building centroid, X=East, Y=North)',
    'status': 'DEFERRED — positions not yet georeferenced',
    'source': 'reference/floorplans-maps/bond-oversight/AppendixG-TreeRemovalRetention.pdf (3 sheets)',
    'detected_symbols': 138,
    'method_todo': 'tree sheet has its own page frame; co-register (find football/building on it, solve affine like C-400), then extract circle-symbol centroids by caliper class from the retention legend.',
    'points': [],
}
with open('src/game/campus.trees.json', 'w') as fp:
    json.dump(trees, fp)

# ---- report ----
def dims(poly):
    if not poly:
        return 'none'
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    return f'bbox x[{min(xs):.0f},{max(xs):.0f}] y[{min(ys):.0f},{max(ys):.0f}]'
print('WROTE src/game/campus.geo.json, campus.height.json, campus.trees.json')
print('football (survey-exact):', dims(football))
print('roundabout (low-confidence):', dims(roundabout))
print('boundary verts:', len(boundary), dims(boundary))
print('building verts:', len(building_footprint), '(placeholder)')
print('parking lots:', len(parking), 'walkways:', len(walkways), 'tennis:', len(MODEL['tennis']), 'diamonds:', len(MODEL['diamonds']))
