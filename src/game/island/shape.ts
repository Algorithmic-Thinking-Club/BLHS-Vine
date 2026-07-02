// THE CENTRAL ISLAND'S GEOMETRY — every field the renderer needs, as pure math (no pixi).
//
// THE PAW (Ash's steer, 2026-07-02): the Central Island is a PAW-PRINT archipelago — the big
// metacarpal PAD carrying the whole game hub, and FOUR TOE islets arcing above it across
// shallow sailing channels. Up close it reads as a natural volcanic island cluster; from the
// map view (and the I-8 pull-out) it snaps into the BLHS panther paw. Validated offline:
// scripts/_archive/island_paw_proto.py renders these exact coasts.
//
// THE MOUNTAIN: this is a mountainous tropical VOLCANIC island — the central peak is an
// active volcano with a crater blowhole at the summit; the carved panther head + falls take
// its south face (GAME-DESIGN §3.2); secondary hills and ridges roll across the whole pad.
//
// Everything is authored in SCREEN-SPACE units (u = tx-ty, w = (tx+ty-S0)/2; one unit = 32
// screen px) so shapes are judged in the projection the player actually sees.

export const MAP_COLS = 384, MAP_ROWS = 384
export const ISLE_CX = 192, ISLE_CY = 192 // tile-space center of the pad -> (d=0, s=384)
const S0 = ISLE_CX + ISLE_CY

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
const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }

// ---- the PAD coast ----
const PAD_R = 44
// slightly flattened crown, three plantar lobes along the bottom edge (the paw-pad read)
const PAD_LOBES: [number, number, number][] = [
  [90.0, 26.0, -5.0], [238.0, 13.0, 6.0], [270.0, 13.0, 7.0], [302.0, 13.0, 6.0],
]
// the four port coves, one per diagonal quarter (piers run the true iso diagonals):
// NE = "north port", SE = "east port" (the intro arrival), SW = "south", NW = "west"
export const PORT_THETA = { north: 45, east: 315, south: 225, west: 135 } as const
const PAD_COVES: [number, number, number][] = [
  [45.0, 10.0, -6.0], [315.0, 10.0, -7.0], [225.0, 10.0, -6.0], [135.0, 10.0, -6.0],
]
const PAD_HARM: [number, number, number][] = [
  [5, 1.9, 2.9], [7, 1.5, 5.1], [11, 1.0, 1.6], [13, 0.7, 4.2],
]

// ---- the TOES: [arc angle deg, center dist, radius, radial elongation] ----
const TOES: [number, number, number, number][] = [
  [150.0, 60.0, 10.8, 0.16],
  [113.0, 65.0, 13.0, 0.20],
  [67.0, 65.0, 13.0, 0.20],
  [30.0, 60.0, 10.8, 0.16],
]
const TOE_HARM: [number, number, number][] = [[3, 1.2, 1.1], [5, 0.9, 3.7], [7, 0.6, 0.4]]

export type Land = { id: string; du: number; dw: number; R: (theta: number) => number }
export const LANDS: Land[] = [
  {
    id: 'pad', du: 0, dw: 0,
    R: (theta) => {
      const td = ((theta * 180) / Math.PI % 360 + 360) % 360
      let r = PAD_R
      for (const [c, wd, a] of PAD_LOBES) r += bump(td, c, wd, a)
      for (const [c, wd, a] of PAD_COVES) r += bump(td, c, wd, a)
      for (const [k, a, ph] of PAD_HARM) r += a * Math.sin(k * theta + ph)
      return r
    },
  },
  ...TOES.map(([ang, dist, rad, elong], i) => ({
    id: 'toe' + i,
    du: dist * Math.cos((ang * Math.PI) / 180),
    dw: -dist * Math.sin((ang * Math.PI) / 180),
    R: (theta: number) => {
      let r = rad * (1 + elong * Math.cos(2 * (theta - (ang * Math.PI) / 180)))
      for (const [k, a, ph] of TOE_HARM) r += a * Math.sin(k * theta + ph + i * 2.1)
      return r
    },
  })),
]

// tile <-> screen-space island coords (pad-centered)
export const uOf = (tx: number, ty: number) => tx - ty
export const wOf = (tx: number, ty: number) => (tx + ty - S0) / 2
export const txOf = (u: number, w: number) => (S0 + 2 * w + u) / 2
export const tyOf = (u: number, w: number) => (S0 + 2 * w - u) / 2

/** signed radial distance to the nearest coast in 32px units: NEGATIVE at sea, POSITIVE
 *  inland (the beach's "ds onto land" convention), over ALL landmasses. */
export function coastDistUW(u: number, w: number) {
  let best = -1e9
  for (const L of LANDS) {
    const lu = u - L.du, lw = w - L.dw
    const r = Math.hypot(lu, lw)
    const d = L.R(Math.atan2(-lw, lu)) - r
    if (d > best) best = d
  }
  return best
}
export const coastDist = (tx: number, ty: number) => coastDistUW(uOf(tx, ty), wOf(tx, ty))

/** which landmass owns a point (index into LANDS; -1 = open sea beyond every coast) */
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

/** point + outward normal of a land's coast at theta (SCREEN-SPACE units, pad-centered) */
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

