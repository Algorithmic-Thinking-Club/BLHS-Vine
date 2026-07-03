// THE CENTRAL ISLAND'S LANDFORM — authored data, no art (THE-PATH 2.0). Single source of
// truth for the sail-scale vista (the offline base bake reads this via its python mirror
// in scripts/bake_island.py — KEEP THE TWO IN SYNC) and, later, the walk-scale places.
//
// Shape spec (Ash, 2026-07-02, after the tile-field round was rejected): most of the
// island is LIGHT elevation — relatively flat, never chunky — and THE VOLCANO alone rises
// drastically as the cone. The island reads as ONE painted mass in bon3's language (dark
// teal-green jungle, sunlit olive tops, peach sand events, red-brown rock), sitting on a
// vast, mostly-ocean map.

export const CX = 100, CY = 100 // island anchor in tile space (the 200x200 map centers here)
export const COAST_R = 32 // mean coast radius (tile diagonals) — the island reads BIG
// the volcano site: dead CENTER (Ash 2026-07-02 — unlike bon3's offset peak, our island
// is center-grounded: the massif rises from the middle and the land masses around it)
export const CONE = { x: CX, y: CY, r: 11 }
export const LIFT_MAX = 760 // screen px at e=1 — the summit rim rides ~500px over the
// flats at world scale; the exponential curve keeps most of the base low

// ---- the coastline: BON3'S OWN SKELETON (Ash: "get bon3's skeleton in") — the locked
// concept's land mask traced into a per-azimuth radius profile (scripts, saved to
// public/art/island/skeleton.json), protrusions softened, scaled to mean R38. The
// harmonics below are only the fallback until the JSON loads.
type Skeleton = { bins: number; radius: number[]; sand: number[] }
let SKEL: Skeleton | null = null
export function setSkeleton(d: Skeleton) { SKEL = d }
function skelAt(arr: number[], bins: number, theta: number) {
  const u = ((theta + Math.PI) / (2 * Math.PI)) * bins
  const i = Math.floor(u) % bins, j = (i + 1) % bins, f = u - Math.floor(u)
  return arr[i] * (1 - f) + arr[j] * f
}
export function coastR(theta: number) {
  // the traced profile keeps bon3's geological wander but with its arms pulled toward
  // the mean (Ash: protrusions too extreme; center-ground the mass, keep it irregular)
  if (SKEL) {
    const raw = skelAt(SKEL.radius, SKEL.bins, theta)
    return Math.max(27, 38 + (raw - 38) * 0.55)
  }
  return COAST_R * (
    1
    + 0.11 * Math.sin(theta * 2 + 0.7)
    + 0.075 * Math.sin(theta * 3 - 1.9)
    + 0.05 * Math.sin(theta * 5 + 3.3)
    + 0.028 * Math.sin(theta * 8 + 0.9)
  )
}
// bon3's sand distribution per azimuth (0..1): where its coast wears the peach fringe
export function sandK(theta: number) {
  if (SKEL) return skelAt(SKEL.sand, SKEL.bins, theta)
  return 0.4
}

// signed distance PAST the coast (+ inland, - out to sea), in tile diagonals — the ocean
// module's ds convention. Radial approximation; exact enough at vista scale.
export function coastDs(tx: number, ty: number) {
  const dx = tx - CX, dy = ty - CY
  const d = Math.sqrt(dx * dx + dy * dy)
  return coastR(Math.atan2(dy, dx)) - d
}

