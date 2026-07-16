// THE ATC GRAPE ISLAND'S LANDFORM — authored data, no art. Session B's lane
// (docs/place-specs/atc-grape-island.md). Mirrors terrain.ts's export contract
// EXACTLY (coastR / sandK / coastDs / lagoonK / cliffK / shelfW / elevAt /
// elevBody, ds convention: + inland, − seaward) so the shared ocean module and
// the future one-world merge consume this island unmodified.
//
// Design brief (spec §3, the endgame laws): a SMALL island — clearly smaller
// than the hub — whose summit terrace IS room 305's true footprint. The coast
// is AUTHORED control points, each with a reason (never harmonic sprinkle):
// a west arrival lagoon facing the hub across the water, a dark cliff collar
// N→E anchoring the silhouette (c3's dark-first law), a SE rocky point for
// the lighthouse, a south pocket cove, and satellite skerries as coast
// jewelry. Scale: 2 ft/tile (spec §2.2 — ratified at Session B launch).

export const CX = 60, CY = 60 // island anchor in tile space (the 120x120 map centers here)
export const GRID = 120
export const COAST_R = 27 // mean coast radius — grown with the room (Ash 2026-07-16:
// "the classroom is way too small" → 1.33 ft/tile, the 24x23 room needs this ring);
// still ~1.8x smaller linear than the hub (mean ~R50)
export const SEA_R = 54 // live sea builds inside this radius (renderer + veil boundary)

// SCREEN COMPASS (2:1 iso): screen-E = tile θ −π/4 · screen-S = +π/4 ·
// screen-W = +3π/4 (the hub lies this way; the dock faces it) · screen-N = −3π/4.

