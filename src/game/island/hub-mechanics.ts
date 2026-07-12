// THE EXTERIOR ISLAND'S LAYOUT MECHANICS — ⚠ LAYOUT ONLY (2026-07-11).
// Pure DATA + pure functions derived from hub-layout/terrain. NO rendering, NO
// UI, NO gameplay logic lives here yet — this module is the geometric TRUTH
// that future systems (Thor's collision, zone events, scene seams, interaction
// prompts) will consume. If you are a future session: everything here is
// inert scaffolding until the systems work wires it up; extend it, don't
// bolt gameplay into it. Spec: docs/place-specs/island-exterior-architecture.md §4.

import { coastDs, lavaDist } from './terrain'
import { coneH } from './volcano'
import {
  HARBOR, harborAt, PORTS, PLAZA, PLAZA_R, GATE_HEAD, TONGUE, STELES,
  LIGHTHOUSE, FALLS, BECU_TREE, TIDEPOOLS, tongueD, pathD, crossingD,
  WEST_OVERLOOK,
} from './hub-layout'

// ---- WALKMAP: the single collision truth for the exterior map.
// Sea is blocked unless a harbor deck tile says walk; the cone is blocked
// above its grassy toe EXCEPT the tongue-stair corridor; molten core + charred
// bed are blocked EXCEPT the cooled-crust crossings (the promenade ring must
// stay connected — the island audit proves it); everything else on land walks.
export function isWalkable(tx: number, ty: number): boolean {
  const h = harborAt(Math.round(tx), Math.round(ty))
  if (h) return h.walk
  if (coastDs(tx, ty) <= 0) return false        // open water
  const onTongue = tongueD(tx, ty) < 1.4        // the carved stair up to the mouth
  const onCross = crossingD(tx, ty) < 1.5       // cooled crust over the flows
  if (!onTongue && coneH(tx, ty) > 2) return false
  if (!onTongue && !onCross && lavaDist(tx, ty) < 1.8) return false
  return true
}

// ---- ZONES (architecture doc Z-ids): coarse named regions for event systems.
export type ZoneId =
  | 'Z1-east-port' | 'Z2-gate' | 'Z3-steles-walk' | 'Z4-river-falls'
  | 'Z5-lighthouse-bluff' | 'Z6-north-port' | 'Z7-south-port' | 'Z8-west-cove'
  | 'Z9-west-head' | 'Z10-meadow' | 'Z11-hidden' | 'sea' | 'volcano'

export function zoneAt(tx: number, ty: number): ZoneId {
  if (coastDs(tx, ty) <= 0 && !harborAt(Math.round(tx), Math.round(ty))) return 'sea'
  const near = (p: [number, number] | { x: number; y: number }, r: number) => {
    const px = Array.isArray(p) ? p[0] : p.x, py = Array.isArray(p) ? p[1] : p.y
    return Math.hypot(tx - px, ty - py) < r
  }
  if (near([HARBOR.root[0], HARBOR.root[1]], 14)) return 'Z1-east-port'
  if (tongueD(tx, ty) < 3 || near(GATE_HEAD, 6)) return 'Z2-gate'
  if (near(WEST_OVERLOOK, 6)) return 'Z9-west-head'
  if (near(FALLS, 6)) return 'Z4-river-falls'
  if (near(LIGHTHOUSE, 6)) return 'Z5-lighthouse-bluff'
  if (near(PORTS.north, 7)) return 'Z6-north-port'
  if (near(PORTS.south, 7)) return 'Z7-south-port'
  if (near(PORTS.west, 7)) return 'Z8-west-cove'
  if (near(BECU_TREE, 4) || near(TIDEPOOLS, 4)) return 'Z11-hidden'
  if (near(PLAZA, PLAZA_R + 3) || (pathD(tx, ty) < 2.5 && STELES.some((s) => Math.hypot(tx - s[0], ty - s[1]) < 10))) return 'Z3-steles-walk'
  if (coneH(tx, ty) > 2) return 'volcano'
  return 'Z10-meadow'
}

// ---- SEAMS: scene transitions (stub scene ids; wiring comes with systems work).
export type Seam = { id: string; to: string; at: [number, number]; radius: number }
export function getSeams(): Seam[] {
  return [
    // walking into the gate head's open mouth = the Maw interior map
    { id: 'maw-mouth', to: 'panther-cave', at: [GATE_HEAD[0], GATE_HEAD[1]], radius: 1.6 },
    // boarding at the berth = the ocean overworld (sailing)
    { id: 'east-berth', to: 'ocean', at: [HARBOR.berth[0], HARBOR.berth[1]], radius: 1.8 },
  ]
}

// ---- POIs: interactable landmarks (positions + kind; interaction radius only).
export type Poi = { id: string; kind: 'landmark' | 'lore' | 'ritual' | 'vista' | 'hidden'; at: [number, number]; r: number }
export function getPois(): Poi[] {
  return [
    { id: 'arrivals-bell', kind: 'ritual', at: [HARBOR.bell[0], HARBOR.bell[1]], r: 1.6 },
    ...STELES.map((s, i) => ({ id: `power-stele-${i + 1}`, kind: 'lore' as const, at: [s[0], s[1]] as [number, number], r: 1.5 })),
    { id: 'gate-maw', kind: 'landmark', at: [GATE_HEAD[0], GATE_HEAD[1]], r: 2.5 },
    // you never stand ON a carved mountain head — the POI is its OVERLOOK at the
    // flank toe (computed in hub-layout from the real landform; audit-proven)
    { id: 'west-head', kind: 'vista', at: [WEST_OVERLOOK[0], WEST_OVERLOOK[1]], r: 2.5 },
    { id: 'falls-pool', kind: 'vista', at: [FALLS[0], FALLS[1]], r: 2.5 },
    { id: 'lighthouse', kind: 'vista', at: [LIGHTHOUSE[0], LIGHTHOUSE[1]], r: 2 },
    { id: 'becu-treehouse', kind: 'hidden', at: [BECU_TREE[0], BECU_TREE[1]], r: 1.8 },
    { id: 'tidepools', kind: 'hidden', at: [TIDEPOOLS[0], TIDEPOOLS[1]], r: 1.8 },
    { id: 'tongue-stair', kind: 'landmark', at: [TONGUE[0][0], TONGUE[0][1]], r: 1.8 },
  ]
}
