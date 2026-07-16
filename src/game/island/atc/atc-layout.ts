// THE ATC ISLAND'S LAYOUT — authored placements WITH REASONS (the endgame law:
// placement is a decision, never a formula). Everything here derives from the
// shared landform anchors in atc-terrain.ts and the photo-corrected room plan
// (docs/place-specs/atc-grape-island.md §2.3, Ash's room-305 photos 2026-07-16).
// LAYOUT DATA ONLY: no rendering, no gameplay. The renderer and atc-mechanics
// consume this as the single geometric truth.

import { ROOM, CORRIDOR, KNOLL, CX, CY, coastR, GRID } from './atc-terrain'

export const SHADOW = { dx: 0.92, dy: 0.39, alpha: 0.65 } // one sun — the hub's exact light

// ---- THE ROOM'S WALL RING (1:1 from A2.00A; roles per the drawing) ----
// The rect perimeter: north row y0 (corridor wall, THE DOOR at its west end),
// south row y1 (the building's exterior wall — greige siding + brick base +
// window remnants w/ blinds, per the photos), west col x0 (solid; restroom
// block behind; whiteboard + display hang on its INNER face), east col x1
// (the dashed demountable partition to 304 — the island's BROKEN wall).
export const RX0 = ROOM.x0, RY0 = ROOM.y0
export const RX1 = ROOM.x0 + ROOM.w - 1, RY1 = ROOM.y0 + ROOM.h - 1

// THE DOOR: single leaf at the NW corner, ~2-3 ft off the west wall (A2.00A).
// At 2 ft/tile that is a 2-tile opening one tile east of the west wall.
export const DOOR: [number, number][] = [[RX0 + 1, RY0], [RX0 + 2, RY0]]

// the BROKEN east-wall gaps (the partition to 304, honored as ruin): two
// collapsed runs spilling conduits toward the half-buried annex below
export const EAST_GAPS: [number, number][] = [
  [RX1, RY0 + 6], [RX1, RY0 + 7], [RX1, RY0 + 8], [RX1, RY0 + 9], // upper collapse — the conduit spill
  [RX1, RY0 + 14], [RX1, RY0 + 15], [RX1, RY0 + 16],               // lower collapse — jungle pushes through
]

export type WallRole = 'corridor' | 'exterior' | 'solid-west' | 'broken-east' | 'corner'
export function wallAt(tx: number, ty: number): WallRole | null {
  if (tx < RX0 || tx > RX1 || ty < RY0 || ty > RY1) return null
  const onX = tx === RX0 || tx === RX1, onY = ty === RY0 || ty === RY1
  if (!onX && !onY) return null
  if (DOOR.some(([dx, dy]) => dx === tx && dy === ty)) return null      // the opening
  if (EAST_GAPS.some(([gx, gy]) => gx === tx && gy === ty)) return null // the collapse
  if (onX && onY) return 'corner'
  if (ty === RY0) return 'corridor'
  if (ty === RY1) return 'exterior'
  if (tx === RX0) return 'solid-west'
  return 'broken-east'
}

// THE ASYMMETRIC RUIN (the composition law: one story per silhouette). The
// building died FALLING TOWARD THE SEA: the NW quarter (door, teaching wall)
// still stands almost roof-height; the ring decays through the mid runs; the
// whole SE quarter is DOWN — rubble at floor level, the room's broken edge
// open to the cliff and the water beyond it.
export type WallState = 'tall' | 'stub' | 'fallen'
export function wallState(tx: number, ty: number): WallState | null {
  const w = wallAt(tx, ty)
  if (!w) return null
  // the fallen SE quarter: the east half of the south wall + the south half
  // of the east wall + the SE corner
  if ((ty === RY1 && tx >= RX0 + 13) || (tx === RX1 && ty >= RY0 + 17)) return 'fallen'
  // the tall NW survivor: the north wall west of mid + the west wall's upper
  // run + both their shared corner and the door jambs
  if ((ty === RY0 && tx <= RX0 + 11) || (tx === RX0 && ty <= RY0 + 13)) return 'tall'
  return 'stub'
}

