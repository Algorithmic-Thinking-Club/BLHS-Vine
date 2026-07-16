// THE ATC ISLAND'S LAYOUT — authored placements WITH REASONS (the endgame law:
// placement is a decision, never a formula). REBUILT 2026-07-16 with the
// terrain rebuild (the hub-grammar base): every site re-anchored to the new
// landform. The room's wall-ring machinery is GONE from this map — the
// classroom is the atc-room INTERIOR (spec §8); out here live the sail/walk
// sockets: dock, path, Terminal, fragments, network, lighthouse, egg.
// LAYOUT DATA ONLY: no rendering, no gameplay.

import { CORRIDOR, KNOLL, SUMMIT, GRID } from './atc-terrain'

export const SHADOW = { dx: 0.92, dy: 0.39, alpha: 0.65 } // one sun — the hub's exact light

// ---- THE DOCK (the ocean seam): a straight pier out of the dock bay's beach
// (terrain: the θ≈1.85 bite). Root on the sand, berth past the surf line.
export type DockTile = { tx: number; ty: number; lift: number; walk: boolean }
export const DOCK = (() => {
  const root: [number, number] = [60, 75] // ON the bay's sand (shore ~R13 at θ1.85)
  const tiles: DockTile[] = []
  for (let i = 0; i < 6; i++) tiles.push({ tx: 60, ty: 75 + i, lift: 10, walk: true })
  // the berth head: a 2x2 platform at the pier's end
  tiles.push({ tx: 59, ty: 79, lift: 10, walk: true })
  tiles.push({ tx: 59, ty: 80, lift: 10, walk: true })
  tiles.push({ tx: 61, ty: 79, lift: 10, walk: true })
  tiles.push({ tx: 61, ty: 80, lift: 10, walk: true })
  return { root, berth: [60, 80] as [number, number], tiles }
})()
const DOCK_MAP = new Map<number, DockTile>()
for (const t of DOCK.tiles) DOCK_MAP.set(t.ty * GRID + t.tx, t)
export function dockAt(tx: number, ty: number) {
  return DOCK_MAP.get(ty * GRID + tx)
}

// ---- THE TERMINAL (spec §9, Ash's pick B): the monument door on the summit
// crown. Thor walks into the glowing screen → the atc-room interior.
export const TERMINAL: [number, number] = [SUMMIT.x, SUMMIT.y - 2]        // = (60, 56)
export const TERMINAL_SEAM: [number, number] = [SUMMIT.x, SUMMIT.y]      // the screen threshold
// the forecourt: carpet spilling out of the doorway across the crown
export const FORECOURT = { x0: 56, y0: 58, x1: 64, y1: 62 } as const
// the hero wall panels stand as FREESTANDING ruin fragments flanking the
// court (composition, never enclosure): the school's remains
export const FRAG_A: [number, number] = [55.5, 60.5] // door-run panel, west shoulder
export const FRAG_B: [number, number] = [64.5, 57.5] // teaching-wall panel, east shoulder
// the through-crown palm: the jungle broke up through the old floor
export const FEATURE_PALM: [number, number] = [56, 62]

// crown dressing (kept data-driven so photos/interior correct it later):
// ferns at the fragments' feet, weathered equipment crates near the annex line
export const ROOM_FERNS: [number, number][] = [
  [55, 61.5], [56.5, 59], [64, 59], [63.5, 61], [58, 62.5],
]
export const ROOM_BOXES: [number, number][] = [[66, 60], [66.8, 60.6]]
// canopy palms leaning over the crown's east rim (the jungle pressing in)
export const ROOM_PALMS: { at: [number, number]; scale: number }[] = [
  { at: [65.5, 56.5], scale: 0.95 },
  { at: [66.5, 61.5], scale: 1.05 },
  { at: [57, 54.5], scale: 0.85 },
]

// ---- the ANNEX: the dead server rack, half-buried on the summit's east
// shoulder where the ground falls toward the point
export const ANNEX = { rack: [70, 60] as [number, number] }

// ---- the LIGHTHOUSE: on the knoll at the point's tip
export const LIGHTHOUSE: [number, number] = [KNOLL.x, KNOLL.y]

// ---- the EASTER EGG: a half-buried floppy disk on the south pocket cove
export const EGG: [number, number] = [75, 77]

