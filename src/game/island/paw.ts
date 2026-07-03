// THE PANTHER PAW — the central island's geometry (build 4, phase A).
//
// One broad metacarpal pad + four toe islets at true print proportion + four claw islets
// off the toe tips (bare rock). Authored in SCREEN units (u = tx-ty, w = (tx+ty-S0)/2,
// one unit = 32 screen px) so the paw reads as a paw in the projection the player sees.
//
// COAST DESIGN (Ash steer 2026-07-02: "the beach needs to surround more of the island,
// but obviously realistic have some cut throughs"): sand rings MOST of the shoreline now;
// the designed events are the CLIFF cut-throughs (the west run, the NW headland, the NE
// point, a rocky wedge between the two east/south beaches) plus the toes' rocky outer
// edges and the bare claws.
//
// THE LAGOON FIELD (law #2 — the halo is dead): shallows are designed SHAPES, not a
// distance glow. One big east arrival lagoon, a south cove apron, warm straits between
// the pad's crown and the toes — and everywhere else the deep runs nearly to the rock.
// `lagReachTheta/lagReachUW` say how far the shallow apron extends off each stretch of
// coast; the renderer's depth field + reef surf both read the SAME field.

export const MAP = 1024
const S0 = MAP

const bump = (td: number, c: number, wd: number, amp: number) => {
  const d = ((td - c + 180) % 360 + 360) % 360 - 180
  return amp * Math.exp(-(d * d) / (2 * wd * wd))
}
const hash2 = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
export function vnoise2(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const uu = fx * fx * (3 - 2 * fx), vv = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1)
  return a * (1 - uu) * (1 - vv) + b * uu * (1 - vv) + c * (1 - uu) * vv + d * uu * vv
}
export const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }

export const uOf = (tx: number, ty: number) => tx - ty
export const wOf = (tx: number, ty: number) => (tx + ty - S0) / 2
export const txOf = (u: number, w: number) => (S0 + 2 * w + u) / 2
export const tyOf = (u: number, w: number) => (S0 + 2 * w - u) / 2

// ---- the PAD ----
const PAD_R = 34
const PAD_LOBES: [number, number, number][] = [
  [90.0, 30.0, -5.0],   // flattened crown (the toes arc close over it)
  [238.0, 12.0, 3.5], [270.0, 12.0, 4.5], [302.0, 12.0, 3.5], // heel lobes
]
const PAD_BAYS: [number, number, number][] = [
  [315.0, 22.0, -5.5], // the EAST ARRIVAL BAY (the intro's landfall)
  [270.0, 8.0, -3.0],  // the south cove
]
const PAD_HARM: [number, number, number][] = [
  [5, 1.4, 2.9], [7, 1.0, 5.1], [11, 0.7, 1.6], [13, 0.5, 4.2],
]

// ---- the TOES: [arc angle deg, center dist, radius, radial elongation] ----
const TOES: [number, number, number, number][] = [
  [146.0, 44.0, 8.0, 0.20],
  [112.0, 47.5, 9.5, 0.22],
  [78.0, 47.0, 9.0, 0.22],
  [46.0, 43.5, 7.5, 0.20],
]
const TOE_HARM: [number, number, number][] = [[3, 0.5, 1.1], [5, 0.35, 3.7], [8, 0.22, 2.2]]

// ---- the CLAWS: bare-rock islets off each toe tip (slightly skewed off-axis) ----
const CLAWS: [number, number, number][] = TOES.map(([ang, dist, rad], i) => [
  ang + (i % 2 === 0 ? 5.0 : -4.0),
  dist + rad + 4.6,
  2.2 + 0.55 * hash2(i * 3.1, 7),
]) as [number, number, number][]