// the jungle's WEDGE into the room: east of this boundary the carpet loses
// to undergrowth (a drawn diagonal, wobbled — terrain wins, tile by tile)
export function jungleWedgeK(tx: number, ty: number) {
  const edge = RX1 - 4.5 + Math.sin(ty * 0.9 + 2) * 1.4
  return Math.max(0, Math.min(1, (tx - edge) / 3))
}
// canopy INSIDE the ring: palms leaning over the desks from the wedge
export const ROOM_PALMS: { at: [number, number]; scale: number }[] = [
  { at: [RX1 - 2, RY0 + 4], scale: 0.95 },
  { at: [RX1 - 1, RY0 + 12], scale: 1.05 },
  { at: [RX1 - 3, RY0 + 19], scale: 0.85 },
]

// window remnants on the exterior (south) wall — the photos show blinds along
// the whole south run; two segments keep the remnant read (full glazing would
// fight the ruin language)
export const WINDOWS: [number, number][] = [
  [RX0 + 5, RY1], [RX0 + 6, RY1], [RX0 + 7, RY1], [RX0 + 8, RY1],
  [RX0 + 13, RY1], [RX0 + 14, RY1], [RX0 + 15, RY1], [RX0 + 16, RY1],
]

// ---- THE STATIONS (photo-corrected 2026-07-16 — no longer provisional) ----
// Interior floor: tx RX0+1..RX1-1, ty RY0+1..RY1-1 (14 x 13 tiles).
// The photos give two systems: a perimeter counter run under the south
// windows (students face the wall) and a double-sided island row mid-room
// (monitors back-to-back). Desk unit = 2x1 tiles (a real 5'x2' bench at
// 2 ft/tile, spec §2.2).
export type Station = { at: [number, number]; w: number; face: 'N' | 'S'; kind: 'counter' | 'island' }
export const STATIONS: Station[] = [
  // south perimeter counter (against the inner south wall, facing it — the
  // photo's continuous window row; reason: the room's densest work line,
  // sunset light pours over these screens through the wall's window cuts)
  { at: [RX0 + 3, RY1 - 1], w: 2, face: 'S', kind: 'counter' },
  { at: [RX0 + 6, RY1 - 1], w: 2, face: 'S', kind: 'counter' },
  { at: [RX0 + 9, RY1 - 1], w: 2, face: 'S', kind: 'counter' },
  { at: [RX0 + 13, RY1 - 1], w: 2, face: 'S', kind: 'counter' },
  { at: [RX0 + 16, RY1 - 1], w: 2, face: 'S', kind: 'counter' },
  { at: [RX0 + 19, RY1 - 1], w: 2, face: 'S', kind: 'counter' },
  // TWO double-sided island rows (the photos' mid-room tables at real count),
  // staggered so the ruin reads lived-in, ringing the through-floor palm —
  // the jungle grew up through the lab and the club just worked around it
  { at: [RX0 + 3, RY0 + 8], w: 2, face: 'N', kind: 'island' },
  { at: [RX0 + 7, RY0 + 8], w: 2, face: 'N', kind: 'island' },
  { at: [RX0 + 11, RY0 + 8], w: 2, face: 'N', kind: 'island' },
  { at: [RX0 + 5, RY0 + 9], w: 2, face: 'S', kind: 'island' },
  { at: [RX0 + 9, RY0 + 9], w: 2, face: 'S', kind: 'island' },
  { at: [RX0 + 13, RY0 + 9], w: 2, face: 'S', kind: 'island' },
  { at: [RX0 + 4, RY0 + 14], w: 2, face: 'N', kind: 'island' },
  { at: [RX0 + 8, RY0 + 14], w: 2, face: 'N', kind: 'island' },
  { at: [RX0 + 12, RY0 + 14], w: 2, face: 'N', kind: 'island' },
  { at: [RX0 + 6, RY0 + 15], w: 2, face: 'S', kind: 'island' },
  { at: [RX0 + 10, RY0 + 15], w: 2, face: 'S', kind: 'island' },
  { at: [RX0 + 14, RY0 + 15], w: 2, face: 'S', kind: 'island' },
]
// THE ACTIVITY STATION: the desk nearest the broken east wall — the
// code-block puzzle socket (ledger `atc-activity`), the one still "wired"
// to the annex through the collapse
export const ACTIVITY: [number, number] = [RX0 + 18, RY0 + 8]
export const ACTIVITY_STATION: Station = { at: ACTIVITY, w: 2, face: 'N', kind: 'island' }

