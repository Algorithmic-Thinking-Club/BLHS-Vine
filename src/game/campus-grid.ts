// Phase 1 rasterizer: the real 1:1 campus geometry (feet polygons in campus.geo.json) -> a discrete
// tile grid of material + terrace-level + walkability that the block-tile engine renders. The engine
// is footprint-POLYGON-AGNOSTIC: it consumes whatever campus.geo.json provides, so swapping OSM ->
// exact survey -> real A-series footprints later is a data update, not an engine change.
import geoRaw from './campus.geo.json'
import heightRaw from './campus.height.json'
import demRaw from './campus.dem.json'
import { pointInPoly, distToPolyline, type Pt } from './geo'

export type Mat =
  | 'grass' | 'concrete' | 'asphalt' | 'turf' | 'track' | 'dirt' | 'court' | 'brick' | 'forest' | 'building'
  | 'patio'      // hero courtyard broom-concrete
  | 'fieldturf'  // stadium synthetic field interior (bright uniform green, hash-marked) — inside the track oval
  | 'apron'      // stadium track apron (concrete surround between the oval and the field polygon corners)

export const FT_PER_TILE = 3
const LEVEL_FT = 4         // ft of real elevation per block level. ~2.5x vertical exaggeration of the
                          // real 3% grade, so terraces/embankments/stairs read dramatically,
                          // proportional to + keyed to the real surveyed edges. Not strictly 1:1 vertically.
const WALK_HALF = 6        // walkway half-width, feet
// Levels Thor can climb in one stride (a curb/stair); MUST match the MAXSTEP in Campus.tsx's collision.
// The terraces are flat plateaus quantized from real elevations, so the raw grade between two of them can
// be a multi-level drop (e.g. the east athletic complex is ~37ft / 3 levels above the building pad). With
// MAXSTEP=1 that sheer face walls all four sides and seals the whole plateau off on foot. The grade is
// really a slope/embankment, so we GRADE it: a relaxation pass (below) terraces every walkable cliff rim
// into a 1-level-per-tile staircase, keeping the campus fully walkable while plateau interiors stay tall.
const MAXSTEP = 1
// FLAT base: the invented terraces + DEM + 2.5x exaggeration + forest berm warped
// the accurate footprints in isometric and made the real campus unrecognizable when walking it. Render
// the geometry FLAT so the true 1:1 layout reads correctly. Set false later to re-enable graded elevation
// (which should be driven by the real civil grading, keyed to real edges — not the old IDW bullseye).
const FLAT = true

type Door = { grapeId: string; label: string; pt: Pt }
type Geo = {
  boundary: Pt[]
  footprints: { id: string; poly: Pt[]; entrances?: Door[] }[]
  fields: { football: Pt[]; diamonds: Pt[][]; tennis: Pt[][] }
  parking: Pt[][]; walkways: Pt[][]; courtyards: Pt[][]
}
const G = geoRaw as unknown as Geo
const H = heightRaw as { terraces: { name: string; elev: number }[]; region_terrace: Record<string, string> }

const minElev = Math.min(...H.terraces.map((t) => t.elev))
const terraceLevel: Record<string, number> = {}
for (const t of H.terraces) terraceLevel[t.name] = Math.round((t.elev - minElev) / LEVEL_FT)
const baseLevel = terraceLevel['building'] ?? 0
const lvl = (region: string) => terraceLevel[H.region_terrace[region]] ?? baseLevel

// DRAMATIC terracing is keyed to the REAL surveyed region edges via lvl() (sharp breaks where the
// retaining walls / grade breaks actually are). The DEM (a smooth IDW from the 5 terrace points) is
// NOT used for the steps — its bullseye mislocates the steep grade through the building pad. The DEM
// is used ONLY for a gentle within-region tilt (clamped to +/-1 level) so terraces aren't dead flat.
const DEM = demRaw as { origin: number[]; spacing_ft: number; grid: number[][]; elev_min: number }
const demRows = DEM.grid.length, demCols = DEM.grid[0].length
function demElev(x: number, y: number): number {
  const fc = (x - DEM.origin[0]) / DEM.spacing_ft, fr = (y - DEM.origin[1]) / DEM.spacing_ft
  const c0 = Math.max(0, Math.min(demCols - 1, Math.floor(fc))), r0 = Math.max(0, Math.min(demRows - 1, Math.floor(fr)))
  const c1 = Math.min(demCols - 1, c0 + 1), r1 = Math.min(demRows - 1, r0 + 1)
  const sx = Math.max(0, Math.min(1, fc - c0)), sy = Math.max(0, Math.min(1, fr - r0))
  const a = DEM.grid[r0][c0], b = DEM.grid[r0][c1], cc = DEM.grid[r1][c0], d = DEM.grid[r1][c1]
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + cc * (1 - sx) * sy + d * sx * sy
}
const terraceElev: Record<string, number> = {}
for (const t of H.terraces) terraceElev[t.name] = t.elev
const elevOf = (region: string) => terraceElev[H.region_terrace[region]] ?? terraceElev['building'] ?? 653
const gentle = (x: number, y: number, region: string) => Math.max(-1, Math.min(1, Math.round((demElev(x, y) - elevOf(region)) / 34)))

