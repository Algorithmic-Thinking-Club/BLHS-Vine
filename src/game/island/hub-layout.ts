// THE HUB ISLAND'S MASTER LAYOUT — every PLACE as authored data, no art (Phase A of
// docs/place-specs/hub-island-method.md). This module is the one truth the renderer,
// the vegetation placer, the prop passes and (later) walkability all read, so the whole
// island is ONE designed place instead of decorated pockets. GAME-DESIGN §3.2 gives the
// bones (four ports, paths inward, the gate, the Maw, the lighthouse, the steles); the
// where/how here is the builder's layout.
//
// Compass note (repeated everywhere because it bites): SCREEN angle = tile azimuth + 45°.
// screen-E = az -PI/4 · screen-S = +PI/4 · screen-W = 3PI/4 · screen-N = -3PI/4.
// The lagoon window (az -0.55) is the screen-E/SE arrival water; the cove (az 0.79) is
// the screen-S pocket; the cliff arc wraps screen W -> NW -> N.

import { CX, CY, coastR, coastDs, cliffK, lavaDist, HEAD_R } from './terrain'
import { coneH, gullyK } from './volcano'
import { vnoise } from '../ocean'

// ---- THE ONE SUN (locked golden hour, upper-left): every cast shadow on the island
// lies along this screen direction. Length scales with the asset's height; the beach
// proved shadows must be DENSE enough to register under the warm grade.
export const SHADOW = { dx: 0.92, dy: 0.39, alpha: 0.65 }

// ---- THE FOUR PORTS (GAME-DESIGN §3.2: each a purpose-built working dock; the intro
// arrives EAST). Azimuths chosen on the real coast grammar: E + S sit in the designed
// sand windows; W is a sheltered pocket cove notched between the tall west cliffs;
// N is a fishing jetty tucked into a cliff notch (nets, no sand).
export type Port = { az: number; x: number; y: number; kind: 'arrival' | 'cargo' | 'cove' | 'nets' }
const portAt = (az: number, kind: Port['kind'], back = 1): Port => ({
  az, kind,
  x: CX + Math.cos(az) * (coastR(az) - back),
  y: CY + Math.sin(az) * (coastR(az) - back),
})
export const PORTS: Record<'east' | 'south' | 'west' | 'north', Port> = {
  east: portAt(-0.52, 'arrival', 0.5),   // the lagoon's inner shore — the intro pier
  south: portAt(0.82, 'cargo', 0.5),     // the cove pocket, serving the plaza
  west: portAt(2.62, 'cove', 0.5),       // the quiet cove (cliff notch, small beach)
  north: portAt(-2.05, 'nets', 2.0),     // cliff-foot fishing jetty in a notch
}

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

// ---- THE PLAZA (the gate forecourt): on the flat south front ring, between the two
// lava deltas, where the promenade, the cargo port and the gate approach meet.
const plazaAz = 0.86
function findPlaza(): [number, number] {
  for (let r = 47; r >= 33; r -= 0.5) {
    const px = CX + Math.cos(plazaAz) * r, py = CY + Math.sin(plazaAz) * r
    if (coastDs(px, py) > 5.5 && coneH(px, py) < 1.2) return [px, py]
  }
  return [CX + Math.cos(plazaAz) * 42, CY + Math.sin(plazaAz) * 42]
}
export const PLAZA: [number, number] = findPlaza()
export const PLAZA_R = 5.5

// ---- THE GATE (the single most screenshot-able place in the game, GAME-DESIGN §3.2):
// Thor enters the Maw THROUGH the SE panther head's mouth — its lava flow splits around
// a carved tongue-stair. The stair climbs the toe from the approach path to the mouth.
export const GATE_HEAD: [number, number] = HEAD_R          // the SE head is the gate
export const TONGUE: [number, number][] = (() => {
  // from the toe below the head straight up the flank to the mouth (radial line)
  const az = Math.atan2(GATE_HEAD[1] - CY, GATE_HEAD[0] - CX)
  const d0 = Math.hypot(GATE_HEAD[0] - CX, GATE_HEAD[1] - CY)
  return [0, 0.33, 0.66, 1].map((t) => {
    const d = d0 + (30 - d0) * (1 - t)
    return [CX + Math.cos(az) * d, CY + Math.sin(az) * d] as [number, number]
  })
})()

// ---- PATHS (the walkable spine): the coast PROMENADE stitches E port -> S cove ->
// plaza -> W lawn; spurs feed it from each port; the APPROACH climbs from the plaza
// toward the gate stair; the NW branch opens the back lawn.
const ringPath = (az0: number, az1: number, back: number, steps: number): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const az = az0 + (az1 - az0) * (i / steps)
    const r = coastR(az) - back
    return [CX + Math.cos(az) * r, CY + Math.sin(az) * r] as [number, number]
  })
