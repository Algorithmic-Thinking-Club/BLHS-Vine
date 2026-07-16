// THE ATC ISLAND'S LAYOUT MECHANICS — ⚠ LAYOUT ONLY (the hub-mechanics
// contract, 2026-07-16). Pure DATA + pure functions derived from
// atc-layout/atc-terrain. NO rendering, NO gameplay logic — this module is the
// geometric TRUTH future systems consume, and the FEATURE SKELETON demanded by
// the double mandate (spec §7.2): every game touchpoint on this island is
// registered here as a first-class, marked socket. The PLACEHOLDER LEDGER in
// docs/place-specs/atc-grape-island.md §7.2 mirrors this list — keep both.

import { coastDs, CORRIDOR, KNOLL, cragD } from './atc-terrain'
import {
  wallAt, dockAt, propBlocked, DOOR, TEACHER, ACTIVITY, LEARN_SPOTS, REWARD,
  LIGHTHOUSE, EGG, DOCK, ANNEX, PLAQUE, RX0, RX1, RY0, RY1,
} from './atc-layout'

// ---- WALKMAP: the single collision truth for the ATC map.
// Sea blocks unless a dock deck tile says walk; wall stubs block (the door and
// the broken-east gaps are open by data); furniture/landmark footprints block;
// the crag's bare-rock crown blocks (you can't climb the silhouette).
export function isWalkable(tx: number, ty: number): boolean {
  const d = dockAt(Math.round(tx), Math.round(ty))
  if (d) return d.walk
  if (coastDs(tx, ty) <= 0) return false      // open water
  if (wallAt(Math.round(tx), Math.round(ty))) return false
  if (propBlocked(tx, ty)) return false
  if (cragD(tx, ty) < 1.9) return false // the crag's bare crown — you don't climb the silhouette
  return true
}

// ---- ZONES (spec §3 A-ids): coarse named regions for event systems.
export type ZoneId =
  | 'A1-dock' | 'A2-path' | 'A3-room' | 'A4-stations' | 'A5-lighthouse'
  | 'A6-annex' | 'A7-ring' | 'sea'

export function zoneAt(tx: number, ty: number): ZoneId {
  const rtx = Math.round(tx), rty = Math.round(ty)
  if (coastDs(tx, ty) <= 0 && !dockAt(rtx, rty)) return 'sea'
  if (dockAt(rtx, rty) || Math.hypot(tx - DOCK.root[0], ty - DOCK.root[1]) < 4) return 'A1-dock'
  const inRoom = tx >= RX0 && tx <= RX1 && ty >= RY0 && ty <= RY1
  if (inRoom) {
    // the working core of the room (the desks) vs the rest of the floor
    return ty >= RY0 + 5 && ty <= RY1 - 1 && tx >= RX0 + 3 ? 'A4-stations' : 'A3-room'
  }
  const onCorridor = tx >= CORRIDOR.x0 && tx <= CORRIDOR.x1 && ty >= CORRIDOR.y0 && ty <= CORRIDOR.y1
  if (onCorridor) return 'A2-path'
  if (Math.hypot(tx - KNOLL.x, ty - KNOLL.y) < KNOLL.r + 2) return 'A5-lighthouse'
  if (Math.hypot(tx - ANNEX.rack[0], ty - ANNEX.rack[1]) < 3.5) return 'A6-annex'
  return 'A7-ring'
}

// ---- SEAMS: scene transitions (stub ids; wiring is later systems work).
export type Seam = { id: string; to: string; at: [number, number]; radius: number }
export function getSeams(): Seam[] {
  return [
    // boarding at the pier's end = the ocean overworld (sail home to the hub)
    { id: 'atc-berth', to: 'ocean', at: [DOCK.berth[0], DOCK.berth[1]], radius: 1.8 },
    // the 305 threshold: crossing the door fires the island-loop ARRIVE beat
    { id: 'atc-door', to: 'arrive-beat', at: [DOOR[0][0] + 0.5, DOOR[0][1]], radius: 1.4 },
  ]
}

// ---- POIs: THE FEATURE SKELETON (ledger ids, spec §7.2 — all eight sockets).
export type Poi = {
  id: string
  kind: 'landmark' | 'lore' | 'ritual' | 'vista' | 'hidden' | 'npc' | 'activity'
  at: [number, number]
  r: number
  redeemedBy: string // the future system that lights this socket up
}
export function getPois(): Poi[] {
  return [
    { id: 'atc-host', kind: 'npc', at: [TEACHER.at[0] + 1, TEACHER.at[1] + 1], r: 2, redeemedBy: 'pixel-Ash host NPC (GAME-DESIGN §6.8, the one true cameo)' },
    { id: 'atc-activity', kind: 'activity', at: [ACTIVITY[0] + 0.5, ACTIVITY[1] - 1], r: 1.6, redeemedBy: 'the code-block puzzle (SEQUENCE frame)' },
    { id: 'atc-learn-1', kind: 'lore', at: LEARN_SPOTS[0], r: 1.5, redeemedBy: 'learn beat: what ATC is (whiteboard)' },
    { id: 'atc-learn-2', kind: 'lore', at: LEARN_SPOTS[1], r: 1.5, redeemedBy: 'learn beat: when it meets (display)' },
    { id: 'atc-learn-3', kind: 'lore', at: LEARN_SPOTS[2], r: 1.5, redeemedBy: 'learn beat: how to join (poster wall)' },
    { id: 'atc-reward', kind: 'ritual', at: REWARD, r: 1.5, redeemedBy: 'sticker + result moment on the way out' },
    { id: 'atc-lighthouse', kind: 'landmark', at: [LIGHTHOUSE[0], LIGHTHOUSE[1] + 1.5], r: 2, redeemedBy: 'climb/inspect interaction + the from-the-sea landmark' },
    { id: 'atc-egg', kind: 'hidden', at: EGG, r: 1.5, redeemedBy: 'the hidden easter egg ("the first commit" tablet)' },
    // supporting, not in the eight: the room tag at the jamb (readable lore)
    { id: 'atc-plaque', kind: 'lore', at: PLAQUE, r: 1.2, redeemedBy: 'the 305 room-tag read' },
  ]
}
