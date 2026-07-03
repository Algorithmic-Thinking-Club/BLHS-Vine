// THE PANTHER PAW — the central island's geometry (build 4, phase 2).
//
// One broad metacarpal pad + four toe islets at true print proportion (each toe ~1/4 the
// pad's width, arced close over a flattened crown, the two middle toes riding highest —
// "not too small nor too big", Ash). Authored in SCREEN units (u = tx-ty, w = (tx+ty-S0)/2,
// one unit = 32 screen px) so the paw reads as a paw in the projection the player sees.
// Coasts have TYPES: the east arrival bay and the south cove carry real sand aprons, toe
// notches face the pad, and the rest of the shoreline stays green-to-water (the reference
// islands' law: beaches are events, not a ring).

export const MAP = 384
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
]

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
function landNearestUW(u: number, w: number) {
  let best = -1e9, bi = 0
  for (let i = 0; i < LANDS.length; i++) {
    const L = LANDS[i]
    const lu = u - L.du, lw = w - L.dw
    const d = L.R(Math.atan2(-lw, lu)) - Math.hypot(lu, lw)
    if (d > best) { best = d; bi = i }
  }
  return bi
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

// ---- coast types: how much beach each stretch of shoreline carries (0 = green-to-water,
// 1 = full sand apron) ----
export function beachKTheta(landIdx: number, theta: number) {
  const td = ((theta * 180) / Math.PI % 360 + 360) % 360
  if (landIdx === 0) {
    let b = 0.14
    b += bump(td, 315, 24, 0.9)  // the east arrival bay
    b += bump(td, 270, 10, 0.65) // the south cove
    b += bump(td, 45, 9, 0.3)    // a small north nook
    return Math.min(1, b)
  }
  const ang = TOES[landIdx - 1][0]
  return Math.min(1, 0.12 + bump(td, (ang + 180) % 360, 24, 0.55)) // pad-facing notch
}
export function beachKAt(u: number, w: number) {
  const li = landNearestUW(u, w)
  const L = LANDS[li]
  return beachKTheta(li, Math.atan2(-(w - L.dw), u - L.du))
}

/** the sand apron's inland reach at a point (0 where the coast is green-to-water) */
export function beachWidthAt(u: number, w: number) {
  const B = beachKAt(u, w)
  const li = landNearestUW(u, w)
  return B < 0.22 ? 0 : (1.0 + 4.6 * B) * (li > 0 ? 0.6 : 1)
}

// ---- phase-2a land cells (elevation, the volcano and the jungle plan arrive in 2b/2c) ----
export type PawCell = 'sea' | 'wet' | 'sand' | 'grass' | 'jungle'
export function pawCell(tx: number, ty: number): PawCell {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const cd = coastDistUW(u, w)
  if (cd < 0) return 'sea'
  const bw = beachWidthAt(u, w)
  if (bw > 0 && cd < 1.2) return 'wet'
  if (bw > 0 && cd < bw) return 'sand'
  if (bw > 0 && cd < bw + 1.6) return 'grass'
  return 'jungle'
}