// THE THROUGH-FLOOR PALM (the meshing centerpiece, Ash's "blow my mind"):
// a coconut palm that broke up through the carpet mid-room; the island rows
// ring it, and its crack feeds moss back into the floor
export const FEATURE_PALM: [number, number] = [RX0 + 15, RY0 + 12]
// ferns and undergrowth taking the floor back (authored, each with a reason)
export const ROOM_FERNS: [number, number][] = [
  [RX0 + 21, RY0 + 7],  // spilling through the upper east collapse
  [RX0 + 21, RY0 + 15], // the lower collapse's green tongue
  [RX0 + 5, RY0 + 20],  // the south row's shadowed end
  [RX0 + 17, RY0 + 20], // between the last counters
  [RX0 + 10, RY0 + 12], // a floor crack going green mid-room
]
// the photos' box clutter along the east side (the room's storage wall)
export const ROOM_BOXES: [number, number][] = [
  [RX0 + 20, RY0 + 3],  // stacked by the NE corner
  [RX0 + 21, RY0 + 11], // between the two collapses
  [RX0 + 19, RY0 + 18], // the SE corner pile
]

// the TEACHER POST (pixel-Ash's spot, ledger `atc-host`): just inside the
// door, facing the room — the host greets you at the threshold like a real
// first day. Desk 2x1 + the chair behind it.
export const TEACHER: { at: [number, number]; w: number } = { at: [RX0 + 3, RY0 + 2], w: 2 }

// the SINK CASEWORK (photo: tan counter + paper-towel dispenser, NW corner —
// plumbing shares the west block): a 1x3 run along the inner west wall
export const SINK: { at: [number, number]; len: number } = { at: [RX0 + 1, RY0 + 2], len: 3 }

// the TEACHING WALL (photo: whiteboard + big wall display on the west wall) —
// drawn on the INNER face of the west wall stubs; three learn-beat spots
// (ledger `atc-learn-1..3`) stand along it
export const WHITEBOARD: { wall: 'west'; y0: number; y1: number } = { wall: 'west', y0: RY0 + 6, y1: RY0 + 12 }
export const DISPLAY: { wall: 'west'; y0: number; y1: number } = { wall: 'west', y0: RY0 + 14, y1: RY0 + 16 }
export const LEARN_SPOTS: [number, number][] = [
  [RX0 + 2, RY0 + 9],  // before the whiteboard — learn beat 1 (what ATC is)
  [RX0 + 2, RY0 + 15], // before the display — learn beat 2 (when it meets)
  [RX0 + 12, RY0 + 3], // mid-room north aisle, facing the poster wall — beat 3 (how to join)
]

// the ROOM-305 PLAQUE (the drawing's own room tag as set dressing): on the
// door's east jamb, read on the way in
export const PLAQUE: [number, number] = [RX0 + 3, RY0]
// the REWARD MOMENT (ledger `atc-reward`): sticker + result, just inside the
// door on the way OUT — the leaving beat
export const REWARD: [number, number] = [RX0 + 2, RY0 + 1]

// ---- OUTSIDE THE ROOM ----

// THE 304 ANNEX (the neighbor behind the dashed partition, hinted not built):
// a half-buried server rack below the broken east wall, conduits running from
// the upper collapse down the terrace skirt to it
export const ANNEX: { rack: [number, number]; conduit: [number, number][] } = {
  rack: [RX1 + 4, RY0 + 6],
  conduit: [[RX1 + 0.5, RY0 + 5], [RX1 + 2, RY0 + 5.5], [RX1 + 3.5, RY0 + 6]],
}

