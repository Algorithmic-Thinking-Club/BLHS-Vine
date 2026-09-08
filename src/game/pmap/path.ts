/* finding a walkable route over the level mask, using the same walk law the body obeys */
import { canStandFrom, type MaskDoc, type WalkCfg } from './walk'

export type Pt = { x: number; y: number }

export type PathOpts = {
  /** painting pixels per search step. Smaller is finer and slower. */
  step?: number
  /** how close to the goal counts as arrived, in painting pixels */
  reach?: number
  /** a ceiling on the search, so a goal walled off from the player cannot hang a frame */
  maxNodes?: number
}

const KEY = (cx: number, cy: number) => cy * 100000 + cx

/* the eight neighbours, straight ones first so a route through open ground comes
 * out square rather than staircased for no reason */
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/* the route, plus whether it actually got there, since a blocked search returns its best try */
export type PathResult = { points: Pt[]; reached: boolean; nodes: number }

export function findPath(
  doc: MaskDoc,
  cfg: WalkCfg,
  from: Pt,
  to: Pt,
  opts: PathOpts = {},
): PathResult {
  const step = Math.max(1, Math.round(opts.step ?? 4))
  const reach = opts.reach ?? Math.max(step * 2, 10)
  const maxNodes = opts.maxNodes ?? 40_000
  /* the y step is the x step foreshortened by the painting's own factor, so one
   * grid move is one move's worth of ground whichever way it goes. The walker is
   * scaled the same way in walk.ts, which is why it is the same number. */
  const ys = cfg.yScale || 1

  const gx = (x: number) => Math.round(x / step)
  const gy = (y: number) => Math.round(y / (step * ys))
  const wx = (cx: number) => cx * step
  const wy = (cy: number) => cy * step * ys

  const startC = { cx: gx(from.x), cy: gy(from.y) }

  /* ALREADY THERE. Checked before the search rather than inside it, because a
   * goal a step away should not cost a flood fill. */
  if (Math.hypot(to.x - from.x, (to.y - from.y) / ys) <= reach)
    return { points: [{ x: to.x, y: to.y }], reached: true, nodes: 0 }

  const came = new Map<number, number>()
  const seen = new Set<number>([KEY(startC.cx, startC.cy)])
  let q: { cx: number; cy: number }[] = [startC]
  let nodes = 0
  let best = { cx: startC.cx, cy: startC.cy }
  let bestD = Math.hypot(wx(startC.cx) - to.x, (wy(startC.cy) - to.y) / ys)
  let found: { cx: number; cy: number } | null = null

  /* breadth-first, since every step on this grid costs the same, bounded by the node cap */
  while (q.length && nodes < maxNodes) {
    const next: typeof q = []
    for (const cur of q) {
      nodes++
      if (nodes > maxNodes) break
      const cwx = wx(cur.cx), cwy = wy(cur.cy)
      const d = Math.hypot(cwx - to.x, (cwy - to.y) / ys)
      if (d < bestD) { bestD = d; best = cur }
      if (d <= reach) { found = cur; break }

      const fromLvl = doc.lvlAt(cwx, cwy)
      for (const [dx, dy] of DIRS) {
        const nc = { cx: cur.cx + dx, cy: cur.cy + dy }
        const k = KEY(nc.cx, nc.cy)
        if (seen.has(k)) continue
        const nwx = wx(nc.cx), nwy = wy(nc.cy)
        /* THE LAW, unchanged: this is the same call the ticker makes for the
         * player's own next pixel, with the same document and the same config. */
        if (!canStandFrom(doc, cfg, nwx, nwy, fromLvl)) continue
        seen.add(k)
        came.set(k, KEY(cur.cx, cur.cy))
        next.push(nc)
      }
    }
    if (found) break
    q = next
  }

  const end = found ?? best
  const points: Pt[] = []
  let k: number | undefined = KEY(end.cx, end.cy)
  const startK = KEY(startC.cx, startC.cy)
  while (k !== undefined && k !== startK) {
    const cx = k % 100000
    const cy = (k - cx) / 100000
    points.push({ x: wx(cx), y: wy(cy) })
    k = came.get(k)
  }
  points.reverse()
  /* the last hop is the real goal rather than the grid cell nearest it, so the
   * arrow lands on the table instead of four pixels beside it */
  if (found) points.push({ x: to.x, y: to.y })
  return { points, reached: !!found, nodes }
}

/* the point a set distance along the route, which is where the guiding arrow sits */
export function aheadOn(points: Pt[], from: Pt, ahead: number, yScale = 1): Pt | null {
  if (!points.length) return null
  const ys = yScale || 1
  let run = 0
  let prev = from
  for (const p of points) {
    run += Math.hypot(p.x - prev.x, (p.y - prev.y) / ys)
    prev = p
    if (run >= ahead) return p
  }
  return points[points.length - 1]
}

/* move a goal that is not on the floor, like a door, to the nearest pixel a body can stand on */
export function onFloor(
  spot: Pt,
  standable: (x: number, y: number) => boolean,
  yScale = 1,
  within = 24,
): { at: Pt; moved: boolean } {
  if (standable(spot.x, spot.y)) return { at: spot, moved: false }
  const ys = yScale || 1
  let best: Pt | null = null
  let bestD = Infinity
  /* the box is squashed the same way the metric is, so the search looks at the
   * ground the metric considers near rather than at a circle on the screen */
  const x0 = Math.ceil(spot.x - within), x1 = Math.floor(spot.x + within)
  const y0 = Math.ceil(spot.y - within * ys), y1 = Math.floor(spot.y + within * ys)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - spot.x, (y - spot.y) / ys)
      if (d > within || d >= bestD) continue
      if (!standable(x, y)) continue
      bestD = d; best = { x, y }
    }
  }
  /* with no floor within reach the original spot is kept rather than moved somewhere random */
  return best ? { at: best, moved: true } : { at: spot, moved: false }
}
