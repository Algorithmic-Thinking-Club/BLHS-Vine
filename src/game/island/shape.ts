// THE CENTRAL ISLAND'S GEOMETRY — fresh build (2026-07-02 restart; docs/place-specs/island-map.md).
//
// What changed from attempt 1 (and why): the references (Bora Bora / Moorea aerials, Sea of
// Stars' sailing map, Octopath's terraces — reference/island-refs/) build islands from
// STRUCTURE, not gradients. So:
//   - Coasts have TYPES: most of the shoreline is cliff dropping into dark water; sand aprons
//     exist only where designed (the east arrival bay, the south falls cove, small pockets).
//   - Elevation is QUANTIZED into terrace levels with cliff-band rims — stacked silhouettes,
//     not a smooth lift dome. The volcano sits off-center (NW), ridge spines radiate, and the
//     crater sinks into the summit.
//   - Shallow water is a DESIGNED shape: lagoon blobs with reef structure and a boat channel,
//     not a uniform glow hugging every coast. Open sea plunges dark within a few units.
//   - The four toes are SMALL satellite islets (Ash: "make them small"), mostly cliff-ringed.
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
const PAD_R = 40
// paw-pad plantar lobes along the bottom edge + a flattened crown
const PAD_LOBES: [number, number, number][] = [
  [90.0, 24.0, -4.0], [238.0, 12.0, 4.0], [270.0, 12.0, 5.0], [302.0, 12.0, 4.0],
]
// designed bays: the EAST ARRIVAL BAY (wide, holds the lagoon + pier), the SOUTH FALLS COVE
// (the river mouth), and a small north nook
const PAD_BAYS: [number, number, number][] = [
  [315.0, 24.0, -6.5], [270.0, 8.0, -3.5], [45.0, 9.0, -3.0],
]
const PAD_HARM: [number, number, number][] = [
  [5, 1.6, 2.9], [7, 1.2, 5.1], [11, 0.8, 1.6], [13, 0.55, 4.2],
]
export const PORT_THETA = { north: 45, east: 315, south: 225, west: 135 } as const

// ---- the TOES: small satellite islets [arc angle deg, center dist, radius, elongation] ----
const TOES: [number, number, number, number][] = [
  [150.0, 54.0, 6.5, 0.15],
  [114.0, 57.0, 7.5, 0.18],
  [66.0, 57.0, 7.0, 0.18],
  [30.0, 54.0, 6.0, 0.15],
]
const TOE_HARM: [number, number, number][] = [[3, 0.4, 1.1], [5, 0.3, 3.7]]

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
 *  inland, over ALL landmasses. */
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

/** nearest land regardless of distance (for coast-type lookups offshore) */
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

// ---- COAST TYPES: how much of a beach each stretch of coast is (0 = cliff wall into the
// sea, 1 = full sand apron). The references' law: beaches are EVENTS, cliffs are the rule. ----
export function beachKTheta(landIdx: number, theta: number) {
  const td = ((theta * 180) / Math.PI % 360 + 360) % 360
  if (landIdx === 0) {
    let b = 0.08
    b += bump(td, 315, 26, 0.92) // the east arrival bay: the big apron
    b += bump(td, 270, 9, 0.72)  // the south falls cove
    b += bump(td, 45, 9, 0.38)   // north nook pocket
    b += bump(td, 238, 10, 0.12) + bump(td, 302, 10, 0.12) // thin toe-lobe pockets
    return Math.min(1, b)
  }
  // a toe islet: cliff ring with one small sand notch facing the pad
  const ang = TOES[landIdx - 1][0]
  return Math.min(1, 0.10 + bump(td, (ang + 180) % 360, 20, 0.5))
}
/** beachiness at a point (via its nearest land + polar angle) */
export function beachKAt(u: number, w: number) {
  const li = landNearestUW(u, w)
  const L = LANDS[li]
  return beachKTheta(li, Math.atan2(-(w - L.dw), u - L.du))
}

