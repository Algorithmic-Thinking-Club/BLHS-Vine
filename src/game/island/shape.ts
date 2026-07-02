// THE CENTRAL ISLAND'S GEOMETRY — every field the renderer needs, as pure math (no pixi).
// The island is authored in SCREEN-SPACE polar coordinates so the barely-panther-head
// silhouette is judged in the projection the player actually sees: u = tx-ty (one unit =
// 32 screen px), w = (tx+ty-s0)/2 (one unit = 32 screen px). A screen circle is a circle here.
// Validated offline first: scripts/_archive/island_shape_proto.py renders this exact coast.
//
// The shape reads as NATURE FIRST: a wobbly volcanic jungle island with coves. Squint and the
// two ear ridges, the dip between them, the cheek flares and the jaw make a panther's head —
// Ash's locked bones (GAME-DESIGN §3.2). Never a cookie-cutter panther.

export const MAP_COLS = 384, MAP_ROWS = 384
export const ISLE_CX = 192, ISLE_CY = 192 // tile-space center -> (d=0, s=384)
const S0 = ISLE_CX + ISLE_CY

// ---- the coast ----
const R0 = 56
// lobes: [center deg, width deg, amplitude] — theta 90 = up-screen (north)
const LOBES: [number, number, number][] = [
  [115.0, 13.5, 19.0],  // left ear (upper-left ridge)
  [66.0, 11.5, 16.5],   // right ear (worn a little lower — asymmetry keeps it natural)
  [90.0, 9.0, -5.0],    // the dip between the ears (sells the head, gently)
  [270.0, 26.0, 9.0],   // chin/jaw (lower center, broad + gentle)
  [197.0, 18.0, 6.5],   // left cheek flare
  [343.0, 18.0, 6.5],   // right cheek flare
]
// the four port coves, one per diagonal quarter (piers must run the true iso diagonals):
// NE = "north port", SE = "east port" (the intro arrival), SW = "south", NW = "west"
export const PORT_THETA = { north: 45, east: 315, south: 225, west: 135 } as const
const COVES: [number, number, number][] = [
  [45.0, 10.0, -7.0],
  [315.0, 10.0, -8.0],
  [225.0, 10.0, -7.0],
  [135.0, 10.0, -7.0],
]
// nature noise: integer harmonics (periodic in theta), fixed phases
const HARM: [number, number, number][] = [
  [3, 2.0, 0.7], [5, 2.2, 2.9], [7, 1.6, 5.1], [11, 1.1, 1.6], [13, 0.8, 4.2],
]

const bump = (td: number, c: number, wd: number, amp: number) => {
  const d = ((td - c + 180) % 360 + 360) % 360 - 180
  return amp * Math.exp(-(d * d) / (2 * wd * wd))
}

/** coast radius at polar angle theta (radians, screen space, 90deg = up-screen) */
export function coastR(theta: number) {
  const td = ((theta * 180) / Math.PI % 360 + 360) % 360
  let r = R0
  for (const [c, wd, a] of LOBES) r += bump(td, c, wd, a)
  for (const [c, wd, a] of COVES) r += bump(td, c, wd, a)
  for (const [k, a, ph] of HARM) r += a * Math.sin(k * theta + ph)
  return r
}

// tile -> screen-space island coords
export const uOf = (tx: number, ty: number) => tx - ty
export const wOf = (tx: number, ty: number) => (tx + ty - S0) / 2
// screen-space island coords -> tile coords (fractional)
export const txOf = (u: number, w: number) => (S0 + 2 * w + u) / 2
export const tyOf = (u: number, w: number) => (S0 + 2 * w - u) / 2

/** signed radial distance to the coast in 32px screen units: NEGATIVE in the sea,
 *  POSITIVE inland (matches the beach's "ds onto land" convention). A radial
 *  approximation of true distance — exact on the normal, slightly short along
 *  steep lobes, plenty for ramps/zones. */
export function coastDist(tx: number, ty: number) {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const r = Math.hypot(u, w)
  const th = Math.atan2(-w, u)
  return coastR(th) - r
}

/** point + outward normal + tangent of the coast at theta (screen px, world coords) */
export function coastPoint(theta: number) {
  const r = coastR(theta)
  const u = r * Math.cos(theta), w = -r * Math.sin(theta)
  // numerical tangent in (u,w)
  const e = 0.01
  const r2 = coastR(theta + e)
  const u2 = r2 * Math.cos(theta + e), w2 = -r2 * Math.sin(theta + e)
  let tx2 = u2 - u, ty2 = w2 - w
  const tl = Math.hypot(tx2, ty2); tx2 /= tl; ty2 /= tl
  // outward normal = tangent rotated so it points away from the center
  let nx = ty2, ny = -tx2
  if (nx * u + ny * w < 0) { nx = -nx; ny = -ny }
  return { u, w, nx, ny }
}

