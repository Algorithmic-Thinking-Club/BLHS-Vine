// THE HUB ISLAND'S MASTER LAYOUT — every PLACE as authored data, no art (Phase A of
// docs/place-specs/hub-island-method.md). This module is the one truth the renderer,
// the vegetation placer, the prop passes and (later) walkability all read, so the whole
// island is ONE designed place instead of decorated pockets. GAME-DESIGN §3.2 gives the
// bones (four ports, paths inward, the gate, the Maw, the lighthouse, the steles); the
// where/how here is the builder's layout.
//
// ⚠ INITIALIZATION ORDER (the bug that parked every grove on the volcano): all derived
// positions depend on coastR(), whose traced SKELETON loads asynchronously. Nothing here
// may be computed at module load — the renderer calls initHubLayout() AFTER setSkeleton,
// and every consumer reads the live bindings after that.
//
// Compass note (repeated everywhere because it bites): SCREEN angle = tile azimuth + 45°.
// screen-E = az -PI/4 · screen-S = +PI/4 · screen-W = 3PI/4 · screen-N = -3PI/4.
// The lagoon window (az -0.55) is the screen-E/SE arrival water; the cove (az 0.79) is
// the screen-S pocket; the cliff arc wraps screen W -> NW -> N.

import { CX, CY, coastR, coastDs, lavaDist, LAVA, HEAD_R, HEAD_L } from './terrain'
import { coneH, gullyK } from './volcano'
import { vnoise } from '../ocean'

// ---- THE ONE SUN (locked golden hour, upper-left): every cast shadow on the island
// lies along this screen direction. Length scales with the asset's height; the beach
// proved shadows must be DENSE enough to register under the warm grade.
export const SHADOW = { dx: 0.92, dy: 0.39, alpha: 0.65 }

// the WEST COVE + NORTH NOTCH: narrow designed openings in the cliff arc (the layout's
// one intervention in the coast grammar — gated on screen at the far zoom before it
// stays). Renderers subtract this from cliffK and may widen the shelf inside it.
export function coveNotchK(theta: number) {
  const win = (c: number, w: number) => {
    const d = Math.abs(((theta - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    const k = Math.max(0, 1 - d / w)
    return k * k * (3 - 2 * k)
  }
  return Math.max(win(2.62, 0.24), 0.8 * win(-2.05, 0.16))
}

export type Port = { az: number; x: number; y: number; kind: 'arrival' | 'cargo' | 'cove' | 'nets' }

// ---- THE EAST HARBOR as a tile-level STRUCTURE (Ash, 2026-07-10: "a glorious
// harbor, not some ragdoll port... it needs to mesh properly with the isometric
// engine"). The harbor is DATA the renderer constructs per tile — real block
// columns + flat material tops, exactly how the land itself is built — and the
// same data is the walkability/collision truth when Thor lands on this map.
export type HarborTile = { tx: number; ty: number; lift: number; mat: 'stone' | 'plank' | 'rock'; walk: boolean }
export let HARBOR: {
  tiles: HarborTile[]
  quayRect: [number, number, number, number]   // qx0, qy0, w, h (the deck's bounds)
  root: [number, number]                        // where the spur path meets the quay
  steps: [number, number]                       // steps down to the sand
  berth: [number, number]                       // the intro ship's mooring, pier north face
  bell: [number, number]; crane: [number, number]; lanterns: [number, number][]
  cargo: [number, number][]; sloop: [number, number]; sloop2: [number, number]
  rowboat: [number, number]; beacon: [number, number]; pennant: [number, number]
  edgePosts: [number, number][]                 // mooring posts pacing the seaward lip
  bollards: [number, number][]
} = { tiles: [], quayRect: [0, 0, 0, 0], root: [0, 0], steps: [0, 0], berth: [0, 0], bell: [0, 0], crane: [0, 0], lanterns: [], cargo: [], sloop: [0, 0], sloop2: [0, 0], rowboat: [0, 0], beacon: [0, 0], pennant: [0, 0], edgePosts: [], bollards: [] }
export const HLIFT = 24 // the quay/pier deck height above the waterline (world px)
export const harborAt = (tx: number, ty: number): HarborTile | undefined =>
  HARBOR.tiles.find((t) => t.tx === tx && t.ty === ty)

// ---- the derived layout (live bindings, filled by initHubLayout) ----
export let PORTS: Record<'east' | 'south' | 'west' | 'north', Port>
export let PLAZA: [number, number] = [CX, CY + 42]
export const PLAZA_R = 5.5
export let GATE_HEAD: [number, number] = HEAD_R
export let TONGUE: [number, number][] = []
export let PROMENADE: [number, number][] = []
export let PATH_NW: [number, number][] = []
export let APPROACH: [number, number][] = []
export let SPURS: [number, number][][] = []
export let PATHS: [number, number][][] = []
export let RIVER: [number, number][] = []
export let FALLS: [number, number] = [CX, CY]
export let STELES: [number, number][] = []
export let LIGHTHOUSE: [number, number] = [CX, CY]
export let BECU_TREE: [number, number] = [CX, CY]
export let TIDEPOOLS: [number, number] = [CX, CY]
export let GROVES: [number, number, number, number][] = []
// where a walker actually STANDS to face the west head (the head itself is
// unwalkable mountain ringed by its own stream — the audit proved the naive
// POI-on-the-head unreachable). Computed from the real landform in init.
export let WEST_OVERLOOK: [number, number] = [CX, CY]
// the STEPPING-STONE FORD where the promenade crosses the river (the river
// blocks the walk everywhere else — a stream you can wade anywhere is set
// dressing, not a place). Computed in init like the lava crossings.
export let FORD: [number, number] = [CX, CY]
export const fordD = (tx: number, ty: number) => Math.hypot(tx - FORD[0], ty - FORD[1])
// the north/south mini-jetty roots (their first land tile) — the renderer
// dresses each landing from these anchors
export let MINI_PORTS: { north: [number, number]; south: [number, number] } = { north: [CX, CY], south: [CX, CY] }
// cooled-crust slabs where the lava flows cross the promenade (one per flow) —
// the ring-walk stays connected; walkable + drawn as charred basalt
export const CROSSINGS: [number, number][] = []
export const crossingD = (tx: number, ty: number) => {
  let best = 99
  for (const c of CROSSINGS) { const d = Math.hypot(tx - c[0], ty - c[1]); if (d < best) best = d }
  return best
}

const GRID = 200
let LAVA0: [number, number][][] | null = null   // pristine LAVA lines (pre-extension)
let PATH_SET = new Set<number>()
export const onPathTile = (tx: number, ty: number) => PATH_SET.has(ty * GRID + tx)

const segD = (P: [number, number][], tx: number, ty: number) => {
  let best = 99
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1]
    const vx = x1 - x0, vy = y1 - y0
    const L2 = vx * vx + vy * vy
    let t = L2 > 0 ? ((tx - x0) * vx + (ty - y0) * vy) / L2 : 0
    t = Math.max(0, Math.min(1, t))
    const dx = tx - (x0 + vx * t), dy = ty - (y0 + vy * t)
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < best) best = d
  }
  return best
}
export const pathD = (tx: number, ty: number) => {
  let best = 99
  for (const P of PATHS) { const d = segD(P, tx, ty); if (d < best) best = d }
  return best
}
export const riverD = (tx: number, ty: number) => (RIVER.length ? segD(RIVER, tx, ty) : 99)
// the gate's carved tongue-stair ribbon (Phase C2): distance to the TONGUE line
export const tongueD = (tx: number, ty: number) => (TONGUE.length ? segD(TONGUE, tx, ty) : 99)