// ---- THE LAGOONS: designed shallow-water shapes (turquoise aprons with reef structure),
// NOT a distance halo. Everything outside them plunges dark fast. ----
type Lagoon = { cu: number; cw: number; ax: number; ay: number; ru: number; rw: number }
function mkLagoon(thetaDeg: number, off: number, ru: number, rw: number): Lagoon {
  const cp = coastPoint((thetaDeg * Math.PI) / 180)
  // ellipse axes: long axis along the coast tangent, short along the outward normal
  return { cu: cp.u + cp.nx * off, cw: cp.w + cp.ny * off, ax: -cp.ny, ay: cp.nx, ru, rw }
}
export const LAGOONS: Lagoon[] = [
  mkLagoon(315, 5.0, 15, 9),  // the east arrival lagoon
  mkLagoon(270, 3.0, 8, 5.5), // the south cove apron
]
/** 1 deep inside a lagoon -> 0 at its rim (max over lagoons) */
export function lagoonK(u: number, w: number) {
  let best = 0
  for (const L of LAGOONS) {
    const du = u - L.cu, dw = w - L.cw
    const lon = du * L.ax + dw * L.ay, lat = du * -L.ay + dw * L.ax
    const q = Math.hypot(lon / L.ru, lat / L.rw)
    const k = 1 - q
    if (k > best) best = k
  }
  return Math.max(0, Math.min(1, best * 1.6))
}

// the boat channel: a deep cut through the east lagoon to the pier head
const ECP = coastPoint((315 * Math.PI) / 180)
export const CHANNEL: [number, number][] = [
  [ECP.u + ECP.nx * 2.5, ECP.w + ECP.ny * 2.5],
  [ECP.u + ECP.nx * 6.5 + 1.2, ECP.w + ECP.ny * 6.5],
  [ECP.u + ECP.nx * 10.5 + 2.8, ECP.w + ECP.ny * 10.5 + 0.8],
  [ECP.u + ECP.nx * 15.5 + 4.5, ECP.w + ECP.ny * 15.5 + 2.0],
]
export function channelDistUW(u: number, w: number) { return segDist(u, w, CHANNEL) }

// ---- THE VOLCANO: an off-center terraced massif. M is the mountain field (0..~1); terraces
// quantize it into levels whose rims wiggle with noise — stacked structure, not a dome. ----
export const VC = { u: -4, w: -10 }
const SPINES: { u: number; w: number; sig: number; amp: number }[] = []
for (const [dirDeg, steps] of [[205, [8, 14, 20]], [335, [8, 14, 19]]] as [number, number[]][]) {
  const dr = (dirDeg * Math.PI) / 180
  steps.forEach((t, i) => SPINES.push({
    u: VC.u + t * Math.cos(dr), w: VC.w - t * Math.sin(dr),
    sig: 4.6 - i * 0.5, amp: [0.26, 0.20, 0.14][i],
  }))
}
const HILLS = [
  { u: 14, w: 8, sig: 7, amp: 0.22 },
  { u: -20, w: 14, sig: 6.5, amp: 0.18 },
  { u: 22, w: -14, sig: 6, amp: 0.20 },
]
const gau = (u: number, w: number, o: { u: number; w: number; sig: number; amp: number }) => {
  const du = u - o.u, dw = w - o.w
  return o.amp * Math.exp(-(du * du + dw * dw) / (2 * o.sig * o.sig))
}
function mountainM(u: number, w: number) {
  const du = u - VC.u, dw = (w - VC.w) * 1.12
  let m = Math.exp(-2 * (du * du + dw * dw) / (27 * 27))
  for (const s of SPINES) m += gau(u, w, s)
  for (const h of HILLS) m += gau(u, w, h)
  // barrancos: angular modulation carves radial valleys so no terrace contour can close
  // into a clean concentric ring (Bora Bora's cone is gullied, never smooth)
  const ang = Math.atan2(w - VC.w, u - VC.u)
  m *= 0.88 + 0.24 * vnoise2(Math.cos(ang) * 2.6 + 40, Math.sin(ang) * 2.6 + 17)
  m += 0.13 * (vnoise2(u / 9 + 31, w / 9 + 7) - 0.5) * 2
  return m
}

export const T_LEVELS = [0.14, 0.32, 0.52, 0.72]
export const LIFTS = [0, 26, 54, 84, 114]
const CRATER_R = 3.4

/** terrace level (0..4) + progress toward the next rim, on the pad */
export function levelAtUW(u: number, w: number): { lvl: number; frac: number } {
  const cd = coastDistUW(u, w)
  if (cd <= 0) return { lvl: 0, frac: 0 }
  const li = landAtUW(u, w)
  if (li > 0) {
    const q = smooth01((cd * 2) / 3.5)
    return { lvl: q > 0.55 ? 1 : 0, frac: q }
  }
  const m = mountainM(u, w) * smooth01(cd / 7)
  let lvl = 0
  for (let i = 0; i < T_LEVELS.length; i++) if (m >= T_LEVELS[i]) lvl = i + 1
  const lo = lvl === 0 ? 0 : T_LEVELS[lvl - 1]
  const hi = lvl < T_LEVELS.length ? T_LEVELS[lvl] : lo + 0.28
  return { lvl, frac: Math.min(1, Math.max(0, (m - lo) / (hi - lo))) }
}

