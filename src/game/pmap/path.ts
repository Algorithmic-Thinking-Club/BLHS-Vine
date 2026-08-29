/* PATHING OVER THE LEVEL MASK, BY THE WALK CONTRACT.
 *
 * `guide_to` pointed. It put a marker over the objective and left the player to
 * work out how to get there, which is right on an open platform and useless the
 * moment there is a wall in the way. Ash's own example of an engine capability was
 * an arrow "following walkability", and that is a search over the mask rather than
 * a line drawn between two points.
 *
 * IT ASKS THE SAME LAW THE BODY OBEYS AND NEVER A SECOND OPINION. Legality here is
 * `canStandFrom(doc, cfg, x, y, fromLevel)` out of walk.ts, which is MAPVIS's own
 * file copied verbatim: feet plus two hip probes, all three standing, all three
 * agreeing on level within `stepTolerance`. A path found by any other test is a
 * path the walker cannot walk, and the failure looks like a bug in the arrow
 * rather than in the search. MAPVIS's site/Walk.tsx is the cautionary tale: a
 * second reading of this law drifted four ways and produced invisible walls and a
 * character who could walk off the quay.
 *
 * WHY A COARSE GRID. A hub painting is 688x640, which is 440,320 cells, and a
 * guide is recomputed whenever the player has moved. Stepping the search on a grid
 * of a few painting pixels cuts the work by the square of the step while changing
 * nothing about which side of a wall a route goes, because the wall is thicker
 * than the step. The step is a parameter so a map with thin architecture can drop
 * it, and the y axis is squashed by the painting's own `yScale` so a diagonal step
 * covers the same ground on screen as a straight one.
 *
 * WHY IT IS ITS OWN FILE. It is pure: coordinates in, coordinates out, no Pixi, no
 * scene, no clock. That is what makes it testable without a browser, which is the
 * only reason anybody will ever know whether it still works.
 */
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

/* WHAT COMES BACK, and `reached` is the half that matters as much as the route.
 *
 * A search that cannot get there returns the best it managed with `reached:
 * false`, rather than nothing. An arrow that vanishes when the way is shut tells
 * the player nothing; an arrow that points at the closest the route gets, plus a
 * caller that knows it is not a real route, can say "not from here" honestly. */
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

  /* Breadth-first rather than A*, and the reason is honesty rather than laziness:
   * every step here costs the same (the grid is uniform and the walk law does not
   * charge more for a ramp), so BFS is already shortest-first and an A* heuristic
   * would only reorder the queue. The node cap is what bounds it, not the
   * heuristic. */
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

/* THE POINT THE ARROW SITS ON: far enough along the route to say "that way",
 * near enough to still be about where the player is standing. Measured along the
 * route rather than as a straight distance, so a corridor doubling back does not
 * put the arrow on the far side of a wall the player has not reached yet. */
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
