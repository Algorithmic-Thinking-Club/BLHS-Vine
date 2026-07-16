// THE PANTHER CAVE'S LAYOUT MECHANICS — ⚠ LAYOUT ONLY (the hub-mechanics
// contract verbatim, 2026-07-16). Pure DATA + pure functions derived from
// cave-layout. NO rendering, NO UI, NO gameplay logic — this module is the
// geometric TRUTH future systems consume, and the FEATURE SKELETON of the
// game's most-revisited interior: every sit-down system's PLACE is registered
// here as a first-class socket (GAME-DESIGN §3.2's two-hub-maps law).
// Spec: docs/place-specs/panther-cave-interior.md §2-§3.

import {
  GRID, lvlAt, propBlocked, STATIONS, SPAWNS, HEARTH,
  BALCONY, BRIDGE_TILES, PASSAGE, SHELF, DAIS,
} from './cave-layout'

export { GRID, SPAWNS }

// ---- WALKMAP: the single collision truth for the cave.
// Rock mass blocks; the molten trench blocks (the bridge tiles are floor);
// station prop footprints block (reserved now so the walkmap never lies).
export function isWalkable(tx: number, ty: number): boolean {
  const l = lvlAt(tx, ty)
  if (l < 0) return false            // rock or lava
  if (propBlocked(tx, ty)) return false
  return true
}

// ---- THE STEP RULE (per-edge truth): adjacent moves are legal only across
// ≤1 level of rise — the grand stair and the dais treads ARE the transitions;
// walking off the 3-level threshold ledge is not a move, it's a fall.
// The audit BFS and the future walker share THIS function, never a copy.
export function canStep(fx: number, fy: number, tx: number, ty: number): boolean {
  if (!isWalkable(tx, ty)) return false
  const a = lvlAt(fx, fy), b = lvlAt(tx, ty)
  return Math.abs(a - b) <= 1
}

// ---- ZONES (spec §2 C-ids): coarse named regions for event systems, NPC
// spawns, cutscene beats, and season dressing — all keyed off where Thor IS.
export type ZoneId =
  | 'C1-threshold' | 'C2-hearth' | 'C3-chart-table' | 'C4-principal-dais'
  | 'C5-lectern' | 'C6-counselor' | 'C7-outfitter' | 'C8-trophy-wall'
  | 'C9-passage' | 'C10-light-well' | 'hall' | 'rock'

export function zoneAt(tx: number, ty: number): ZoneId {
  if (!isWalkable(tx, ty) && lvlAt(tx, ty) < 0) return 'rock'
  const near = (p: [number, number], r: number) => Math.hypot(tx - p[0], ty - p[1]) < r
  // the shelf is C1 wholesale (the arrival stage)
  const sdx = (tx - SHELF.x) / SHELF.rx, sdy = (ty - SHELF.y) / SHELF.ry
  if (sdx * sdx + sdy * sdy <= 1.2) return 'C1-threshold'
  // sub-places ON the dais win before the dais's blanket zone
  if (near([41, 30], 2.2)) return 'C5-lectern'
  if (near([28.5, 27.5], 2.8)) return 'C8-trophy-wall'
  // the dais is C4 wholesale (authority's platform)
  const ddx = (tx - DAIS.x) / DAIS.rx, ddy = (ty - DAIS.y) / DAIS.ry
  if (ddx * ddx + ddy * ddy <= 1.1) return 'C4-principal-dais'
  if (near(HEARTH, 5.5)) return 'C2-hearth'
  if (near([60.5, 41], 5)) return 'C3-chart-table'
  if (near([28.5, 33], 4.4)) return 'C6-counselor'
  if (near([20.5, 56], 5.2)) return 'C7-outfitter'
  // the passage + balcony: the whole dark corridor is the secret's zone
  const pt = { x0: PASSAGE.x0, y0: PASSAGE.y0, x1: PASSAGE.x1, y1: PASSAGE.y1 }
  const vx = pt.x1 - pt.x0, vy = pt.y1 - pt.y0
  const t = Math.max(0, Math.min(1, ((tx - pt.x0) * vx + (ty - pt.y0) * vy) / (vx * vx + vy * vy)))
  if (Math.hypot(tx - (pt.x0 + vx * t), ty - (pt.y0 + vy * t)) < 2.4 || near([BALCONY.x, BALCONY.y], 3.6)) return 'C9-passage'
  if (near([37, 44], 2.8) || near([43, 39], 2.8)) return 'C10-light-well'
  return 'hall'
}