export type Land = { id: string; du: number; dw: number; R: (theta: number) => number }
export const LANDS: Land[] = [
  {
    id: 'pad', du: 0, dw: 0,
    R: (theta) => {
      const td = ((theta * 180) / Math.PI % 360 + 360) % 360
      let r = PAD_R
      for (const [c, wd, a] of PAD_LOBES) r += bump(td, c, wd, a)
      for (const [c, wd, a] of PAD_BAYS) r += bump(td, c, wd, a)
      for (const [k, a, ph] of PAD_HARM) r += a * Math.sin(k * theta + ph)
      return r
    },
  },
  ...TOES.map(([ang, dist, rad, elong], i) => ({
    id: 'toe' + i,
    du: dist * Math.cos((ang * Math.PI) / 180),
    dw: -dist * Math.sin((ang * Math.PI) / 180),
    R: (theta: number) => {
      const a0 = (ang * Math.PI) / 180
      let r = rad * (1 + elong * Math.cos(2 * (theta - a0)))
      for (const [k, a, ph] of TOE_HARM) r += a * Math.sin(k * theta + ph + i * 2.1)
      return r
    },
  })),
  ...CLAWS.map(([ang, dist, rad], i) => ({
    id: 'claw' + i,
    du: dist * Math.cos((ang * Math.PI) / 180),
    dw: -dist * Math.sin((ang * Math.PI) / 180),
    R: (theta: number) => {
      const a0 = (ang * Math.PI) / 180
      return rad * (1 + 0.26 * Math.cos(2 * (theta - a0))) + 0.3 * Math.sin(5 * theta + i * 1.7)
    },
  })),
]
export const N_TOES = TOES.length
export const isClaw = (li: number) => li > N_TOES

/** signed distance to the nearest coast in 32px units: NEGATIVE at sea, POSITIVE inland */
export function coastDistUW(u: number, w: number) {
  let best = -1e9
  for (const L of LANDS) {
    const lu = u - L.du, lw = w - L.dw
    const d = L.R(Math.atan2(-lw, lu)) - Math.hypot(lu, lw)
    if (d > best) best = d
  }
  return best
}
export const coastDist = (tx: number, ty: number) => coastDistUW(uOf(tx, ty), wOf(tx, ty))

/** which landmass owns a point (index into LANDS; -1 = open sea) */
export function landAtUW(u: number, w: number) {
  let best = -1e9, bi = -1
  for (let i = 0; i < LANDS.length; i++) {
    const L = LANDS[i]
    const lu = u - L.du, lw = w - L.dw
    const d = L.R(Math.atan2(-lw, lu)) - Math.hypot(lu, lw)
    if (d > best) { best = d; bi = i }
  }
  return best > -6 ? bi : -1
}
function landNearestUW(u: number, w: number): [number, number] {
  const [, li, th] = coastInfoUW(u, w)
  return [li, th]
}

/** ONE scan for the render hot paths: [signed coast dist, nearest land idx, theta there] */
export function coastInfoUW(u: number, w: number): [number, number, number] {
  let best = -1e9, bi = 0, bth = 0
  for (let i = 0; i < LANDS.length; i++) {
    const L = LANDS[i]
    const lu = u - L.du, lw = w - L.dw
    const th = Math.atan2(-lw, lu)
    const d = L.R(th) - Math.hypot(lu, lw)
    if (d > best) { best = d; bi = i; bth = th }
  }
  return [best, bi, bth]
}

/** point + outward normal of a land's coast at theta */
export function coastPoint(theta: number, landIdx = 0) {
  const L = LANDS[landIdx]
  const r = L.R(theta)
  const u = L.du + r * Math.cos(theta), w = L.dw - r * Math.sin(theta)
  const e = 0.01
  const r2 = L.R(theta + e)
  const u2 = L.du + r2 * Math.cos(theta + e), w2 = L.dw - r2 * Math.sin(theta + e)
  let tx2 = u2 - u, ty2 = w2 - w
  const tl = Math.hypot(tx2, ty2); tx2 /= tl; ty2 /= tl
  let nx = ty2, ny = -tx2
  if (nx * (u - L.du) + ny * (w - L.dw) < 0) { nx = -nx; ny = -ny }
  return { u, w, nx, ny }
}

// ---- coast types: how much beach each stretch of shoreline carries (0 = rock-to-water,
// 1 = full sand apron). Sand is the DEFAULT now; cliffs are the designed events. ----
export function beachKTheta(landIdx: number, theta: number) {
  const td = ((theta * 180) / Math.PI % 360 + 360) % 360
  if (landIdx === 0) {
    let b = 0.55
    b += bump(td, 315, 26, 0.5)   // the east arrival bay
    b += bump(td, 270, 12, 0.4)   // the south cove
    b += bump(td, 45, 10, 0.25)   // the north nook
    b += bump(td, 96, 30, 0.15)   // the crown straits' warm inner beach
    b -= bump(td, 205, 22, 0.62)  // THE WEST RUN — the long cliff coast
    b -= bump(td, 155, 11, 0.55)  // NW headland
    b -= bump(td, 10, 11, 0.55)   // NE point
    b -= bump(td, 291, 7, 0.45)   // the rocky wedge between bay and cove
    return Math.min(1, Math.max(0.02, b))
  }
  if (isClaw(landIdx)) return 0.02 // bare rock
  const ang = TOES[landIdx - 1][0]
  // toes: sandy crescents facing the pad, rocky outer edges
  let b = 0.12 + bump(td, (ang + 180) % 360, 28, 0.62)
  b -= bump(td, ang, 30, 0.1)
  return Math.min(1, Math.max(0.02, b))
}
export function beachKAt(u: number, w: number) {
  const [li, th] = landNearestUW(u, w)
  return beachKTheta(li, th)
}