// THE SERVER-RACK LIGHTHOUSE (ledger `atc-lighthouse`, THE from-the-sea
// landmark, GAME-DESIGN §6.8): on the knoll's crown, SE shoulder — behind the
// room from the west dock so the vista layers dock → walls → tower
export const LIGHTHOUSE: [number, number] = [KNOLL.x, KNOLL.y]

// THE DOCK (ledger `atc-berth`): a small purpose-built pier on the west shore
// facing the hub across the water. Harbor construction grammar — per-tile
// lift/mat/walk = collision truth — but ONE short pier, never a harbor.
export type DockTile = { tx: number; ty: number; lift: number; mat: 'plank' | 'stone'; walk: boolean }
export const DOCK_LIFT = 10
export const DOCK: { tiles: DockTile[]; root: [number, number]; berth: [number, number] } = (() => {
  // root on the lagoon sand (θ≈2.36), pier runs axis-aligned +y (screen SW)
  // out past the waterline — the berth face looks straight at the hub
  const rx = 43, ry = 76
  const tiles: DockTile[] = []
  for (let y = ry; y <= ry + 5; y++) {
    for (let x = rx; x <= rx + 1; x++) {
      // the root row RAMPS out of the sand (3 → 7 → 10): a pier grows out of
      // its shore, it never floats beside it (the dock-zoom lesson)
      const lift = y === ry ? 3 : y === ry + 1 ? 7 : DOCK_LIFT
      tiles.push({ tx: x, ty: y, lift, mat: 'plank', walk: true })
    }
  }
  return { tiles, root: [rx + 0.5, ry], berth: [rx + 0.5, ry + 5] }
})()
const DOCK_MAP = new Map<number, DockTile>()
for (const t of DOCK.tiles) DOCK_MAP.set(t.ty * GRID + t.tx, t)
export function dockAt(tx: number, ty: number): DockTile | undefined {
  return DOCK_MAP.get(ty * GRID + tx)
}

// THE STEPS: the one climb (meadow → corridor terrace) at the hall's west
// mouth — a half-level pad so the ascent is a designed gesture, not a scramble
export const STEPS: { tiles: [number, number][]; lift: number } = {
  tiles: [[CORRIDOR.x0 - 1, CORRIDOR.y0], [CORRIDOR.x0 - 1, CORRIDOR.y1]],
  lift: 0.5, // in LEVELS (renderer converts): halfway between meadow and terrace
}

// THE WORN PATH (the corridor made honest): dock → shore rise → the steps →
// down the hall along the north wall → turn in at the door. Plus the
// lighthouse spur that walks PAST the annex (the lore sits on the way).
export const PATH: [number, number][] = [
  [DOCK.root[0], DOCK.root[1]],
  [46.5, 71.5], [49.5, 65], [51, 58],
  [50.5, 53.5], [50.2, CORRIDOR.y0 + 1],        // the shore rise bends to the steps
  [CORRIDOR.x0 + 1, CORRIDOR.y0 + 1],           // onto the terrace
  [DOOR[0][0] + 0.5, CORRIDOR.y0 + 1],          // down the hall
  [DOOR[0][0] + 0.5, RY0 + 1.2],                // turn in at the door
]
export const SPUR: [number, number][] = [
  [CORRIDOR.x1 - 1, CORRIDOR.y0 + 1],           // the hall's east end
  [RX1 + 3, RY0 + 4],                            // around the plateau shoulder
  [ANNEX.rack[0] + 0.6, ANNEX.rack[1] + 1.5],    // past the half-buried rack
  [84, 62.5], [KNOLL.x - 1, KNOLL.y + 0.5],      // up to the tower's door
]
// distance to a polyline (the hub's exact rasterization approach)
function polyD(tx: number, ty: number, line: [number, number][]) {
  let best = 99
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i], [x1, y1] = line[i + 1]
    const vx = x1 - x0, vy = y1 - y0
    const L2 = vx * vx + vy * vy
    let t = L2 > 0 ? ((tx - x0) * vx + (ty - y0) * vy) / L2 : 0
    t = Math.max(0, Math.min(1, t))
    const dx = tx - (x0 + vx * t), dy = ty - (y0 + vy * t)
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < best) best = d
  }
  return best
}
export function pathD(tx: number, ty: number) {
  return Math.min(polyD(tx, ty, PATH), polyD(tx, ty, SPUR))
}