const SC = (x: number, y: number): [number, number] => [CX + (x - CX) * 1.32, CY + (y - CY) * 1.32]
export const PROMENADE = ringPath(-0.62, 2.72, 8, 34)
export const PATH_NW: [number, number][] = ([[121, 95], [112, 88], [102, 82], [92, 76], [82, 74], [73, 78], [68, 86]] as [number, number][]).map(([x, y]) => SC(x, y))
export const APPROACH: [number, number][] = [PLAZA, ...TONGUE.slice(0, 2)]
// port spurs: each port walks inward to the promenade ring
const spur = (p: Port, len = 6): [number, number][] => [
  [p.x, p.y],
  [CX + Math.cos(p.az) * (coastR(p.az) - 8 - len * 0.4), CY + Math.sin(p.az) * (coastR(p.az) - 8 - len * 0.4)],
]
export const SPURS: [number, number][][] = [spur(PORTS.east), spur(PORTS.south), spur(PORTS.west), spur(PORTS.north, 4)]
export const PATHS: [number, number][][] = [PROMENADE, PATH_NW, APPROACH, ...SPURS]

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

// the paths RASTERIZED to a connected 1-2 tile ribbon (distance-thresholding a
// diagonal polyline against tile centers produced a broken dash-line — the ribbon
// walks every segment and marks the tiles it truly passes through, plus any
// neighbour close enough to widen a pinch to two tiles)
const GRID = 200
const PATH_SET = new Set<number>()
{
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
}
export const onPathTile = (tx: number, ty: number) => PATH_SET.has(ty * GRID + tx)

// ---- THE RIVER (spring on the south flank -> falls at the bench lip -> cove estuary).
export const RIVER: [number, number][] = ([[114, 106], [119, 110], [124, 115], [128, 120], [131, 124]] as [number, number][]).map(([x, y]) => SC(x, y))
export const riverD = (tx: number, ty: number) => segD(RIVER, tx, ty)
export const FALLS: [number, number] = RIVER[2]   // where the flow drops the benches

// ---- POIs (the landmark destinations that make the island worth walking,
// GAME-DESIGN §3.2 outdoor features + hidden spots)
export const STELES: [number, number][] = Array.from({ length: 5 }, (_, i) => {
  // the POWER walk: five basalt steles pacing the approach from the plaza toward the stair
  const t = (i + 1) / 6
  const x = PLAZA[0] + (TONGUE[0][0] - PLAZA[0]) * t
  const y = PLAZA[1] + (TONGUE[0][1] - PLAZA[1]) * t
  return [x + Math.sin(i * 2.4) * 1.6, y + Math.cos(i * 2.4) * 1.6] as [number, number]
})
export const LIGHTHOUSE: [number, number] = (() => {
  // the panther-head lighthouse on the N cliff bluff overlooking the arrival lagoon
  const az = -1.78
  return [CX + Math.cos(az) * (coastR(az) - 3.5), CY + Math.sin(az) * (coastR(az) - 3.5)]
})()
export const BECU_TREE: [number, number] = (() => {
  // the treehouse easter egg, tucked in the east jungle belt off the arrival spur
  const az = -0.85
  return [CX + Math.cos(az) * (coastR(az) - 13), CY + Math.sin(az) * (coastR(az) - 13)]
})()
export const TIDEPOOLS: [number, number] = (() => {
  // hidden tidepool shelf on the SE beach beyond the lava delta
  const az = 0.28
  return [CX + Math.cos(az) * (coastR(az) - 2), CY + Math.sin(az) * (coastR(az) - 2)]
})()

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

// ---- THE VEGETATION DENSITY FIELD, 0..1 (Phase B's placement truth). c3's grammar:
// a dense jungle BELT rides the cone's gentle toe and the inland ring; groves fringe
// the beach benches with cluster-gap rhythm; gully tongues drag green up the flank;
// the south front stays open meadow so the plaza/gate composition reads.
export function vegK(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds <= 1.2) return 0                       // never on the sand/sea
  const h = coneH(tx, ty)
  if (h > 7) return gullyK(tx, ty) > 0.55 && h < 26 ? 0.5 : 0   // only gully tongues climb
  const az = Math.atan2(ty - CY, tx - CX)
  const d = Math.hypot(tx - CX, ty - CY)
  const R = coastR(az)
  // the belt: strongest where the toe meets the ring (d ~ 0.55R..0.8R)
  const u = d / R
  let k = 0.85 * Math.exp(-Math.pow((u - 0.68) / 0.16, 2))
  // coast-fringe groves behind the benches
  k += 0.55 * Math.exp(-Math.pow((u - 0.9) / 0.07, 2))
  // azimuth character: the back (screen N/W cliffs) grows wild, the south front opens
  // for the plaza/gate stage, the east arrival keeps framed view lines
  const back = Math.max(cliffK(az), 0)
  k *= 1 + 0.35 * back
  const front = Math.max(0, Math.cos(az - plazaAz))            // 1 toward the south front
  k *= 1 - 0.45 * front * front
  // large-scale organic drift so the belt has bays and headlands of its own
  k *= 0.7 + 0.6 * vnoise(tx / 18 + 4, ty / 18 + 9)
  // clearings win
  k *= 1 - clearingK(tx, ty)
  return Math.max(0, Math.min(1, k))
}