/** the sand apron's inland reach at a point (≈0 where the coast is rock-to-water) */
export function beachWidthAt(u: number, w: number) {
  const [li, th] = landNearestUW(u, w)
  const B = beachKTheta(li, th)
  return B < 0.2 ? 0 : (0.8 + 4.0 * B) * (li > 0 ? 0.6 : 1)
}

// ---- THE LAGOON FIELD: how far the designed shallow apron reaches off each stretch of
// coast (in units, along the outward normal). Everywhere it is small, the deep sea runs
// nearly to the shore — that is what kills the halo. ----
export function lagReachTheta(landIdx: number, theta: number) {
  const td = ((theta * 180) / Math.PI % 360 + 360) % 360
  if (landIdx === 0) {
    let r = 2.2
    // THE EAST ARRIVAL LAGOON: a compound of lobes, not one offset ring — the reef edge
    // carries its own geometry (wide off the bay, pinched at the wedge, a south bulge)
    r += bump(td, 318, 17, 17.0)
    r += bump(td, 297, 11, 10.0)
    r += bump(td, 338, 9, 8.0)
    r -= bump(td, 291, 5, 4.0)    // the pinch off the rocky wedge
    r += bump(td, 270, 12, 6.5)   // the south cove apron
    r += bump(td, 96, 55, 4.5)    // the warm straits under the toes
    r -= bump(td, 205, 24, 1.6)   // the west cliff run: deep water at the rock
    r -= bump(td, 10, 12, 1.3)    // NE point: deep at the rock
    return Math.max(0.8, r)
  }
  if (isClaw(landIdx)) return 0.8
  const ang = TOES[landIdx - 1][0]
  // toes: shallows bridge toward the pad (the straits), the outer edges drop away fast
  return Math.max(0.9, 1.1 + bump(td, (ang + 180) % 360, 40, 4.2))
}
export function lagReachUW(u: number, w: number) {
  const [li, th] = landNearestUW(u, w)
  return lagReachTheta(li, th)
}

// ---- THE RELIEF (law #3: stacked terraces, never a smooth dome) ----
// A height potential falls off from the volcano center (off-center N-NW, Moorea's
// asymmetry) and is EXTENDED outward along two ridge spines (SW + SE). Quantized into
// terrace levels with noise-wobbled thresholds; two RAMP CORRIDORS (from the east bay
// and the south cove toward the cone) bypass quantization so the island climbs smooth
// there — the walkable ways up. Cliff coasts ride a +1 rock bench so they drop to the
// sea as real walls (the SoS column-coast read).

export const VC = { u: -5, w: -11 } // the volcano's center