type BB = [number, number, number, number]
const bboxOf = (poly: Pt[]): BB => {
  let a = 1e18, b = 1e18, c = -1e18, d = -1e18
  for (const [x, y] of poly) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y }
  return [a, b, c, d]
}
const inBB = (x: number, y: number, bb: BB, pad = 0) => x >= bb[0] - pad && x <= bb[2] + pad && y >= bb[1] - pad && y <= bb[3] + pad

// ---- STADIUM geometry (Football & Track, section 1) ----------------------------------------------
// The football polygon (G.fields.football) is a rotated rectangle = the TRACK's OUTER extent. We model
// the real BLHS 400m oval inside it as a "stadium" (discorectangle): a central rectangle along the long
// axis capped by two semicircles, so the RED TRACK reads as a true rounded oval (not a square ring) and
// the GREEN SYNTHETIC FIELD sits inside it. Everything is computed in the polygon's own local (u,v) frame
// — u along the long axis (the home/back straights), v across — so insets, lane lines, and yard lines come
// out correctly oriented in iso world space. The civil math drives the LAYOUT (1:1); see stadium-track.md.
function buildStadium() {
  const f = G.fields.football
  const cx = (f[0][0] + f[1][0] + f[2][0] + f[3][0]) / 4
  const cy = (f[0][1] + f[1][1] + f[2][1] + f[3][1]) / 4
  // long axis = the longer of the two edge directions
  const e0 = [f[1][0] - f[0][0], f[1][1] - f[0][1]]   // edge 0->1
  const e1 = [f[2][0] - f[1][0], f[2][1] - f[1][1]]   // edge 1->2
  const len0 = Math.hypot(e0[0], e0[1]), len1 = Math.hypot(e1[0], e1[1])
  const long = len0 >= len1 ? e0 : e1, llen = Math.max(len0, len1), slen = Math.min(len0, len1)
  const ux = long[0] / llen, uy = long[1] / llen        // unit vector along the straights
  const vx = -uy, vy = ux                               // perpendicular (across the track)
  const HU = llen / 2, HV = slen / 2                    // half-extents (ft): ~199 long, ~124 short
  const TRACK_W = 36                                    // running-track ring width (ft) — 8 lanes ≈ 32-36ft
  const APRON_W = 10                                    // thin concrete apron from the oval out to the rect corners
  const straightHalf = Math.max(0, HU - HV)             // half-length of the straight (spine) section
  // stadium signed "radius": distance from the central spine [-straightHalf..+straightHalf] at v=0.
  const sdf = (x: number, y: number) => {
    const dx = x - cx, dy = y - cy
    const u = dx * ux + dy * uy, v = dx * vx + dy * vy
    const du = Math.max(0, Math.abs(u) - straightHalf)
    return { u, v, r: Math.hypot(du, v) }              // r <= HV => inside outer oval
  }
  return { cx, cy, ux, uy, vx, vy, HU, HV, TRACK_W, APRON_W, straightHalf, sdf }
}
export const STADIUM = buildStadium()
// classify a feet point inside the football polygon: 'fieldturf' | 'track' | 'apron'
function stadiumMat(x: number, y: number): Mat {
  const { r } = STADIUM.sdf(x, y)
  const fieldR = STADIUM.HV - STADIUM.TRACK_W
  if (r <= fieldR) return 'fieldturf'
  if (r <= STADIUM.HV) return 'track'
  return 'apron'                                        // polygon corners outside the oval = track apron
}

export type CampusGrid = {
  cols: number; rows: number
  mat: Mat[][]; level: number[][]; walkable: boolean[][]
  minx: number; miny: number; ft: number
  spawn: { tx: number; ty: number }
  doors: { id: string; label: string; tx: number; ty: number }[]
}