// ---- SEAMS: scene transitions. The mouth leads back OUT to the exterior —
// the iris transition + arrival plaque ride the SceneManager when the live
// wiring lands (Session A's structural maw first; coordinate via STATE-OF-PLAY).
export type Seam = { id: string; to: string; at: [number, number]; radius: number }
export function getSeams(): Seam[] {
  return [
    // stepping back into the mouth-light = out to the island (the tongue-stair)
    { id: 'cave-mouth', to: 'islandmap', at: [61.5, 30], radius: 2 },
  ]
}

// ---- POIs: THE FEATURE SKELETON — every station is a marked, ledgered
// socket; the actual planner/handbook/wardrobe UIs are Gear-1 systems work
// (GAME-DESIGN §16 phase C). This map ships their PLACES, honestly stubbed.
export type Poi = {
  id: string
  kind: 'ritual' | 'npc' | 'lore' | 'vista' | 'hidden' | 'landmark'
  at: [number, number]
  r: number
  redeemedBy: string
}
export function getPois(): Poi[] {
  const s = (id: string) => STATIONS.find((st) => st.id === id)!
  return [
    { id: 'maw-hearth', kind: 'ritual', at: s('C2-hearth').stand, r: 2.2, redeemedBy: 'the yearly REQUIRED CORE BEAT Y1-Y4 (§7.3) staged at the fire' },
    { id: 'maw-chart-table', kind: 'ritual', at: s('C3-chart-table').stand, r: 1.8, redeemedBy: 'the YEAR PLANNER UI (§7.2); harbor master NPC post' },
    { id: 'maw-principal', kind: 'npc', at: s('C4-principal-desk').stand, r: 2, redeemedBy: 'Principal Panther — founding event (§5 I-9) + year-start vignettes (§7.5)' },
    { id: 'maw-lectern', kind: 'ritual', at: s('C5-lectern').stand, r: 1.6, redeemedBy: 'the Handbook UI (§8.5: Chart/Years/Islands/Cords/Facts/Badges)' },
    { id: 'maw-counselor', kind: 'npc', at: s('C6-counselor').stand, r: 1.8, redeemedBy: 'the live cord/seal tracker board + counselor NPC (§8.4)' },
    { id: 'maw-outfitter', kind: 'ritual', at: s('C7-outfitter').stand, r: 1.8, redeemedBy: 'the wardrobe / dressing room, heron tailor moves in (§4.5)' },
    { id: 'maw-trophy-wall', kind: 'lore', at: s('C8-trophy-wall').stand, r: 1.8, redeemedBy: 'rank letterman/banners/sticker siblings filling across the run (§8.2/§8.3)' },
    { id: 'maw-falls-balcony', kind: 'hidden', at: s('C9-balcony').stand, r: 1.8, redeemedBy: 'the vista behind the falls + its sticker (§8.3)' },
    { id: 'maw-light-well', kind: 'vista', at: s('C10-light-well').stand, r: 1.6, redeemedBy: 'ambient discovery beat; the fern under the day shaft' },
    { id: 'maw-bridge', kind: 'landmark', at: [BRIDGE_TILES[0][0] + 0.5, BRIDGE_TILES[0][1] + 0.5], r: 1.6, redeemedBy: 'the carved bridge over the molten trench (the P0 pick spectacle)' },
  ]
}