// ---- CLEARINGS: where vegetation must NOT stand (places, paths, water, lava).
// 1 = fully open ground, 0 = free to plant.
export function clearingK(tx: number, ty: number) {
  let k = 0
  const open = (d: number, r: number, feather: number) =>
    Math.max(0, Math.min(1, 1 - (d - r) / feather))
  k = Math.max(k, open(Math.hypot(tx - PLAZA[0], ty - PLAZA[1]), PLAZA_R, 3))
  for (const p of [PORTS.east, PORTS.south, PORTS.west, PORTS.north]) {
    k = Math.max(k, open(Math.hypot(tx - p.x, ty - p.y), p.kind === 'arrival' ? 7 : 5, 3))
  }
  k = Math.max(k, open(pathD(tx, ty), 1.6, 1.6))
  k = Math.max(k, open(riverD(tx, ty), 1.8, 1.5))
  k = Math.max(k, open(lavaDist(tx, ty), 2.4, 2))
  k = Math.max(k, open(Math.hypot(tx - LIGHTHOUSE[0], ty - LIGHTHOUSE[1]), 3, 2))
  k = Math.max(k, open(segD(TONGUE, tx, ty), 2.2, 2))
  for (const s of STELES) k = Math.max(k, open(Math.hypot(tx - s[0], ty - s[1]), 1.2, 1))
  return k
}

// ---- THE VEGETATION DENSITY FIELD, 0..1: DESIGNED GROVES, not a forest and not
// sprinkle (Ash, 2026-07-09: "dense jungle... is just a forest — Thor needs to walk
// around the island and the outside needs a lot of STUFF"). The green is the FRAME:
// named grove sites flanking the ports, pacing the promenade, crowning the bluffs —
// wide walkable meadow between them; the places carry the density. On the cone, only
// c3's gully tongues climb.
export function vegK(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds <= 1.2) return 0                       // never on the sand/sea
  const h = coneH(tx, ty)
  if (h > 7) {
    if (h >= 26) return 0
    const g = gullyK(tx, ty)
    const fall = 1 - (h - 7) / 19
    return 0.8 * Math.max(0, (g - 0.4) / 0.6) * fall * (1 - clearingK(tx, ty))
  }
  let k = 0
  for (const [gx, gy, gr, gs] of GROVES) {
    const dd = Math.hypot(tx - gx, ty - gy)
    const v = gs * Math.exp(-Math.pow(dd / gr, 2))
    if (v > k) k = v
  }
  // rare lone palms drifting the open ring (kept sparse — singles, not fill)
  const az = Math.atan2(ty - CY, tx - CX)
  const u = Math.hypot(tx - CX, ty - CY) / coastR(az)
  if (u > 0.55 && u < 0.97) {
    k = Math.max(k, 0.2 * Math.max(0, (vnoise(tx / 5 + 8, ty / 5 + 19) - 0.58) / 0.42))
  }
  k *= 1 - clearingK(tx, ty)
  return Math.max(0, Math.min(1, k))
}