// ---- THE WALK: dock root → up the bay meadow → the corridor terrace → the
// crown's south lip. One path, one reason: it is the arrival's spine.
export const PATH: [number, number][] = [
  [60, 74.5], [59.5, 71.5], [59, 69], [59.5, 65.5], [60, 62.5], [60, 59],
]
// the spur: junction → east along the shoulder toward the annex + the point
export const SPUR: [number, number][] = [
  [59.5, 66], [63, 65], [67, 62.5], [70, 60.5],
]
export function polyD(tx: number, ty: number, line: [number, number][]) {
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

// ---- THE STEPS: treads where the walk climbs the crown's south lip
export const STEPS = {
  tiles: [[60, 63], [60, 64]] as [number, number][],
  lift: 0.5,
}

// ---- THE CABLE RUNS (the island's river): one line from the dock's junction
// box up the walk, splitting at the JUNCTION STONE to feed three nodes — the
// Terminal (alive), the annex rack (dead), the lighthouse beacon.
export const JUNCTION: [number, number] = [59, 66]
export const CABLE_RUNS: [number, number][][] = [
  [[60, 74.5], [59.5, 71], [59, 68.5], JUNCTION],
  [JUNCTION, [59.5, 62.5], [60, 59.5], TERMINAL_SEAM],
  [JUNCTION, [63, 65], [67, 62.5], [ANNEX.rack[0] + 0.4, ANNEX.rack[1] + 0.4], [78, 61], [84, 61.2], [KNOLL.x, KNOLL.y + 0.8]],
]
export function cableD(tx: number, ty: number) {
  let best = 99
  for (const run of CABLE_RUNS) best = Math.min(best, polyD(tx, ty, run))
  return best
}

// ---- THE CANOPY MASSES (the hub's P4 grammar: composed, each with a reason —
// never sprinkle). The ground darkens under each mass; palms plant densest at
// the core, thinning to understory at the fringe. Open by design: the dock
// bay corridor, the crown court, the point's spine.
export const GROVES: { x: number; y: number; r: number; why: string }[] = [
  { x: 52, y: 48, r: 6, why: 'the NW back-mass — the far-zoom green anchor behind the summit' },
  { x: 46, y: 66, r: 5.5, why: 'the west lobe grove — closes the hub-facing shore' },
  { x: 68, y: 71, r: 4.5, why: 'east of the dock bay — frames the arrival with the walk open' },
  { x: 77, y: 57, r: 3.5, why: 'the point-root grove — the last green before the bare spine' },
  { x: 66, y: 50, r: 4, why: 'the north-shoulder grove under the crag' },
]
export function vegK(tx: number, ty: number) {
  let k = 0
  for (const g of GROVES) {
    const d = Math.hypot(tx - g.x, ty - g.y)
    const s = Math.max(0, Math.min(1, (g.r * 1.15 - d) / (g.r * 0.6)))
    k = Math.max(k, s * s * (3 - 2 * s))
  }
  return k
}

// ---- COLLISION (exterior): the monument, the fragments, the palm, the rack,
// the tower, the junction stone. Everything else walks.
const BLOCKED = new Set<number>()
function block(tx: number, ty: number) { BLOCKED.add(Math.round(ty) * GRID + Math.round(tx)) }
for (let ox = -2; ox <= 2; ox++) for (let oy = -1; oy <= 1; oy++) block(TERMINAL[0] + ox, TERMINAL[1] + oy)
for (let i = -2; i <= 2; i++) block(FRAG_A[0] + i, FRAG_A[1] - Math.round(i * 0.5))
for (let i = -2; i <= 2; i++) block(FRAG_B[0] - Math.round(i * 0.5), FRAG_B[1] + i)
block(JUNCTION[0], JUNCTION[1])
block(FEATURE_PALM[0], FEATURE_PALM[1])
block(ANNEX.rack[0], ANNEX.rack[1])
for (let ox = 0; ox <= 1; ox++) for (let oy = 0; oy <= 1; oy++) block(LIGHTHOUSE[0] + ox - 1, LIGHTHOUSE[1] + oy - 1)
export function propBlocked(tx: number, ty: number) {
  return BLOCKED.has(Math.round(ty) * GRID + Math.round(tx))
}

// the corridor rect re-exported for zone naming (mechanics)
export { CORRIDOR }
