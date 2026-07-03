// THE ISLAND MAP's COAST + DEPTH FIELD (2026-07-02 restart, build 3).
// The sea RENDERING is the beach's, verbatim — this file only answers where the coast is and
// how far any tile sits from it. THE ISLAND IS A PANTHER PAW (Ash, locked): one big
// metacarpal pad + four separated toe islands, the way a real print reads, AUTHORED IN
// SCREEN SPACE so the paw is a paw on screen, not a squashed rumor of one. The web between
// toes and pad is the designed lagoon (bright ramp stops live there and in the arrival
// shelf, nowhere else); everywhere else the coast plunges like the reference drop-offs.

export const MAP = 256
export const HW = 32, HH = 16

export const ABYSS = 0x073442
// the beach's proven depth ramp, verbatim
export const W_RAMP: [number, number][] = [
  [0.0, 0xa8e2d2], [0.09, 0x8ed8c6], [0.14, 0x4dbcb2], [0.24, 0x35a5a2],
  [0.38, 0x24909a], [0.54, 0x187a89], [0.68, 0x0f586c], [1.0, 0x073442],
]
export const W_BASE = [205, 235, 229]

export const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
export function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
export const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }

// ---- screen-blob coordinates ----
// U = (tx-ty)*2 and V = tx+ty are both 16 screen px per unit, so a circle in (U,V) is a
// circle on screen. The paw is drawn here; tiles convert on the way in.
export const uvOf = (tx: number, ty: number) => ({ u: (tx - ty) * 2, v: tx + ty })
export const tileOf = (u: number, v: number) => ({ x: (u / 2 + v) / 2, y: (v - u / 2) / 2 })

export type Blob = {
  u: number; v: number; rx: number; ry: number
  rough: number; seed: number; shelf: number
}
// the metacarpal pad — the volcano island itself; two bottom lobes give it the real
// print anatomy (a plain ellipse reads as a blob, not a pad)
export const PAD: Blob = { u: 0, v: 288, rx: 56, ry: 42, rough: 0.09, seed: 3, shelf: 13 }
const LOBES: Blob[] = [
  { u: -26, v: 318, rx: 24, ry: 18, rough: 0.1, seed: 61, shelf: 13 },
  { u: 24, v: 318, rx: 24, ry: 18, rough: 0.1, seed: 67, shelf: 13 },
]
// four toes over the top arc, middle pair higher — real print proportions, separated pads
export const TOES: Blob[] = [
  { u: -64, v: 228, rx: 17, ry: 15, rough: 0.07, seed: 11, shelf: 8 },
  { u: -25, v: 209, rx: 19, ry: 17, rough: 0.07, seed: 17, shelf: 8 },
  { u: 19, v: 207, rx: 19, ry: 17, rough: 0.07, seed: 23, shelf: 8 },
  { u: 60, v: 224, rx: 16, ry: 14.5, rough: 0.07, seed: 29, shelf: 8 },
]
// sea stacks: one on the arrival approach, one lone rock far NE
export const STACKS: Blob[] = [
  { u: 110, v: 336, rx: 5, ry: 4.2, rough: 0.5, seed: 37, shelf: 5 },
  { u: 66, v: 130, rx: 6, ry: 5, rough: 0.45, seed: 51, shelf: 6 },
]
export const BLOBS: Blob[] = [PAD, ...LOBES, ...TOES, ...STACKS]

// designed shallows — the only bright water on the map
const LAGOON = { u: -3, v: 242, rx: 78, ry: 30 }   // the web between toes and pad
const ARRIVE = { u: 66, v: 324, rx: 34, ry: 22 }   // the landfall shelf off the pad's SE

// organic edge wobble per blob (angle-domain harmonics, seeded)
const wob = (b: Blob, a: number) =>
  1 + b.rough * (0.55 * Math.sin(3 * a + b.seed) + 0.3 * Math.sin(5 * a + 2.1 * b.seed) + 0.18 * Math.sin(9 * a + 4.2 * b.seed))
// signed field of one blob in v-units (>0 inside)
function blobF(b: Blob, u: number, v: number) {
  const du = u - b.u, dv = v - b.v
  const a = Math.atan2(dv, du)
  const w = wob(b, a)
  const norm = Math.hypot(du / (b.rx * w), dv / (b.ry * w))
  return (1 - norm) * Math.min(b.rx, b.ry)
}
// a point on a blob's edge at angle a (for shore rings / dressing)
export function blobEdge(b: Blob, a: number) {
  const w = wob(b, a)
  return { u: b.u + Math.cos(a) * b.rx * w, v: b.v + Math.sin(a) * b.ry * w }
}

// ---- the field ----
export function landF(tx: number, ty: number) {
  const { u, v } = uvOf(tx, ty)
  let f = -Infinity
  for (const b of BLOBS) { const fb = blobF(b, u, v); if (fb > f) f = fb }
  return f
}

// depth in [0,1]: 0 at a waterline, 1 = abyss. -1 on land.
export function depAt(tx: number, ty: number): number {
  const { u, v } = uvOf(tx, ty)
  let f = -Infinity, dep = Infinity
  for (const b of BLOBS) {
    const fb = blobF(b, u, v)
    if (fb > f) f = fb
    if (fb <= 0) { const d = -fb / b.shelf; if (d < dep) dep = d }
  }
  if (f > 0) return -1
  // the lagoon web: designed plateau — turquoise, NOT the palest stops (a mint-white pool
  // read as ice at far zoom; the palest water belongs to swash inches from a shore)
  {
    const nl = Math.hypot((u - LAGOON.u) / LAGOON.rx, (v - LAGOON.v) / LAGOON.ry)
    if (nl < 1) {
      const depL = 0.11 + 0.17 * nl * nl
      dep = dep + (Math.min(dep, depL) - dep) * smooth01((1 - nl) / 0.3)
    }
  }
  // the arrival shelf
  {
    const na = Math.hypot((u - ARRIVE.u) / ARRIVE.rx, (v - ARRIVE.v) / ARRIVE.ry)
    if (na < 1) {
      const depA = 0.09 + 0.16 * na * na
      dep = dep + (Math.min(dep, depA) - dep) * smooth01((1 - na) / 0.3)
    }
  }
  return Math.min(1, dep)
}

// island ELEVATION in screen px: cliffs stand straight out of the sea (the default coast),
// then the pad climbs toward its center — the volcano's ground floor. Toes rise less.
export function liftAt(tx: number, ty: number) {
  const f = landF(tx, ty)
  if (f <= 0) return 0
  return 12 * smooth01(f / 2.5) + 22 * smooth01((f - 6) / 26)
}

// where the camera opens: on the arrival shelf, the paw across the water
const sp0 = tileOf(84, 332)
export const SPAWN = { x: sp0.x, y: sp0.y }

// surf line: breakers where the lagoon's designed shallow meets deep water (the two mouths
// beside the outer toes) — sampled along the lagoon rim, kept only where the outside plunges
export function surfLine(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let a = 0; a < Math.PI * 2; a += 0.03) {
    const u = LAGOON.u + Math.cos(a) * LAGOON.rx, v = LAGOON.v + Math.sin(a) * LAGOON.ry
    const t = tileOf(u, v)
    if (landF(t.x, t.y) > -1) continue // inside/next to land: no breaker line
    const here = depAt(t.x, t.y)
    if (here < 0 || here > 0.32) continue // the breaker stands ON the shelf lip
    const out = tileOf(u + Math.cos(a) * 6, v + Math.sin(a) * 6)
    const dOut = depAt(out.x, out.y)
    if (dOut > 0.5) pts.push(t)
  }
  return pts
}
