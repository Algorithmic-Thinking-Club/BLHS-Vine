// THE ATC ISLAND'S LAYOUT MECHANICS — ⚠ LAYOUT ONLY (the hub-mechanics
// contract). Pure DATA + pure functions derived from atc-layout/atc-terrain.
// NO rendering, NO gameplay logic — the geometric TRUTH future systems consume.
//
// THE SPLIT (spec §8, Ash 2026-07-16): the classroom is its own INTERIOR map
// (`atc-room`). The EXTERIOR keeps the sail/walk sockets: the berth, the
// TERMINAL screen-door seam (the map shift), the lighthouse, the plaque, the
// egg. The interior sockets (atc-host, atc-activity, atc-learn-1..3,
// atc-reward) move to the atc-room map — the ledger in the spec tracks both.

import { coastDs, CORRIDOR, KNOLL, cragD } from './atc-terrain'
import {
  dockAt, propBlocked, LIGHTHOUSE, EGG, DOCK, ANNEX,
  TERMINAL, TERMINAL_SEAM, FORECOURT, JUNCTION,
} from './atc-layout'

// ---- WALKMAP: the single collision truth for the ATC exterior map.
export function isWalkable(tx: number, ty: number): boolean {
  const d = dockAt(Math.round(tx), Math.round(ty))
  if (d) return d.walk
  if (coastDs(tx, ty) <= 0) return false      // open water
  if (propBlocked(tx, ty)) return false       // monument, fragments, tower, annex
  if (cragD(tx, ty) < 1.9) return false       // the crag's bare crown
  return true
}

// ---- ZONES (spec §9): coarse named regions for event systems.
export type ZoneId =
  | 'A1-dock' | 'A2-path' | 'A3-terminal-court' | 'A5-lighthouse'
  | 'A6-annex' | 'A7-ring' | 'sea'

export function zoneAt(tx: number, ty: number): ZoneId {
  const rtx = Math.round(tx), rty = Math.round(ty)
  if (coastDs(tx, ty) <= 0 && !dockAt(rtx, rty)) return 'sea'
  if (dockAt(rtx, rty) || Math.hypot(tx - DOCK.root[0], ty - DOCK.root[1]) < 4) return 'A1-dock'
  if (tx >= FORECOURT.x0 - 2 && tx <= FORECOURT.x1 + 2 && ty >= TERMINAL[1] - 2 && ty <= FORECOURT.y1 + 2) return 'A3-terminal-court'
  const onCorridor = tx >= CORRIDOR.x0 && tx <= CORRIDOR.x1 && ty >= CORRIDOR.y0 && ty <= CORRIDOR.y1
  if (onCorridor || Math.hypot(tx - JUNCTION[0], ty - JUNCTION[1]) < 4) return 'A2-path'
  if (Math.hypot(tx - KNOLL.x, ty - KNOLL.y) < KNOLL.r + 2) return 'A5-lighthouse'
  if (Math.hypot(tx - ANNEX.rack[0], ty - ANNEX.rack[1]) < 3.5) return 'A6-annex'
  return 'A7-ring'
}

// ---- SEAMS: scene transitions.
export type Seam = { id: string; to: string; at: [number, number]; radius: number }
export function getSeams(): Seam[] {
  return [
    // boarding at the pier's end = the ocean overworld (sail home to the hub)
    { id: 'atc-berth', to: 'ocean', at: [DOCK.berth[0], DOCK.berth[1]], radius: 1.8 },
    // THE SCREEN: walking into the Terminal's glowing doorway = the atc-room
    // interior (flash + scanline wipe — the map shift, spec §9)
    { id: 'atc-door', to: 'atc-room', at: [TERMINAL_SEAM[0], TERMINAL_SEAM[1]], radius: 1.6 },
  ]
}

// ---- POIs: the EXTERIOR's sockets (the interior's live in atc-room).
export type Poi = {
  id: string
  kind: 'landmark' | 'lore' | 'ritual' | 'vista' | 'hidden'
  at: [number, number]
  r: number
  redeemedBy: string
}
export function getPois(): Poi[] {
  return [
    { id: 'atc-plaque', kind: 'lore', at: [TERMINAL[0] - 2, TERMINAL[1] + 2], r: 1.4, redeemedBy: 'the 305 room-tag read on the monument frame' },
    { id: 'atc-junction', kind: 'lore', at: [JUNCTION[0] + 1, JUNCTION[1]], r: 1.5, redeemedBy: 'the network story: three cables, three nodes' },
    { id: 'atc-lighthouse', kind: 'landmark', at: [LIGHTHOUSE[0], LIGHTHOUSE[1] + 1.5], r: 2, redeemedBy: 'climb/inspect: the beacon is powered by the room' },
    { id: 'atc-egg', kind: 'hidden', at: EGG, r: 1.5, redeemedBy: 'the half-buried floppy disk (the hidden easter egg)' },
  ]
}
