// THE ATC GRAPE ISLAND'S LANDFORM — authored data, no art. REBUILT 2026-07-16
// on the HUB island's terrain grammar (terrain.ts is the model; Ash's order:
// "rebuild from scratch, use the hub island as the example for the base").
//
// Same construction as the hub, smaller sibling: a per-azimuth coastline with
// real geographic contrast (arms swing hard, bays bite IN), designed sand
// windows, a cliff back-arc, LIGHT rolling land everywhere — and ONE drastic
// rise, the SUMMIT where the Terminal stands (the hub's cone grammar at
// acropolis scale). A long low peninsula runs out screen-E to the lighthouse.
//
// Mirrors terrain.ts's export semantics so the shared ocean + the eventual
// one-world merge consume this island unmodified.

import { vnoise } from '../../ocean'

export const CX = 64, CY = 64
export const GRID = 128
export const SEA_R = 60 // live sea radius; beyond it the abyss background holds

const azWin = (theta: number, c: number, w: number) => {
  const d = Math.abs(((theta - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  const k = Math.max(0, 1 - d / w)
  return k * k * (3 - 2 * k)
}

// ---- the coastline: the hub's harmonic family, tuned for THIS island's
// story. Mean R ~17 with HARD swings (the hub's read comes from contrast:
// arms and bites, never a fat blob with wiggle).
// SCREEN COMPASS (2:1 iso): screen-E = tile θ −π/4 · screen-S = +π/4 ·
// screen-W = +3π/4 · screen-N = −3π/4.
export function coastR(theta: number) {
  return 17 * (
    1
    + 0.14 * Math.sin(theta * 2 + 1.1)
    + 0.09 * Math.sin(theta * 3 - 2.2)
    + 0.05 * Math.sin(theta * 5 + 0.6)
    + 0.03 * Math.sin(theta * 8 + 2.4)
  )
    + 8 * azWin(theta, -0.05, 0.55)    // THE POINT: the long lighthouse peninsula (screen-E)
    + 3.2 * azWin(theta, 3.05, 0.7)    // the west lobe (faces the hub)
    - 3 * azWin(theta, 1.85, 0.55)     // the dock bay bites IN (screen-S/SW)
}

// where the coast wears sand (designed windows only): the dock bay + the
// point's south flank + a small NE pocket
export function sandK(theta: number) {
  return Math.max(
    azWin(theta, 1.85, 0.8),           // the dock bay's beach
    0.8 * azWin(theta, 0.55, 0.5),     // the point's south flank
    0.55 * azWin(theta, -2.05, 0.4),   // the NE pocket
  )
}

// the cliff back-arc: screen N + NW + the point's north face hold raised rock
// to the water (the hub's law — one continuous dark arc; beaches are earned)
export function cliffK(theta: number) {
  return Math.max(
    azWin(theta, -1.2, 0.85),          // the north arc (the crag prow lives here)
    azWin(theta, -2.85, 0.75),         // the NW arc
    0.85 * azWin(theta, -0.55, 0.4),   // the point's north face
  )
}

export function coastDs(tx: number, ty: number) {
  const dx = tx - CX, dy = ty - CY
  const d = Math.sqrt(dx * dx + dy * dy)
  return coastR(Math.atan2(dy, dx)) - d
}

// the shallow-shelf windows (turquoise aprons): widest in the dock bay,
// a tight collar under the cliffs — the hub's shelf grammar verbatim
export function lagoonK(tx: number, ty: number) {
  const th = Math.atan2(ty - CY, tx - CX)
  return Math.max(azWin(th, 1.85, 0.95), 0.7 * azWin(th, 0.55, 0.5))
}
export function shelfW(tx: number, ty: number) {
  const th = Math.atan2(ty - CY, tx - CX)
  return 3.5 + 5.5 * (1 - cliffK(th)) + 9 * lagoonK(tx, ty)
}

// ---- THE SUMMIT (the island's ONE drastic rise — the hub's cone grammar at
// acropolis scale): a soft round mass NW of centre. The renderer adds summit
// levels above the plateau exactly like the hub's coneLvl — a flat CROWN
// (the Terminal's court) on steep shoulders; the island body stays LOW.
export const SUMMIT = { x: 60, y: 58, r: 11 }
export function summitK(tx: number, ty: number) {
  const d = Math.hypot(tx - SUMMIT.x, ty - SUMMIT.y)
  return Math.max(0, 1 - d / SUMMIT.r)
}
// extra levels above the plateau: 0..4 — flat crown inside r*0.45, a J-curve
// shoulder outside it (long-wave wobble keeps the rings geological)
export function summitLvl(tx: number, ty: number) {
  const d = Math.hypot(tx - SUMMIT.x, ty - SUMMIT.y)
    + (vnoise(tx / 9 + 5, ty / 9 + 11) - 0.5) * 1.6
  if (d <= SUMMIT.r * 0.45) return 4
  if (d >= SUMMIT.r) return 0
  return Math.round(4 * Math.pow(1 - (d - SUMMIT.r * 0.45) / (SUMMIT.r * 0.55), 1.35))
}
// distance past the crown's edge (0 inside the flat court) — the layout's
// court/forecourt tests read this
export function plateauD(tx: number, ty: number) {
  return Math.max(0, Math.hypot(tx - SUMMIT.x, ty - SUMMIT.y) - SUMMIT.r * 0.45)
}

// ---- the LIGHTHOUSE KNOLL: the point's tip — a low green crown out at sea
export const KNOLL = { x: 88, y: 61, r: 3.2 }
// the CRAG: the dark tooth on the north cliff arc (the silhouette's anchor)
const CRAG = { x: 72, y: 47, r: 2.6 }
export function cragD(tx: number, ty: number) {
  return Math.hypot(tx - CRAG.x, ty - CRAG.y)
}
// skerries scattered off the cliff coasts (the hub's islet language)
export const ISLETS: { x: number; y: number; r: number }[] = [
  { x: 45, y: 45, r: 1.6 },
  { x: 96, y: 53, r: 1.3 },
  { x: 94, y: 70, r: 1.8 },
  { x: 39, y: 71, r: 1.2 },
]

// the walk terrace approaching the summit from the dock bay (zones/mechanics)
export const CORRIDOR = { x0: 56, y0: 66, x1: 62, y1: 72 } as const
