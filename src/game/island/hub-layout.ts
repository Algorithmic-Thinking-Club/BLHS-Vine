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

import { CX, CY, coastR, coastDs, lavaDist, HEAD_R } from './terrain'
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

const GRID = 200
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
  const plazaAz = 0.86
  PLAZA = [CX + Math.cos(plazaAz) * 42, CY + Math.sin(plazaAz) * 42]
  for (let r = coastR(plazaAz) - 6; r >= 33; r -= 0.5) {
    const px = CX + Math.cos(plazaAz) * r, py = CY + Math.sin(plazaAz) * r
    if (coastDs(px, py) > 5.5 && coneH(px, py) < 1.2) { PLAZA = [px, py]; break }
  }

  // THE GATE: Thor enters the Maw THROUGH the SE panther head's mouth — its lava
  // flow splits around a carved tongue-stair climbing the toe to the mouth.
  GATE_HEAD = HEAD_R
  {
    const az = Math.atan2(GATE_HEAD[1] - CY, GATE_HEAD[0] - CX)
    const d0 = Math.hypot(GATE_HEAD[0] - CX, GATE_HEAD[1] - CY)
    TONGUE = [0, 0.33, 0.66, 1].map((t) => {
      const d = d0 + (30 - d0) * (1 - t)
      return [CX + Math.cos(az) * d, CY + Math.sin(az) * d] as [number, number]
    })
  }

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
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1]
      const L = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(2, Math.ceil(L / 0.12))
      for (let s = 0; s <= steps; s++) {
        const x = x0 + ((x1 - x0) * s) / steps
        const y = y0 + ((y1 - y0) * s) / steps
        const cx = Math.round(x), cy = Math.round(y)
        PATH_SET.add(cy * GRID + cx)
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (Math.hypot(cx + ox - x, cy + oy - y) < 0.72) PATH_SET.add((cy + oy) * GRID + cx + ox)
        }
      }
    }
  }

  // THE RIVER (spring on the south flank -> falls at the bench lip -> cove estuary)
  RIVER = ([[114, 106], [119, 110], [124, 115], [128, 120], [131, 124]] as [number, number][]).map(([x, y]) => SC(x, y))
  FALLS = RIVER[2]

  // POIs (the landmark destinations that make the island worth walking)
  STELES = Array.from({ length: 5 }, (_, i) => {
    const t = (i + 1) / 6
    const x = PLAZA[0] + (TONGUE[0][0] - PLAZA[0]) * t
    const y = PLAZA[1] + (TONGUE[0][1] - PLAZA[1]) * t
    return [x + Math.sin(i * 2.4) * 1.6, y + Math.cos(i * 2.4) * 1.6] as [number, number]
  })
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