// ---- initHubLayout(): computes every derived place from the REAL coastline.
// Call once, after setSkeleton() has resolved. Idempotent.
export function initHubLayout() {
  const portAt = (az: number, kind: Port['kind'], back = 1): Port => ({
    az, kind,
    x: CX + Math.cos(az) * (coastR(az) - back),
    y: CY + Math.sin(az) * (coastR(az) - back),
  })
  // THE FOUR PORTS (GAME-DESIGN §3.2: purpose-built docks; the intro arrives EAST).
  PORTS = {
    east: portAt(-0.52, 'arrival', 0.5),   // the lagoon's inner shore — the intro pier
    south: portAt(0.82, 'cargo', 0.5),     // the cove pocket, serving the plaza
    west: portAt(2.62, 'cove', 0.5),       // the quiet cove (cliff notch, small beach)
    north: portAt(-2.05, 'nets', 2.0),     // cliff-foot fishing jetty in a notch
  }

  // THE PLAZA (the gate forecourt): flat south front ring between the lava deltas.
  // Margin must clear the plaza's OWN radius — at 5.5 the ring's rim landed on
  // the beach steps. And the search must actually SUCCEED: at the fixed az 0.86
  // the cove recedes the coast, no radius satisfied the margin, and the silent
  // r-42 fallback parked the plaza at the WATERLINE with its braziers in the
  // sand (found on screen 2026-07-11). Scan nearby azimuths too; fall back
  // INLAND, never seaward.
  PLAZA = [CX + Math.cos(0.86) * 30, CY + Math.sin(0.86) * 30]
  outer: for (const az of [0.86, 0.78, 0.94, 0.7, 1.02, 0.62]) {
    for (let r = coastR(az) - 8; r >= 26; r -= 0.5) {
      const px = CX + Math.cos(az) * r, py = CY + Math.sin(az) * r
      if (coastDs(px, py) > PLAZA_R + 4.5 && coneH(px, py) < 1.2) { PLAZA = [px, py]; break outer }
    }
  }

  // LAVA REACHES THE SEA (Ash: the mouth-flow must blend into a trail that
  // "bleeds into the ocean"). The static polylines end ~4 tiles short of the
  // water; extend each tail along its own direction to just past its coast
  // radius so the molten ribbon renders down the beach to the waterline. The
  // renderer adds the quench (basalt fan + steam + glow) at each sea end.
  // Idempotent: skip lines already extended past their coast.
  // Rebuilt from the PRISTINE polylines every init (initHubLayout runs once at
  // module load against the default skeleton and again after the real skeleton
  // resolves — a mutate-in-place extension baked the wrong coast in and the
  // quench marooned offshore). Resample each line at fine steps, keep it while
  // on land, cut just past the TRUE waterline; if it never reaches water,
  // march on along the last direction until it does.
  if (!LAVA0) LAVA0 = LAVA.map((l) => l.map((p) => [p[0], p[1]] as [number, number]))
  for (let li = 0; li < LAVA.length; li++) {
    const src = LAVA0[li]
    const out: [number, number][] = [[src[0][0], src[0][1]]]
    let crossed = false
    for (let i = 0; i < src.length - 1 && !crossed; i++) {
      const [x0, y0] = src[i], [x1, y1] = src[i + 1]
      const L = Math.hypot(x1 - x0, y1 - y0)
      const n = Math.max(1, Math.ceil(L / 0.5))
      for (let s = 1; s <= n; s++) {
        const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n
        out.push([x, y])
        // -1.2 (was -0.8; -1.8 stranded the basalt fan out in the tide,
        // detached from the ribbon): the quench sits right AT the waterline
        if (coastDs(x, y) <= -1.2) { crossed = true; break }
      }
    }
    if (!crossed) {
      const [px, py] = out[out.length - 2] ?? out[0]
      let [ex, ey] = out[out.length - 1]
      const dl = Math.hypot(ex - px, ey - py) || 1
      const ux = (ex - px) / dl, uy = (ey - py) / dl
      let steps = 0
      // steepest-descent blend (the river tail's own fix): a straight march
      // can end in a radial ds pocket while the real waterline sits tiles away
      while (steps++ < 26 && coastDs(ex, ey) > -1.2) {
        const g = 0.6
        const gx = coastDs(ex + g, ey) - coastDs(ex - g, ey)
        const gy = coastDs(ex, ey + g) - coastDs(ex, ey - g)
        const gl = Math.hypot(gx, gy) || 1
        const bx = ux * 0.45 - (gx / gl) * 0.55, by = uy * 0.45 - (gy / gl) * 0.55
        const bl = Math.hypot(bx, by) || 1
        ex += (bx / bl) * 0.6; ey += (by / bl) * 0.6
        out.push([ex, ey])
      }
    }
    // thin the resample back to a lean polyline (every ~2 tiles + the tail)
    const lean: [number, number][] = [out[0]]
    for (let i = 1; i < out.length - 1; i++) {
      const [lx, ly] = lean[lean.length - 1]
      if (Math.hypot(out[i][0] - lx, out[i][1] - ly) >= 2) lean.push(out[i])
    }
    lean.push(out[out.length - 1])
    LAVA[li].length = 0
    LAVA[li].push(...lean)
  }

  // THE GATE: Thor enters the Maw THROUGH the SE panther head's mouth. The head's
  // ONE lava stream (terrain MOUTH_R — the twin-curtain pair was the dead portal
  // design) runs PARALLEL ~3 tiles south of this tongue-stair, so the climb to the
  // mouth stays dry while the flow roars beside it.
  // TONGUE[0] = the base (where the plaza approach arrives), last = the mouth.
  GATE_HEAD = HEAD_R
  // the stair's summit lands on the maw's CLEAR side (NW of the mouth-strike —
  // the stream exits the jaw's right corner at MOUTH_R, and a summit at the
  // old head-centre drowned the top treads in the molten field)
  TONGUE = [[140, 92], [132, 96], [124, 99], [116.4, 99.8]]

  // PATHS: the coast PROMENADE stitches E port -> S cove -> plaza -> W lawn; spurs
  // feed it from each port; the APPROACH climbs toward the gate stair.
  const ringPath = (az0: number, az1: number, back: number, steps: number): [number, number][] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const az = az0 + (az1 - az0) * (i / steps)
      const r = coastR(az) - back
      return [CX + Math.cos(az) * r, CY + Math.sin(az) * r] as [number, number]
    })
  const SC = (x: number, y: number): [number, number] => [CX + (x - CX) * 1.32, CY + (y - CY) * 1.32]
  PROMENADE = ringPath(-0.62, 2.72, 8, 34)
  PATH_NW = ([[121, 95], [112, 88], [102, 82], [92, 76], [82, 74], [73, 78], [68, 86]] as [number, number][]).map(([x, y]) => SC(x, y))
  APPROACH = [PLAZA, ...TONGUE.slice(0, 2)]
  const spur = (p: Port, len = 6): [number, number][] => [
    [p.x, p.y],
    [CX + Math.cos(p.az) * (coastR(p.az) - 8 - len * 0.4), CY + Math.sin(p.az) * (coastR(p.az) - 8 - len * 0.4)],
  ]
  SPURS = [spur(PORTS.east), spur(PORTS.south), spur(PORTS.west), spur(PORTS.north, 4)]
  PATHS = [PROMENADE, PATH_NW, APPROACH, ...SPURS]

  // the paths RASTERIZED to a connected 1-2 tile ribbon (distance-thresholding a
  // diagonal polyline against tile centers produced a broken dash-line)
  PATH_SET = new Set<number>()
  for (const P of PATHS) {
    let px = NaN, py = NaN   // the previous rasterized cell along THIS polyline
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1]
      const L = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(2, Math.ceil(L / 0.12))
      for (let s = 0; s <= steps; s++) {
        const x = x0 + ((x1 - x0) * s) / steps
        const y = y0 + ((y1 - y0) * s) / steps
        const cx = Math.round(x), cy = Math.round(y)
        PATH_SET.add(cy * GRID + cx)
        // a diagonal step leaves the two cells touching only at a corner — in
        // iso that renders as a DASH of disconnected diamonds (the forecourt
        // climb read as scattered pale tiles). Bridge every diagonal with one
        // orthogonal cell so the ribbon is edge-connected by construction.
        if (!Number.isNaN(px) && cx !== px && cy !== py) PATH_SET.add(cy * GRID + px)
        px = cx; py = cy
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (Math.hypot(cx + ox - x, cy + oy - y) < 0.72) PATH_SET.add((cy + oy) * GRID + cx + ox)
        }
      }
    }
  }

  // THE CRUST CROSSINGS: each flow severs the promenade ring on its way to the
  // sea — the ring-walk must NOT dead-end (function before decoration; the
  // island audit proves reachability). Where each flow passes nearest the
  // promenade, a slab of cooled crust bridges the channel: walkable in
  // hub-mechanics, drawn as charred basalt by the renderer.
  CROSSINGS.length = 0
  for (const line of LAVA) {
    let best: [number, number] | null = null, bd = 99
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = line[i], [x1, y1] = line[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4))
      for (let s = 0; s <= n; s++) {
        const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n
        const d = segD(PROMENADE, x, y)
        if (d < bd) { bd = d; best = [x, y] }
      }
    }
    if (best && bd < 3) CROSSINGS.push(best)
  }

  // THE RIVER (spring on the south flank -> falls at the bench lip -> cove
  // estuary). Assigned HERE, before the ford derives from it — the init-order
  // trap struck again when the ford read last-init's river.
  RIVER = ([[114, 106], [119, 110], [124, 115], [128, 120], [131, 124]] as [number, number][]).map(([x, y]) => SC(x, y))
  {
    // MEANDER + REACH THE SEA: the raw 5-point spine rasterized into mechanical
    // zigzag segments and its endpoint died on the beach sand. Densify with a
    // gentle perpendicular sway, then march the tail to the true waterline
    // (the lava tails' own fix).
    const spine = RIVER
    const dense: [number, number][] = []
    let arc = 0
    for (let i = 0; i < spine.length - 1; i++) {
      const [x0, y0] = spine[i], [x1, y1] = spine[i + 1]
      const seg = Math.hypot(x1 - x0, y1 - y0)
      const ux = (x1 - x0) / seg, uy = (y1 - y0) / seg
      const n = Math.ceil(seg / 1.1)
      for (let s = 0; s < n; s++) {
        const d = (seg * s) / n
        const w = 0.9 * Math.sin((arc + d) * 0.72 + 1.4)
        dense.push([x0 + ux * d - uy * w, y0 + uy * d + ux * w])
      }
      arc += seg
    }
    dense.push([spine[spine.length - 1][0], spine[spine.length - 1][1]])
    let [ex, ey] = dense[dense.length - 1]
    const [px2, py2] = dense[dense.length - 2]
    const dl = Math.hypot(ex - px2, ey - py2) || 1
    const ux2 = (ex - px2) / dl, uy2 = (ey - py2) / dl
    let guard = 0
    // STEEPEST-DESCENT to the sea (was a straight march to -0.6): the radial
    // coast field wanders with the traced skeleton, so a straight tail can
    // clip a local ds<=0 pocket and strand the mouth with dry sand tiles
    // still between it and the visible tide (probe-proven at the ford frame).
    // Blending the spine heading with the field's downhill always ends the
    // run in real water, two diagonals past the sand line.
    while (guard++ < 40 && coastDs(ex, ey) > -2.2) {
      const g = 0.6
      const gx = coastDs(ex + g, ey) - coastDs(ex - g, ey)
      const gy = coastDs(ex, ey + g) - coastDs(ex, ey - g)
      const gl = Math.hypot(gx, gy) || 1
      const bx = ux2 * 0.45 - (gx / gl) * 0.55, by = uy2 * 0.45 - (gy / gl) * 0.55
      const bl = Math.hypot(bx, by) || 1
      ex += (bx / bl) * 0.8; ey += (by / bl) * 0.8
      dense.push([ex, ey])
    }
    RIVER = dense
    // the falls stays at the authored bench lip (nearest dense point to it)
    const f0 = SC(124, 115)
    FALLS = dense.reduce((b, p) => (Math.hypot(p[0] - f0[0], p[1] - f0[1]) < Math.hypot(b[0] - f0[0], b[1] - f0[1]) ? p : b), dense[0])
  }

  // THE FORD: where the river passes nearest the promenade, stepping stones
  // carry the ring-walk across (walkable window in hub-mechanics; the audit
  // proves the ring stays whole)
  {
    let best: [number, number] | null = null, bd = 99
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [x0, y0] = RIVER[i], [x1, y1] = RIVER[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4))
      for (let s = 0; s <= n; s++) {
        const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n
        const d = segD(PROMENADE, x, y)
        if (d < bd) { bd = d; best = [x, y] }
      }
    }
    FORD = best ?? [CX, CY]
  }

  // THE WEST-HEAD OVERLOOK: march out from the head's azimuth past the cone toe
  // to the first real standing ground (walkable body, clear of the stream), then
  // prefer the spot closest to the head. This is where the POI lives.
  {
    const az = Math.atan2(HEAD_L[1] - CY, HEAD_L[0] - CX)
    let found: [number, number] | null = null
    for (let r = 20; r <= 34 && !found; r += 0.5) {
      for (const w of [0, 1.5, -1.5, 3, -3]) {
        const px = CX + Math.cos(az) * r - Math.sin(az) * w
        const py = CY + Math.sin(az) * r + Math.cos(az) * w
        if (coneH(px, py) <= 2 && lavaDist(px, py) > 2.2 && coastDs(px, py) > 2) {
          found = [px, py]; break
        }
      }
    }
    WEST_OVERLOOK = found ?? [CX + Math.cos(az) * 26, CY + Math.sin(az) * 26]
  }

  // (RIVER + FALLS are assigned above, before the ford derives from them)

  // POIs (the landmark destinations that make the island worth walking)
  STELES = Array.from({ length: 5 }, (_, i) => {
    const t = (i + 1) / 6
    const x = PLAZA[0] + (TONGUE[0][0] - PLAZA[0]) * t
    const y = PLAZA[1] + (TONGUE[0][1] - PLAZA[1]) * t
    // the walk's wobble must never plant a marker on the lava bank (the MOUTH_R
    // flow parallels this whole approach): try the wobble, its mirror, then the
    // spine, and keep the first stance standing clear of the channel
    const cands: [number, number][] = [
      [x + Math.sin(i * 2.4) * 1.6, y + Math.cos(i * 2.4) * 1.6],
      [x - Math.sin(i * 2.4) * 1.6, y - Math.cos(i * 2.4) * 1.6],
      [x, y],
    ]
    return cands.find(([cx2, cy2]) => lavaDist(cx2, cy2) > 2.6) ?? cands[1]
  })
  // THE EAST HARBOR PLAN v2 (Ash: "a large glorious harbor that matches the
  // style of the island"). The island's hard materials are terracotta rock,
  // peach sand and TIMBER — no alien stonework. So the harbor is a WATERFRONT
  // DISTRICT (c2-harbor-lights' idea in c3/bon3's palette): a timber BOARDWALK
  // hugging ~20 rows of the real waterline (derived from the coast, so it
  // meshes by construction), THREE piers off it (the wide main pier berths the
  // intro ship), a long boulder breakwater, and buildings/lights/boats along
  // the shore. Everything mounts ON the structure or the sand behind it.
  {
    const P = PORTS.east
    const ryMid = Math.round(P.y)
    const rawWx = (y: number) => {
      let wx = Math.round(P.x) - 8
      while (coastDs(wx + 1, y) > 0.5 && wx < 190) wx++
      return wx
    }
    const key = (x: number, y: number) => y * 1000 + x
    const seen = new Set<number>()
    const tiles: HarborTile[] = []
    const push = (t: HarborTile) => {
      const k = key(Math.round(t.tx), Math.round(t.ty))
      if (t.mat !== 'rock') { if (seen.has(k)) return; seen.add(k) }
      tiles.push(t)
    }
    // A DOCK IS A BUILT THING (Ash: the coast-traced quay came out "warped and
    // unusable" / "floating on the ocean"). So the harbor is CLEAN AXIS-ALIGNED
    // GEOMETRY, not a line traced along the jagged coast: one dead-straight shore
    // PROMENADE that always rests on solid sand, and straight rectangular PIER +
    // JETTY jutting seaward over the water (pilings under the sea span). It cannot
    // warp and cannot maroon a tile, by construction. HL 8 = low built edge.
    // ---- THE STILT-PORT NETWORK (v7, Ash 2026-07-16: "grander harbors with
    // NARROWER walkways but expansive and just as grand... not just boring old
    // wood everywhere"). Not a slab: a NETWORK of narrow timber walkways over
    // open water linking PLATFORM PODS, each pod one place with one job —
    // water visible between every arm, the whole port sprawling across the bay:
    //   - a small STONE ARRIVAL COURT on the waterline (the one stone moment)
    //   - the GRAND PIER (2-wide) east to a 4x4 PIERHEAD, the ship's berth
    //   - a NORTH WALK to the MARKET PLATFORM (stalls + bell), with a FLEET
    //     SPUR where the working boats tie up
    //   - a SOUTH WALK to the HARBORMASTER'S STILT PLATFORM (the house stands
    //     OVER the water), the fishing jetty branching east off the walk
    //   - the wide breakwater arc + lighthouse islet enclosing it all
    const HL = 8
    const ryN = ryMid - 6, ryS = ryMid + 6
    // WL = the waterline (last-land tile) at the port's CENTRE row. QX = the
    // network's spine, pushed 2 tiles SEAWARD: rooted at WL the court and pods
    // sat ON the beach and dissolved into the sand read (v7 first cut) — a
    // stilt-port stands over the WATER, tied to land by one gangway.
    const WL = rawWx(ryMid)
    const QX = WL + 2
    const eAt: number[] = []
    for (let y = ryN - 3; y <= ryS + 4; y++) eAt[y] = WL
    // THE STONE ARRIVAL COURT first (push order wins the dedup): 3x3 over the
    // shallows, the gangway's landing — the single material accent
    for (let y = ryMid - 1; y <= ryMid + 1; y++) {
      for (let x = QX - 1; x <= QX + 1; x++) push({ tx: x, ty: y, lift: HL, mat: 'stone', walk: true })
    }
    // the GANGWAY: steps bridging the court back to the dry sand
    push({ tx: QX - 2, ty: ryMid, lift: Math.round(HL / 2), mat: 'plank', walk: true })
    push({ tx: QX - 3, ty: ryMid, lift: Math.round(HL / 4), mat: 'plank', walk: true })
    // THE NORTH WALK: narrow, over the shallows, court -> market platform
    for (let y = ryMid - 4; y <= ryMid - 2; y++) for (let x = QX; x <= QX + 1; x++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // THE MARKET PLATFORM: a 5x4 pod — both stalls' floor, room to walk between
    for (let y = ryMid - 8; y <= ryMid - 5; y++) for (let x = QX - 2; x <= QX + 2; x++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // THE FLEET SPUR: 2-wide east off the market platform — the working boats
    for (let x = QX + 3; x <= QX + 8; x++) for (let y = ryMid - 6; y <= ryMid - 5; y++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // THE SOUTH WALK: court -> the harbormaster's water
    for (let y = ryMid + 2; y <= ryMid + 5; y++) for (let x = QX; x <= QX + 1; x++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // THE HARBORMASTER'S STILT PLATFORM: 4x4 pod OVER the water — the house
    // stands on it (a stilt-port office, not a shack on the lawn)
    for (let y = ryMid + 6; y <= ryMid + 9; y++) for (let x = QX; x <= QX + 3; x++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // THE GRAND PIER: 2-wide, striding due east from the court...
    const PLEN = 12
    for (let x = QX + 2; x <= QX + PLEN; x++) for (let y = ryMid; y <= ryMid + 1; y++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // ...into a 4x4 PIERHEAD pavilion, the ship's berth along its south face
    const HEADX = QX + PLEN + 4
    for (let x = QX + PLEN + 1; x <= HEADX; x++) for (let y = ryMid - 1; y <= ryMid + 2; y++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // THE FISHING JETTY: a short 2-wide finger branching east off the south walk
    const jY = ryMid + 4
    for (let x = QX + 2; x <= QX + 5; x++) for (let y = jY; y <= jY + 1; y++) push({ tx: x, ty: y, lift: HL, mat: 'plank', walk: true })
    // the breakwater: a boulder arm enclosing the basin — thrown WIDE for the
    // v6 scale. GEOMETRY CHECKED against the new pierhead (ends x WL+14, rows
    // ryMid-2..+3): every arc point keeps >=4.5 tiles of clear water off the
    // pierhead and the berth, and the basin reads vast inside it.
    const BW: [number, number][] = [
      [19.5, 4.8], [20.8, 2.6], [21.4, 0.2], [21.2, -2.2], [20.4, -4.5],
      [19, -6.6], [17.1, -8.4], [14.8, -9.8], [12.2, -10.8], [9.4, -11.3], [6.6, -11.4],
    ]
    for (const [ox, oy] of BW) push({ tx: QX + ox, ty: ryMid + oy, lift: 16, mat: 'rock', walk: false })

    // THE MINI-PORTS (P5-lite): the other three landings get their skeleton
    // built form as MORE HARBOR TILES — the deck renderer (planks, skirts,
    // pilings, railings) and the walkmap/audit handle them for free. Same law
    // as the east port: a dock is a BUILT thing, axis-aligned, never traced
    // along the coast. Each is small: a 2-wide finger from its shore.
    const miniJetty = (p: Port, len: number) => {
      // walk from the port point (on land) seaward along the DOMINANT axis
      const sx2 = Math.cos(p.az), sy2 = Math.sin(p.az)
      const ax = Math.abs(sx2) >= Math.abs(sy2) ? Math.sign(sx2) : 0
      const ay = ax === 0 ? Math.sign(sy2) : 0
      let bx2 = Math.round(p.x), by2 = Math.round(p.y)
      // root on genuinely DRY sand (the wet tide flat washes ~3 tiles of the
      // beach — a deck rooted at the ds-0 waterline read as a marooned raft),
      // then run the finger until it stands 2 tiles into real water
      let guard = 0
      while (guard++ < 12 && coastDs(bx2 + ax, by2 + ay) > 0) { bx2 += ax; by2 += ay }
      guard = 0
      while (guard++ < 10 && coastDs(bx2, by2) < 3.2) { bx2 -= ax; by2 -= ay }
      void len
      let i = 0
      while (i < 12 && coastDs(bx2 + ax * (i - 1), by2 + ay * (i - 1)) > -2) {
        const tx = bx2 + ax * i, ty = by2 + ay * i
        // 2-wide across the jetty's off-axis
        push({ tx, ty, lift: 8, mat: 'plank', walk: true })
        push({ tx: tx + (ax === 0 ? 1 : 0), ty: ty + (ay === 0 ? 1 : 0), lift: 8, mat: 'plank', walk: true })
        i++
      }
      return [bx2, by2] as [number, number]
    }
    const N_ROOT = miniJetty(PORTS.north, 4)   // the fishing jetty in the cliff notch
    const S_ROOT = miniJetty(PORTS.south, 4)   // the cargo landing at the cove
    // the west 'cove' stays UNBUILT — a quiet beach is its identity (rowboat +
    // lantern dress it in the renderer, no structure)
    MINI_PORTS = { north: N_ROOT, south: S_ROOT }

    HARBOR = {
      tiles,
      quayRect: [QX - 2, ryMid - 8, 5, 18],
      root: [QX, ryMid],                        // the stone court — where Thor lands
      steps: [QX - 3, ryMid],
      // the intro ship moors along the grand pier's SOUTH face, mid-pier: the
      // south side is IN FRONT in painter order, so the full hull reads against
      // the open water
      berth: [QX + 7, ryMid + 1.85],
      // COMPOSITION = one pod, one job: the bell greets at the court, the
      // market platform sells, the fleet spur moors, the harbormaster's stilt
      // platform holds the house, freight loads at the pierhead, the jetty
      // works fish. Open water between the arms IS the composition.
      bell: [QX - 1, ryMid - 1],                // arrivals bell on the court's north corner
      crane: [QX, ryMid + 1],                   // legacy anchor (crane retired)
      lanterns: [
        [QX - 2, ryMid - 8],                    // market platform corner
        [QX, ryMid + 6],                        // harbormaster platform corner
        [QX + 7.5, ryMid - 0.45],               // mid-pier walk light (the long stride needs a beat)
        [HEADX - 0.6, ryMid - 0.6],             // pierhead mooring light, north corner
        [HEADX - 0.6, ryMid + 1.6],             // pierhead mooring light, south corner
      ],
      // freight staged where hulls actually load: the pierhead yard + a jetty crate
      cargo: [
        [QX + PLEN + 2.5, ryMid + 0.5],
        [QX + 4, jY + 1],
      ],
      sloop: [QX + 9, ryMid - 3.2],             // at anchor in the basin between pier and spur
      sloop2: [QX + 8, jY + 2.4],               // the second fisher off the jetty head
      // hauled up WELL clear of the deck: at -1.4 the hull's bbox rode up over
      // the boardwalk's south rows and read glitched-onto-the-deck (Ash)
      rowboat: [rawWx(ryS + 2) - 3.2, ryS + 2.6],
      beacon: [QX + 6.6, ryMid - 11.4],         // the harbor light at the wide arc's north tip
      pennant: [HEADX, ryMid + 0.5],            // ON the pierhead's seaward edge
      // mooring cleats ONLY where a boat actually ties up
      edgePosts: [[QX + 3.6, jY + 0.5], [QX + 4, ryMid - 6.6], [QX + 7, ryMid - 6.6]],
      bollards: [[QX + PLEN + 1, ryMid + 2.6], [HEADX, ryMid - 1.6]],
    }
  }
  LIGHTHOUSE = [CX + Math.cos(-1.78) * (coastR(-1.78) - 3.5), CY + Math.sin(-1.78) * (coastR(-1.78) - 3.5)]
  BECU_TREE = [CX + Math.cos(-0.85) * (coastR(-0.85) - 13), CY + Math.sin(-0.85) * (coastR(-0.85) - 13)]
  TIDEPOOLS = [CX + Math.cos(0.28) * (coastR(0.28) - 2), CY + Math.sin(0.28) * (coastR(0.28) - 2)]

  // the grove sites: [x, y, radius, strength], authored on the ring by azimuth —
  // composition anchors, every one placed for a reason (port framing, promenade
  // rhythm, bluff crowns, gate approach wings). u lives in the MEADOW RING
  // [0.78..0.9] — inside 0.75 is the cone's toe/flank.
  const at = (az: number, u: number, r: number, s = 0.95): [number, number, number, number] =>
    [CX + Math.cos(az) * coastR(az) * u, CY + Math.sin(az) * coastR(az) * u, r, s]
  GROVES = [
    at(-0.78, 0.87, 3.6),        // east port's south framing stand
    at(-0.28, 0.85, 3.2),        // east port's north framing stand
    at(-1.12, 0.84, 4.2),        // NE fringe grove
    at(-1.55, 0.82, 3.4),        // north meadow grove
    at(-1.95, 0.8, 4.4),         // north bluff crown (behind the lighthouse)
    at(-2.4, 0.78, 3.6),         // NW cliff-top stand
    at(3.08, 0.82, 4.4),         // back-cliff crown west
    at(-2.9, 0.79, 3.8),         // back-cliff crown east
    at(-2.62, 0.86, 3.4),        // back fringe stand
    at(2.85, 0.82, 4.2),         // NW lawn grove
    at(2.5, 0.86, 3.2),          // west cove's sheltering stand
    at(2.1, 0.8, 3.8),           // west ring grove
    at(1.55, 0.82, 4.0),         // SW meadow grove
    at(1.18, 0.86, 3.2),         // south cove west wing
    at(0.98, 0.8, 2.8),          // plaza's west shoulder
    at(0.62, 0.82, 3.0),         // plaza's east shoulder
    at(0.15, 0.84, 4.0),         // SE lagoon grove
    at(-0.05, 0.78, 3.4),        // gate approach east wing
  ]
}

// safe defaults so nothing explodes if a consumer reads before init (dev edge)
initHubLayout()