// THE CABLE RUN (the island's river — "techy" as STRUCTURE, not decal): one
// teal-glowing line from the activity desk, out the upper collapse, down the
// terrace past the annex rack, along the point to the lighthouse. Drawn as
// ground material + glow nodes; later systems can pulse packets down it.
export const CABLE: [number, number][] = [
  [RX0 + 19, RY0 + 8],           // the activity desk (the one still wired)
  [RX1 - 0.5, RY0 + 7.5],        // out through the upper collapse
  [RX1 + 3, RY0 + 8.2],          // down the terrace skirt
  [ANNEX.rack[0] + 0.4, ANNEX.rack[1] + 0.4], // through the half-buried rack
  [83, 61.5], [86.5, 61.2],      // along the point's root
  [88, 61.8],                    // up into the lighthouse
]
export function cableD(tx: number, ty: number) {
  return polyD(tx, ty, CABLE)
}

// THE EASTER EGG (ledger `atc-egg`, builder's choice): a small carved stone
// tablet half-buried in the south pocket cove's sand — "the first commit",
// pathless by design (hidden things get no path; the hub's own law)
export const EGG: [number, number] = [
  Math.round(CX + Math.cos(0.85) * (coastR(0.85) - 2.5)),
  Math.round(CY + Math.sin(0.85) * (coastR(0.85) - 2.5)),
]

// ---- VEGETATION: authored grove sites only (never a field formula) ----
export const GROVES: { x: number; y: number; r: number; note: string }[] = [
  { x: 40, y: 64, r: 3.2, note: 'lagoon north arm — frames the dock vista left' },
  { x: 54, y: 77, r: 2.6, note: 'arrival enclosure south — the path lands between green masses' },
  { x: 47, y: 67, r: 2.2, note: 'arrival enclosure north — the second flanking mass' },
  { x: 66, y: 42, r: 3.2, note: 'north meadow — breaks the corridor terrace long line' },
  { x: 79, y: 70, r: 3.0, note: 'knoll skirt — separates lighthouse from the cove read' },
  { x: 62, y: 78, r: 2.5, note: 'south meadow rhythm beat' },
  { x: 38, y: 55, r: 2.4, note: 'NW headland crown — the dark arm wears its cap' },
  { x: 78, y: 47, r: 2.6, note: 'NE shoulder — softens the crag-to-corridor handoff' },
]
export function vegK(tx: number, ty: number) {
  let k = 0
  for (const g of GROVES) {
    const d = Math.hypot(tx - g.x, ty - g.y)
    k = Math.max(k, Math.max(0, 1 - d / g.r))
  }
  // vegetation yields to the path, the room + corridor and the beach line
  if (pathD(tx, ty) < 1.6) k *= 0.15
  return k
}

// ---- COLLISION REGISTRY: every prop footprint that blocks the walk ----
// (wall stubs block via wallAt; this set covers furniture + landmarks)
const BLOCKED = new Set<number>()
function block(tx: number, ty: number) { BLOCKED.add(Math.round(ty) * GRID + Math.round(tx)) }
for (const s of [...STATIONS, ACTIVITY_STATION]) for (let i = 0; i < s.w; i++) block(s.at[0] + i, s.at[1])
block(FEATURE_PALM[0], FEATURE_PALM[1]) // the through-floor palm's trunk
for (let i = 0; i < TEACHER.w; i++) block(TEACHER.at[0] + i, TEACHER.at[1])
for (let i = 0; i < SINK.len; i++) block(SINK.at[0], SINK.at[1] + i)
block(ANNEX.rack[0], ANNEX.rack[1])
for (let ox = 0; ox <= 1; ox++) for (let oy = 0; oy <= 1; oy++) block(LIGHTHOUSE[0] + ox - 1, LIGHTHOUSE[1] + oy - 1) // 2x2 tower base
export function propBlocked(tx: number, ty: number) {
  return BLOCKED.has(Math.round(ty) * GRID + Math.round(tx))
}