// ---- THE COASTLINE: authored per-azimuth control points, smoothly closed.
// Each anchor is a DECISION. Radii in tile diagonals.
const COAST_PTS: [theta: number, r: number][] = [
  [-2.95, 29.5], // NW headland arm — frames the dock approach from the north
  [-2.36, 27.0], // screen-N: the cliff collar holds a steady dark wall
  [-1.65, 32.0], // NE CRAG PROW — the silhouette's tallest dark mass (c3 anchor)
  [-1.15, 26.0], // notch east of the prow — the collar breathes
  [-0.75, 28.0], // screen-E cliff run
  [-0.30, 25.0], // pre-prow dip — makes the SE point READ as a point
  [0.05, 33.0],  // SE ROCKY POINT — the lighthouse's long low prow into the sea
  [0.50, 24.0],  // notch behind the point
  [0.85, 23.5],  // SOUTH POCKET COVE — small designed sand window (the egg's shore)
  [1.40, 27.5],  // south arm closing the pocket
  [1.95, 26.0],  // SW shoulder easing toward the lagoon
  [2.36, 24.0],  // screen-W: the ARRIVAL LAGOON BAY curves IN (bays are concave)
  [2.75, 28.0],  // lagoon's north arm — with the NW headland it gates the dock vista
]
// smooth periodic Catmull-Rom through the anchors (long calm runs, designed
// corners — never per-tile jitter; the one organic term is a gentle wobble)
function coastRaw(theta: number) {
  const n = COAST_PTS.length
  const TWO = Math.PI * 2
  let t = ((theta + Math.PI) % TWO + TWO) % TWO - Math.PI
  let i = 0
  while (i < n && COAST_PTS[i][0] < t) i++
  const i1 = (i - 1 + n) % n, i2 = i % n
  const i0 = (i1 - 1 + n) % n, i3 = (i2 + 1) % n
  const th1 = COAST_PTS[i1][0], th2raw = COAST_PTS[i2][0]
  const th2 = i2 === 0 ? th2raw + TWO : th2raw
  const tt = th2 === th1 ? 0 : (((t < th1 ? t + TWO : t) - th1) / (th2 - th1))
  const p0 = COAST_PTS[i0][1], p1 = COAST_PTS[i1][1], p2 = COAST_PTS[i2][1], p3 = COAST_PTS[i3][1]
  const t2 = tt * tt, t3 = t2 * tt
  return 0.5 * ((2 * p1) + (-p0 + p2) * tt + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
export function coastR(theta: number) {
  // the single organic term: a slow 2-lobe wobble under a tile of amplitude —
  // the design lives in the anchors, this just breaks mathematical perfection
  return coastRaw(theta) * (1 + 0.018 * Math.sin(theta * 2.3 + 1.1) + 0.012 * Math.sin(theta * 5.1 - 0.4))
}

// ---- SATELLITE SKERRIES (c3's coast jewelry): small independent rock bodies.
// Each is a DECISION: the west gate rock frames the dock approach; the SE pair
// trails the lighthouse point out to sea; the south rock guards the pocket cove.
export const ISLETS: { x: number; y: number; r: number; note: string }[] = [
  { x: CX + Math.cos(2.62) * 34, y: CY + Math.sin(2.62) * 34, r: 2.6, note: 'west gate rock — the dock vista sails past it' },
  { x: CX + Math.cos(0.08) * 39.5, y: CY + Math.sin(0.08) * 39.5, r: 2.1, note: 'SE skerry 1 — the point continues underwater' },
  { x: CX + Math.cos(-0.12) * 44, y: CY + Math.sin(-0.12) * 44, r: 1.3, note: 'SE skerry 2 — the trail fades seaward' },
  { x: CX + Math.cos(0.95) * 30.5, y: CY + Math.sin(0.95) * 30.5, r: 1.6, note: 'south cove guard rock' },
]

// signed distance PAST the coast (+ inland, − out to sea), in tile diagonals —
// the ocean module's ds convention. Radial vs the main body, unioned with the
// skerries so the sea shelf wraps them too.
export function coastDs(tx: number, ty: number) {
  const dx = tx - CX, dy = ty - CY
  const d = Math.sqrt(dx * dx + dy * dy)
  let ds = coastR(Math.atan2(dy, dx)) - d
  for (const k of ISLETS) {
    const kd = k.r - Math.hypot(tx - k.x, ty - k.y)
    if (kd > ds) ds = kd
  }
  return ds
}

// smooth 0..1 azimuth window (terrain.ts's own helper shape)
function azWin(theta: number, c: number, w: number) {
  const d = Math.abs(((theta - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  const k = Math.max(0, 1 - d / w)
  return k * k * (3 - 2 * k)
}

// ---- SAND vs ROCK per azimuth: sand lives ONLY in the two designed windows
// (the arrival lagoon + the south pocket); everywhere else the coast is rock.
export function sandK(theta: number) {
  return Math.max(azWin(theta, 2.36, 0.75), 0.8 * azWin(theta, 0.85, 0.42))
}

// ---- THE ARRIVAL LAGOON + SOUTH POCKET: azimuth windows where the shallow
// shelf widens and the water goes turquoise. Everything else: deep to the rock.
export function lagoonK(tx: number, ty: number) {
  const th = Math.atan2(ty - CY, tx - CX)
  return Math.max(azWin(th, 2.36, 0.85), 0.65 * azWin(th, 0.85, 0.4))
}

// how much this azimuth is CLIFF coast (the N→E collar + the SE point) vs beach
export function cliffK(theta: number) {
  return Math.max(
    azWin(theta, -2.36, 0.75), // north collar
    azWin(theta, -1.55, 0.75), // NE crag prow
    azWin(theta, -0.7, 0.7),   // east run
    azWin(theta, 0.05, 0.4),   // SE rocky point
  )
}

// underwater shelf width per position: broad turquoise apron in the lagoon
// windows, a tight collar under the cliffs (terrain.ts's exact formula shape);
// each skerry wears its own small apron so it sits IN the water, not ON it
export function shelfW(tx: number, ty: number) {
  const th = Math.atan2(ty - CY, tx - CX)
  // tighter than round 1 (the wide apron read as a white halo swallowing the
  // island at vista zoom — c3's shelf is jewelry, not fog)
  let w = 2.5 + 3.5 * (1 - cliffK(th)) + 6 * lagoonK(tx, ty)
  for (const k of ISLETS) {
    const edge = Math.hypot(tx - k.x, ty - k.y) - k.r
    if (edge < 2) w = Math.max(w, 2 + Math.max(0, 2 - edge))
  }
  return w
}

// ---- THE ROOM TERRACE (the landform's one architectural move) + THE KNOLL.
// Room 305's true footprint from A2.00A at 1.33 ft/tile: 24 x 23 tiles
// (32'-0" x 30'-6", spec §2; rescaled 2026-07-16 on Ash's "way too small" —
// the room is the island's POINT, it deserves the summit). These anchors are
// shared truth: atc-layout.ts derives walls/door/stations from the SAME
// constants — never re-enter feet.
export const FT_PER_TILE = 4 / 3
export const ROOM = {
  x0: 52, y0: 51, // NW corner tile of the wall ring (room "north" = −y edge)
  w: 24, h: 23,   // wall-ring extent: 24 E-W x 23 N-S — the measured 1:1 rect
} as const
// the corridor terrace: the real room opens off its north hallway; the island
// keeps the same relationship — a 2-tile-deep terrace strip along the north
// wall at plateau level, entered by steps at its WEST end (the walk from the
// dock becomes the walk down the hall). Ends flush with the room's corners:
// overhanging tips printed orphan 1-tile lips on the meadow (round-1 lesson).
export const CORRIDOR = { y0: ROOM.y0 - 2, y1: ROOM.y0 - 1, x0: ROOM.x0 - 1, x1: ROOM.x0 + ROOM.w - 1 } as const
// the lighthouse knoll: ON the SE point's root (first-boot lesson: at azimuth
// 0.31 the coast has already fallen — the knoll was in the water). Behind the
// room as seen from the west dock: the vista layers dock → walls → tower.
export const KNOLL = { x: 88, y: 61, r: 3.4 } as const
// the NE crag: a COASTAL RIDGE hugging the prow (first boot drew the old
// radial blob as an inland bullseye) — a capsule along the coast tangent whose
// seaward drop IS the tall dark cliff, the island's silhouette anchor
export const CRAG = { ax: 55, ay: 30.5, bx: 65, by: 32, r: 1.6 } as const
export function cragD(tx: number, ty: number) {
  const vx = CRAG.bx - CRAG.ax, vy = CRAG.by - CRAG.ay
  const L2 = vx * vx + vy * vy
  let t = L2 > 0 ? ((tx - CRAG.ax) * vx + (ty - CRAG.ay) * vy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  const dx = tx - (CRAG.ax + vx * t), dy = ty - (CRAG.ay + vy * t)
  return Math.sqrt(dx * dx + dy * dy)
}

// rectangle signed distance (outside > 0) to the plateau apron — the terrace
// carries the room rect + a 1-tile apron + the corridor strip
function rectD(tx: number, ty: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = Math.max(x0 - tx, 0, tx - x1)
  const dy = Math.max(y0 - ty, 0, ty - y1)
  return Math.sqrt(dx * dx + dy * dy)
}
export function plateauD(tx: number, ty: number) {
  const a = rectD(tx, ty, ROOM.x0 - 1, ROOM.y0 - 1, ROOM.x0 + ROOM.w, ROOM.y0 + ROOM.h) // room + apron
  const b = rectD(tx, ty, CORRIDOR.x0, CORRIDOR.y0, CORRIDOR.x1, CORRIDOR.y1)           // corridor strip
  return Math.min(a, b)
}

// ---- ELEVATION, e in [0,1]: a LOW body + the room terrace + knoll + crag.
// The renderer quantizes to discrete levels (0 beach · 1 meadow · 2 terrace);
// this continuous field is the merge-compatible mirror of that design.
import { vnoise } from '../../ocean'
export function elevBody(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds <= 0) return 0
  const rim = Math.min(1, ds / 4)
  let e = rim * 0.24 // the meadow ring — one gentle level over the beach
  e += 0.02 * (vnoise(tx / 14 + 5, ty / 14 + 2) - 0.5) * rim // soft landform wander
  return Math.max(0, Math.min(1, e))
}
export function elevAt(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds <= 0) return 0
  let e = elevBody(tx, ty)
  // the room terrace: one clean architectural step (smooth 2.5-tile skirt)
  const pd = plateauD(tx, ty)
  e += 0.26 * (1 - Math.min(1, pd / 2.5))
  // the lighthouse knoll
  const kd = Math.hypot(tx - KNOLL.x, ty - KNOLL.y)
  e += 0.24 * Math.max(0, 1 - kd / KNOLL.r)
  // the NE crag ridge — the bare-rock silhouette mass on the prow
  const cd = cragD(tx, ty)
  e += 0.28 * Math.max(0, 1 - cd / 3.4)
  return Math.max(0, Math.min(1, e))
}