// ---- the ARRIVAL LAGOON + the south cove: azimuth windows where the shallow shelf
// widens and the coast wears sand instead of cliff. Everything else is cliff coast with
// deep water running nearly to the rock (law #2).
// NOTE: angles live in TILE space; the SCREEN compass sits 45° off — screen-east (frame
// right, the intro's arrival side) = tile theta -PI/4.
const LAGOON = { c: -0.55, w: 0.95 } // screen-E/SE window: the arrival lagoon
const COVE = { c: 0.79, w: 0.45 }    // screen-south pocket
function azWin(theta: number, c: number, w: number) {
  // smooth 0..1 window on the circle: 1 at theta = c, 0 beyond +-w
  const d = Math.abs(((theta - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  const k = Math.max(0, 1 - d / w)
  return k * k * (3 - 2 * k)
}
export function lagoonK(tx: number, ty: number) {
  const th = Math.atan2(ty - CY, tx - CX)
  return Math.max(azWin(th, LAGOON.c, LAGOON.w), 0.7 * azWin(th, COVE.c, COVE.w))
}

// how wide the underwater shelf reads at this azimuth: wide mosaic inside the lagoon
// windows, a tight collar under the cliff coasts
export function shelfW(tx: number, ty: number) {
  return 3.5 + 12 * lagoonK(tx, ty)
}

// ---- ELEVATION, e in [0,1]: a LOW rolling island body + THE CONE's drastic rise.
import { vnoise } from '../ocean'
// the BODY-only field (what the base bake renders — the cone term reduced to a gentle
// pedestal; the painted cone hero piece carries the real mountain). Props/stamps sit at
// THIS height so they land on the painted ground. MIRRORS scripts/bake_island.py.
export function elevBody(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds <= 0) return 0
  const rim = Math.min(1, ds / 5)
  const dxc = tx - CONE.x, dyc = ty - CONE.y
  const dCone = Math.sqrt(dxc * dxc + dyc * dyc)
  const toCone = Math.max(0, 1 - dCone / (COAST_R * 1.1))
  let e = rim * (0.1 + 0.16 * toCone)
  e += 0.035 * (vnoise(tx / 16 + 3, ty / 16 + 8) - 0.5) * rim
  const k = Math.max(0, 1 - dCone / (CONE.r * 2.1))
  e += 0.14 * Math.pow(k, 1.6)
  return Math.max(0, Math.min(1, e))
}
// THE MASSIF (Ash 2026-07-03, binding): the volcano IS the island's body. Its base
// covers ~85% of the interior — only the sand fringe and a thin flat apron stay outside
// it. From the base edge the ground rises EXTREMELY gently, then curves upward like an
// exponential graph into the summit cone at the island's center. It is built IN the iso
// tile engine: every tile carries its own height, so the step between neighbors is
// sub-pixel at the base and grows into real stacked rock walls near the cone — smooth
// variable terracing, never farm benches, never a pasted hero image.
const K_EXP = 6.2 // the exponential's sharpness — THE J CURVE: a near-flat skirt for
// half the radius, then the sweep rockets into a tall NARROW summit (Ash's iconic read)
export const CRATER_R = 2.2
export function massifR(theta: number) {
  // the base reaches almost to the coast: only the beach fringe + a flat apron survive
  // (wider on the sandy arrival azimuths, tight under the future cliff coasts)
  const wob = vnoise(Math.cos(theta) * 1.8 + 11, Math.sin(theta) * 1.8 + 6) - 0.5
  const m = 4.2 + 3.4 * sandK(theta) + 2.6 * wob
  return Math.max(16, coastR(theta) - Math.max(2.5, m))
}
export type ElevInfo = { e: number; u: number; r: number }
export function elevInfo(tx: number, ty: number): ElevInfo {
  const ds = coastDs(tx, ty)
  if (ds <= 0) return { e: 0, u: 0, r: 0 }
  const dxc = tx - CONE.x, dyc = ty - CONE.y
  const d = Math.sqrt(dxc * dxc + dyc * dyc)
  const th = Math.atan2(dyc, dxc)
  const R = massifR(th)
  if (d >= R) return { e: 0, u: 0, r: 0 }
  let u = 1 - d / R // 0 at the base edge, 1 at the cone site
  // RADIAL SPOKES (Ash's sketch, 2026-07-03): ridgelines and gullies fan from the
  // summit to the base ring — the volcano's whole surface organizes radially, the way
  // real drainage carves a cone. ~9 spokes, wandering outward, strongest mid-flank,
  // converging clean at the rim. r in [-1 ridge crest .. +1 gully floor]... (sign:
  // positive sin = crest). Contour terraces break along these, so nothing rings.
  const wob = vnoise(Math.cos(th) * 3.1 + 15, Math.sin(th) * 3.1 + 9) - 0.5
  const drift = (vnoise(tx / 11 + 5, ty / 11 + 3) - 0.5) * 1.8
  const spoke = Math.sin(th * 9 + wob * 3.4 + drift)
  const bar = (0.35 + 0.65 * Math.abs(spoke)) * spoke // sharpened crests
  const rg2 = vnoise(Math.cos(th) * 5.4 + 13, Math.sin(th) * 5.4 + 2) - 0.5
  const swellK = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - Math.max(0, (u - 0.82) / 0.18))
  u += (0.055 * bar + 0.025 * rg2) * Math.max(0, swellK)
  u = Math.max(0, Math.min(1, u))
  let e = (Math.exp(K_EXP * u) - 1) / (Math.exp(K_EXP) - 1)
  // the crater bowl caps the cone: deep enough that the exponential's center sinks
  // well below the rim ring — the RIM is the summit, never an apex chimney
  if (d < CRATER_R) e -= 0.45 * Math.pow(1 - d / CRATER_R, 0.8)
  // fine landform grain so the low skirt rolls instead of laying mathematically flat
  e += 0.018 * (vnoise(tx / 9 + 3, ty / 9 + 8) - 0.5) * Math.min(1, u * 9) * (1 - u * 0.8)
  const rim = Math.min(1, ds / 4) // the coast flats ease up from the water
  return { e: Math.max(0, Math.min(1, e * rim)), u, r: bar }
}
export function elevAt(tx: number, ty: number) { return elevInfo(tx, ty).e }
// walkability at vista/walk scale: the mountain blocks where its slope turns to wall
export function slopeAt(tx: number, ty: number) {
  const d = 0.5
  const gx = elevAt(tx + d, ty) - elevAt(tx - d, ty)
  const gy = elevAt(tx, ty + d) - elevAt(tx, ty - d)
  return Math.sqrt(gx * gx + gy * gy) / (2 * d)
}

// ---- the TWO LAVA FLOWS: polylines from the cone's flanks (where the carved heads sit)
// down to the coast. The heads pour down these; the base bake darkens a basalt channel
// around them; the glowing cores pulse as a live layer.
export const LAVA: [number, number][][] = [
  // west flank head -> SW delta at the coast
  [[CONE.x - 4, CONE.y + 3], [CX - 15, CY + 5], [CX - 22, CY + 11], [CX - 28, CY + 18]],
  // east flank head -> SE delta (toward the lagoon's south edge)
  [[CONE.x + 5, CONE.y + 4], [CX + 9, CY + 10], [CX + 15, CY + 17], [CX + 19, CY + 25]],
]
export function lavaDist(tx: number, ty: number) {
  let best = 99
  for (const line of LAVA) {
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
  }
  return best
}

// ---- the HARBOR (east arrival, GAME-DESIGN §3.2): where the intro docks. The pier site
// sits on the lagoon's inner shore; the boat channel runs out through the shelf.
export const HARBOR = { x: CX + Math.cos(-0.5) * (COAST_R * 1.02), y: CY + Math.sin(-0.5) * (COAST_R * 1.02) }
export const CHANNEL = { theta: -0.5, w: 1.6 } // a dark cut through the lagoon mosaic