// ---- THE VOLCANO + the hill country (elevation as screen-px lift) ----
// The cone rises just north of the pad's center; its summit is an active CRATER (the
// blowhole — a rim ring with a sunken vent). The carved head + falls take the south face.
// Secondary hills and two shoulder ridges keep the rest of the pad rolling, never flat.
const CONE = { u: 0, w: -6, sig: 13.5, amp: 232 }
const CRATER = { sig: 4.2, amp: 88 } // sunk out of the cone's top -> the rim reads as a ring
const RIDGES = [
  { u: -14, w: -16, sig: 8.5, amp: 60 },  // WNW shoulder
  { u: 12, w: -14, sig: 7.5, amp: 54 },   // ENE shoulder
]
const HILLS = [
  { u: -26, w: 8, sig: 8, amp: 58 },
  { u: 20, w: 14, sig: 7, amp: 48 },
  { u: -7, w: 27, sig: 5.5, amp: 34 },
  { u: 28, w: -7, sig: 8, amp: 56 },
  { u: -32, w: -13, sig: 7, amp: 48 },
]
const TOE_AMP = [36, 50, 46, 34]

const gau = (u: number, w: number, o: { u: number; w: number; sig: number; amp: number }) => {
  const du = u - o.u, dw = w - o.w
  return o.amp * Math.exp(-(du * du + dw * dw) / (2 * o.sig * o.sig))
}

export function isleLiftUW(u: number, w: number) {
  const cd = coastDistUW(u, w)
  if (cd <= 0) return 0
  const li = landAtUW(u, w)
  const gate = smooth01((cd - 2) / 8)
  let lift = 3.5 * smooth01(cd / 4) // every shore's swash berm
  if (li > 0) {
    // a toe islet: one worn hill under jungle
    const L = LANDS[li]
    const q = smooth01(cd / (TOES[li - 1][2] * 0.85))
    lift += gate * (TOE_AMP[li - 1] * Math.pow(q, 1.2)
      + 10 * (vnoise2((u - L.du) / 7 + li * 9, (w - L.dw) / 7) - 0.5) * 2 * q)
    return lift
  }
  // the pad: volcano (minus crater) + shoulders + hills + two octaves of rolling ground
  let m = gau(u, w, { ...CONE }) - gau(u, w, { u: CONE.u, w: CONE.w, sig: CRATER.sig, amp: CRATER.amp })
  for (const r of RIDGES) m += gau(u, w, r)
  for (const h of HILLS) m += gau(u, w, h)
  m += 15 * (vnoise2(u / 11 + 31, w / 11 + 7) - 0.5) * 2
  m += 7 * (vnoise2(u / 4.6 + 12, w / 4.6 + 27) - 0.5) * 2
  lift += gate * Math.max(0, m)
  return lift
}
export const isleLift = (tx: number, ty: number) => isleLiftUW(uOf(tx, ty), wOf(tx, ty))

// ---- fresh water: the falls pool under the head (the volcano's south face) + the river ----
export const POOL = { u: 0, w: 13.5, r: 4.5 }
const RIVER: [number, number][] = [
  [0, 16.5], [1.5, 21], [4, 26], [7, 31], [9.5, 36], [11.5, 41], [12.5, 47],
]

function segDist(u: number, w: number, pts: [number, number][]) {
  let best = 1e9
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
    let t = l2 ? ((u - ax) * dx + (w - ay) * dy) / l2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(u - (ax + dx * t), w - (ay + dy * t))
    if (d < best) best = d
  }
  return best
}

/** distance (32px units) to fresh water (pool + river centerline); river widens downstream */
export function freshDist(tx: number, ty: number) {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const dPool = Math.hypot(u - POOL.u, w - POOL.w) - POOL.r
  const dRiv = segDist(u, w, RIVER) - (0.9 + 0.7 * smooth01((w - 16.5) / 28))
  return Math.min(dPool, dRiv)
}

// ---- paths: a worn trail from every port climbing to the falls pool ----
export const PATHS: Record<keyof typeof PORT_THETA, [number, number][]> = {
  north: [[26, -26], [22, -18], [19, -10], [17.5, -2], [15, 6], [10, 11], [5, 13]],
  east: [[27, 27], [22, 23], [17, 19], [12, 16], [7.5, 14.3], [4.6, 13.6]],
  south: [[-26, 27], [-20, 23], [-15, 19], [-10, 16], [-5.2, 14.2]],
  west: [[-26, -26], [-23, -18], [-20.5, -10], [-19, -2], [-16, 6], [-11, 11], [-5.5, 13]],
}

export function pathDist(tx: number, ty: number) {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  let best = 1e9
  for (const k of Object.keys(PATHS) as (keyof typeof PATHS)[]) {
    const d = segDist(u, w, PATHS[k])
    if (d < best) best = d
  }
  return best
}

// ---- terrain classification ----
export type IsleCell = 'sea' | 'wet' | 'sand' | 'grass' | 'jungle' | 'rock' | 'fresh' | 'bank'
export function isleCell(tx: number, ty: number): IsleCell {
  const cd = coastDist(tx, ty)
  if (cd < 0) return 'sea'
  if (cd < 1.5) return 'wet'
  if (cd > 2.5) {
    const f = freshDist(tx, ty)
    if (f < 0) return 'fresh'
    if (f < 0.9) return 'bank'
  }
  if (cd < 4) return 'sand'
  if (cd < 6.5) return 'grass'
  const lift = isleLift(tx, ty)
  if (lift > 150) return 'rock' // the volcano's bare upper cone + crater rim
  return 'jungle'
}

/** lift change per s-row — steep = cliffy = unwalkable */
export function isleSlope(tx: number, ty: number) {
  return Math.abs(isleLift(tx + 0.5, ty + 0.5) - isleLift(tx - 0.5, ty - 0.5))
}