export function buildCampusGrid(): CampusGrid {
  const bb = bboxOf(G.boundary)
  const PAD = 50   // tighter frame around the campus (was 170; the big empty padding made it a small island)
  const minx = bb[0] - PAD, miny = bb[1] - PAD
  const cols = Math.ceil((bb[2] + PAD - minx) / FT_PER_TILE)
  const rows = Math.ceil((bb[3] + PAD - miny) / FT_PER_TILE)

  const fp = G.footprints[0]?.poly, fpb = fp ? bboxOf(fp) : null
  const footb = bboxOf(G.fields.football)
  const tennis = G.fields.tennis.map((t) => [t, bboxOf(t)] as const)
  const diamonds = G.fields.diamonds.map((t) => [t, bboxOf(t)] as const)
  const parking = G.parking.map((p) => [p, bboxOf(p)] as const)
  const courts = G.courtyards.map((p) => [p, bboxOf(p)] as const)
  const walks = G.walkways.map((w) => [w, bboxOf(w)] as const)

  const mat: Mat[][] = [], level: number[][] = [], walkable: boolean[][] = []
  for (let r = 0; r < rows; r++) {
    const mr: Mat[] = new Array(cols), lr: number[] = new Array(cols), wr: boolean[] = new Array(cols)
    const y = miny + (r + 0.5) * FT_PER_TILE
    for (let c = 0; c < cols; c++) {
      const x = minx + (c + 0.5) * FT_PER_TILE
      let m: Mat = 'grass', region = 'building', walk = true
      if (!pointInPoly(x, y, G.boundary)) { m = 'forest'; walk = false }
      else if (fpb && inBB(x, y, fpb) && pointInPoly(x, y, fp!)) { m = 'building'; walk = false }
      else if (tennis.some(([t, b]) => inBB(x, y, b) && pointInPoly(x, y, t))) { m = 'court'; region = 'tennis' }
      else if (diamonds.some(([t, b]) => inBB(x, y, b) && pointInPoly(x, y, t))) { m = 'dirt'; region = 'diamonds' }
      // FOOTBALL & TRACK (section 1): split the stadium polygon into the red track oval, the green
      // synthetic field inside it, and a thin concrete apron at the rect corners. (football region ONLY.)
      else if (inBB(x, y, footb) && pointInPoly(x, y, G.fields.football)) { m = stadiumMat(x, y); region = 'football' }
      else if (parking.some(([p, b]) => inBB(x, y, b) && pointInPoly(x, y, p))) { m = 'asphalt'; region = 'main_north_parking' }
      else if (courts.some(([p, b]) => inBB(x, y, b) && pointInPoly(x, y, p))) { m = 'concrete' }
      else if (walks.some(([w, b]) => inBB(x, y, b, WALK_HALF) && distToPolyline(x, y, w) < WALK_HALF)) { m = 'concrete' }
      // graded elevation (computed but disabled by FLAT); forest berm rises to frame the map
      let L = lvl(region) + gentle(x, y, region)
      if (m === 'forest') L += 2
      mr[c] = m; lr[c] = FLAT ? 0 : L; wr[c] = walk
    }
    mat.push(mr); level.push(lr); walkable.push(wr)
  }

  // ---- stairs at crossings (NOT flattening): terrace ONLY the walkways (concrete) into climbable
  // steps where a path crosses a terrace break, so the path stays walkable while the surrounding terrain
  // keeps its full dramatic height (cliffs / embankments). The relaxation lowers a concrete tile that
  // sits more than MAXSTEP above its lowest walkable neighbour, propagating a 1-level staircase along the
  // path. Non-path terrain is never touched, so the real terraces stay sharp and dramatic. ----
  for (let pass = 0; pass < 64; pass++) {
    let changed = 0
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!walkable[r][c] || mat[r][c] !== 'concrete') continue
      let lowest = Infinity
      if (c + 1 < cols && walkable[r][c + 1] && level[r][c + 1] < lowest) lowest = level[r][c + 1]
      if (c - 1 >= 0 && walkable[r][c - 1] && level[r][c - 1] < lowest) lowest = level[r][c - 1]
      if (r + 1 < rows && walkable[r + 1][c] && level[r + 1][c] < lowest) lowest = level[r + 1][c]
      if (r - 1 >= 0 && walkable[r - 1][c] && level[r - 1][c] < lowest) lowest = level[r - 1][c]
      if (lowest !== Infinity && level[r][c] > lowest + MAXSTEP) { level[r][c] = lowest + MAXSTEP; changed++ }
    }
    if (!changed) break
  }

  // (The hardcoded "hero courtyard" that used to be authored here — a fabricated raised+walled patio with
  // stairs at fixed tiles, plus a spawn dropped onto it — was REMOVED 2026-06-25. It was prototype art
  // baked into the rasterizer that made the real campus unrecognizable. Real places get built section by
  // section from the verified geometry, not hardcoded into the grid.)

  const toTile = (p: Pt) => ({ tx: Math.round((p[0] - minx) / FT_PER_TILE), ty: Math.round((p[1] - miny) / FT_PER_TILE) })
  const doors = (G.footprints[0]?.entrances ?? []).map((e) => ({ id: e.grapeId, label: e.label, ...toTile(e.pt) }))
  // spawn near the campus center (the building centroid) on the nearest WALKABLE tile — the building
  // interior is non-walkable, so this lands Thor just outside it, in the heart of campus
  const cxf = fpb ? (fpb[0] + fpb[2]) / 2 : (bb[0] + bb[2]) / 2
  const cyf = fpb ? (fpb[1] + fpb[3]) / 2 : (bb[1] + bb[3]) / 2
  const stx = Math.round((cxf - minx) / FT_PER_TILE), sty = Math.round((cyf - miny) / FT_PER_TILE)
  let spawn = { tx: Math.max(0, Math.min(cols - 1, stx)), ty: Math.max(0, Math.min(rows - 1, sty)) }
  for (let rad = 0, found = false; rad < 300 && !found; rad++) {
    for (let dy = -rad; dy <= rad && !found; dy++) for (let dx = -rad; dx <= rad && !found; dx++) {
      const tx = stx + dx, ty = sty + dy
      if (tx >= 0 && ty >= 0 && tx < cols && ty < rows && walkable[ty][tx]) { spawn = { tx, ty }; found = true }
    }
  }
  return { cols, rows, mat, level, walkable, minx, miny, ft: FT_PER_TILE, spawn, doors }
}