// ---- the mountain (elevation as screen-px lift, the beach's level trick at scale) ----
// Peak sits just north of center (the carved head faces SOUTH toward the camera); two ridges
// run toward the ears; a rough skirt of foothills; everything gated to vanish at the coast.
const PEAK = { u: 0, w: -7, sig: 24, amp: 175 }
const RIDGES = [
  { u: -22, w: -22, sig: 11, amp: 62 },  // toward the left ear
  { u: 15, w: -21, sig: 10, amp: 56 },   // toward the right ear
  { u: -3, w: 9, sig: 9, amp: 34 },      // the muzzle shoulder south of the peak
]

const hash2 = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
export function vnoise2(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const uu = fx * fx * (3 - 2 * fx), vv = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1)
  return a * (1 - uu) * (1 - vv) + b * uu * (1 - vv) + c * (1 - uu) * vv + d * uu * vv
}

const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }

/** terrain lift in screen px at a tile (0 at/near the coast, mountain at the center) */
export function isleLift(tx: number, ty: number) {
  const cd = coastDist(tx, ty)
  if (cd <= 0) return 0
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const gate = smooth01((cd - 2) / 10) // flat sand ring, then the land climbs
  let lift = 3.5 * smooth01(cd / 4)    // the swash berm every shore gets
  const g = (o: { u: number; w: number; sig: number; amp: number }) => {
    const du = u - o.u, dw = w - o.w
    return o.amp * Math.exp(-(du * du + dw * dw) / (2 * o.sig * o.sig))
  }
  let m = g(PEAK)
  for (const r of RIDGES) m += g(r)
  // rolling foothill noise, stronger where the mountain already is
  m += (10 + m * 0.16) * (vnoise2(u / 14 + 31, w / 14 + 7) - 0.5) * 2
  lift += gate * Math.max(0, m)
  return lift
}

// ---- fresh water: the falls pool below the carved head + the river running to the sea ----
// The head is carved into the mountain's south face; water pours from the mouth into the
// pool, then the river winds south-southeast between the east and south ports to the coast.
export const POOL = { u: 0, w: 6.5, r: 5.0 }
const RIVER: [number, number][] = [
  [0, 9.5], [1.5, 14], [4.5, 19], [9, 24], [11.5, 30], [14, 36],
  [18, 42], [21, 48], [23, 56], [24, 64],
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

/** distance (32px units) to fresh water (pool + river centerline). River width tapers up. */
export function freshDist(tx: number, ty: number) {
  const u = uOf(tx, ty), w = wOf(tx, ty)
  const dPool = Math.hypot(u - POOL.u, w - POOL.w) - POOL.r
  // the river's half-width grows 0.9 -> 1.7 downstream (w 9.5 -> 64)
  const dRiv = segDist(u, w, RIVER) - (0.9 + 0.8 * smooth01((w - 9.5) / 54))
  return Math.min(dPool, dRiv)
}

// ---- paths: one worn trail from every port climbing inward to the falls pool ----
// (authored as gentle S-curves in island coords; sampled once by the renderer)
export const PATHS: Record<keyof typeof PORT_THETA, [number, number][]> = {
  north: [[33, -33], [26, -26], [18, -21], [12, -14], [7, -6], [4.5, 1.5]],
  east: [[35, 33], [29, 27], [24, 22], [18, 17], [12, 13], [7.5, 10], [4.8, 8.2]],
  south: [[-31, 34], [-26, 28], [-21, 23], [-15, 18], [-10, 14], [-5.5, 10.5]],
  west: [[-36, -30], [-29, -24], [-23, -17], [-17, -11], [-12, -5], [-7, 1], [-4.5, 4.5]],
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

// ---- terrain classification (what the renderer paints + what walks) ----
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
  if (lift > 118) return 'rock'
  return 'jungle'
}

/** slope magnitude (px of lift change per s-row) — steep = cliffy = unwalkable */
export function isleSlope(tx: number, ty: number) {
  return Math.abs(isleLift(tx + 0.5, ty + 0.5) - isleLift(tx - 0.5, ty - 0.5))
}