export function isleLiftUW(u: number, w: number) {
  const cd = coastDistUW(u, w)
  if (cd <= 0) return 0
  const li = landAtUW(u, w)
  const berm = 2.5 * smooth01(cd / 3)
  // CLIFF COASTS HAVE HEIGHT: where the shore is not a beach, the land stands ~14px above
  // the water within a couple units and STAYS there — the waterline row then drops a real
  // wall to the sea (dark paint alone never read as a cliff)
  const cliffLip = (1 - beachKAt(u, w)) * 14 * smooth01(cd / 2.5)
  if (li > 0) {
    // a toe islet: a cliff-ringed low plateau under future canopy
    const L = LANDS[li]
    const q = smooth01((cd * 2) / 3.5)
    return berm + cliffLip + 22 * q + 8 * (vnoise2((u - L.du) / 5 + li * 9, (w - L.dw) / 5) - 0.5) * 2 * q
  }
  const { lvl, frac } = levelAtUW(u, w)
  let lift = LIFTS[lvl] + 12 * smooth01(frac) + berm + cliffLip
  // the coastal plain rolls (low foothill swell for the sun-shader to model — a dead-flat
  // lawn between the beach and the first terrace is the golf-course read)
  lift += 7 * (vnoise2(u / 7 + 12, w / 7 + 27) - 0.5) * 2 * smooth01(cd / 6)
  // the crater sinks into the summit (the blowhole bowl)
  const dc = Math.hypot(u - VC.u, w - VC.w)
  if (dc < CRATER_R) lift -= 40 * smooth01((CRATER_R - dc) / 2.2)
  return Math.max(0, lift)
}
export const isleLift = (tx: number, ty: number) => isleLiftUW(uOf(tx, ty), wOf(tx, ty))

/** lift change per s-row — steep = cliffy = unwalkable */
export function isleSlope(tx: number, ty: number) {
  return Math.abs(isleLift(tx + 0.5, ty + 0.5) - isleLift(tx - 0.5, ty - 0.5))
}

// ---- fresh water: crater-spring river down the south face -> the falls basin (the carved
// head's pool, piece 5) -> the run to the south cove ----
export const POOL = { u: -3.5, w: 10.5, r: 2.4 }
const RIVER: [number, number][] = [
  [-4, -1], [-4.6, 3], [-4.2, 7], [-3.5, 10.5], [-3, 14], [-2.2, 20], [-1.6, 26], [-1, 32], [-0.6, 40],
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
  const dRiv = segDist(u, w, RIVER) - (0.55 + 0.5 * smooth01((w - 11) / 26))
  return Math.min(dPool, dRiv)
}

// ---- terrain classification ----
export type IsleCell = 'sea' | 'wet' | 'sand' | 'grass' | 'jungle' | 'rock' | 'cliff' | 'fresh' | 'bank'
export function isleCell(tx: number, ty: number): IsleCell {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const cd = coastDistUW(u, w)
  if (cd < 0) return 'sea'
  const B = beachKAt(u, w)
  const li0 = landAtUW(u, w)
  // sand apron width scales with coast type; cliffs get none; toe islets wear half-width
  const beachW = (1.0 + 5.2 * B) * (li0 > 0 ? 0.5 : 1)
  if (B > 0.22 && cd < 1.2) return 'wet'
  if (B <= 0.22 && cd < 1.4) return 'cliff' // waterline basalt at cliff coasts
  if (cd > 2.2) {
    const f = freshDist(tx, ty)
    if (f < 0) return 'fresh'
    if (f < 0.8) return 'bank'
  }
  if (B > 0.22 && cd < beachW) return 'sand'
  if (B > 0.22 && cd < beachW + 1.6) return 'grass'
  const { lvl } = levelAtUW(u, w)
  const dc = Math.hypot(u - VC.u, w - VC.w)
  if (dc < CRATER_R + 1.6) return 'rock' // the crater bowl + rim
  if (lvl >= 4) return 'rock'            // bare rock is only the summit cone; L3 is upland
  return 'jungle'
}