// THE TERRACE RINGS — designed radial shapes, the same 5-harmonic vocabulary as the
// coast itself. Quantizing a noisy potential always speckles at the contours; DESIGNED
// rings give clean chained cliff lines with deliberate asymmetry (offset centers, the
// SW + SE ridge-spine lobes at θ≈223°/295°) — the SoS hand-authored-terrace read.
type Ring = { du: number; dw: number; base: number; lobes: [number, number, number][]; harm: [number, number, number][] }
const RINGS: Ring[] = [
  { du: 3, dw: 4, base: 21, lobes: [[223, 26, 7], [295, 20, 6]], harm: [[3, 1.8, 2.1], [5, 1.2, 0.7], [7, 0.8, 4.4]] },
  { du: 1, dw: 1.5, base: 14.5, lobes: [[223, 18, 4.5], [295, 14, 3.5]], harm: [[3, 1.4, 4.2], [5, 0.9, 1.9]] },
  { du: 0.5, dw: 0, base: 9.5, lobes: [[223, 12, 2.2]], harm: [[3, 1.0, 0.8], [4, 0.7, 3.3]] },
  { du: 0, dw: 0, base: 5.8, lobes: [], harm: [[3, 0.6, 2.2], [5, 0.4, 5.1]] },
  { du: 0, dw: 0, base: 2.9, lobes: [], harm: [[3, 0.35, 1.2]] },
]
function ringR(ring: Ring, theta: number) {
  const td = ((theta * 180) / Math.PI % 360 + 360) % 360
  let r = ring.base
  for (const [c, wd, a] of ring.lobes) r += bump(td, c, wd, a)
  for (const [k, a, ph] of ring.harm) r += a * Math.sin(k * theta + ph)
  return r
}
/** how many terrace rings contain the point (0..5) */
function ringCount(u: number, w: number) {
  let q = 0
  for (const ring of RINGS) {
    const du = u - (VC.u + ring.du), dw = w - (VC.w + ring.dw)
    if (Math.hypot(du, dw) < ringR(ring, Math.atan2(-dw, du))) q++
    else break // rings nest; the first miss ends the climb
  }
  return q
}

// ramp corridors: [fromTheta on the pad coast] -> VC, each a soft lane
const LANES: { ax: number; ay: number; wd: number }[] = (() => {
  const mk = (thetaDeg: number, wd: number) => {
    const th = (thetaDeg * Math.PI) / 180
    // the lane runs from the coast point toward VC
    const r = LANDS[0].R(th)
    return { ax: r * Math.cos(th), ay: -r * Math.sin(th), wd }
  }
  return [mk(322, 2.6), mk(262, 2.4)]
})()
export function laneK(u: number, w: number) {
  let best = 0
  for (const L of LANES) {
    // distance from the segment coast-point -> VC
    const bx = VC.u - L.ax, by = VC.w - L.ay
    const len2 = bx * bx + by * by
    const t = Math.max(0, Math.min(1, ((u - L.ax) * bx + (w - L.ay) * by) / len2))
    const px = L.ax + t * bx - u, py = L.ay + t * by - w
    const dd = Math.hypot(px, py)
    best = Math.max(best, Math.exp(-(dd * dd) / (2 * L.wd * L.wd)))
  }
  return best
}

/** elevation in lift units (floats on ramps, whole steps elsewhere); sea/beach = 0 */
export function elevAt(u: number, w: number, cd: number, li: number, th: number) {
  if (cd <= 0) return 0
  const B = beachKTheta(li, th)
  const clawL = isClaw(li)
  const rockBench = (clawL || B < 0.2) ? 1 : 0 // cliff coasts ride a rock bench
  if (li > 0) {
    // toes: a single low bench inland (their own small relief), claws two steps
    const hb = smooth01((cd - 2.2) / 2.4)
    return Math.max(cd > 0.4 ? rockBench : 0, clawL ? Math.round(hb * 2) : Math.round(hb))
  }
  // the coast plain: terraces stay clear of the beaches whatever the rings say
  const qMax = Math.floor(smooth01((cd - 4.2) / 5.5) * 6)
  const q = Math.min(ringCount(u, w), qMax)
  // ramp corridors melt the steps into a climbable slope toward the cone
  const lk = laneK(u, w)
  let lev: number = q
  if (lk > 0.02) {
    const dVC = Math.hypot(u - VC.u, w - VC.w)
    const cont = Math.min(qMax, 5 * smooth01((26 - dVC) / 21))
    lev = q * (1 - lk) + cont * lk
  }
  return Math.max(cd > 0.4 ? rockBench : 0, lev)
}
export type PawCell = 'sea' | 'wet' | 'sand' | 'grass' | 'jungle' | 'rock'
export function pawCell(tx: number, ty: number): PawCell {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const cd = coastDistUW(u, w)
  if (cd < 0) return 'sea'
  const [li, th] = landNearestUW(u, w)
  const B = beachKTheta(li, th)
  if (isClaw(li)) return 'rock'
  if (B < 0.2) return cd < 2.4 ? 'rock' : 'jungle' // cliff coasts: rock shelf to the water
  const bw = (0.8 + 4.0 * B) * (li > 0 ? 0.6 : 1)
  if (cd < 1.2) return 'wet'
  if (cd < bw) return 'sand'
  if (cd < bw + 1.6) return 'grass'
  return 'jungle'
}
