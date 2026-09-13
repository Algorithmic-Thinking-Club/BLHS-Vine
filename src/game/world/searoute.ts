/* A CLEAN LINE OVER WATER, FOUND RATHER THAN HOPED FOR.
 *
 * ASH, after watching the ship sail to ATC: *"like what the fuck is the ship doing.
 * and most of the time, it doesnt even end on the right orientation. it does some
 * RANDOM sailing. it doesnt find a clean path. it does crazy turns, shitty turns."*
 *
 * Measured on the shipped crossing with `scripts/sailing-measure.mjs`: she was AGROUND
 * for 49 of 229 frames, a fifth of the whole voyage, and sailed 2053 units of a 1065
 * unit crossing, which is 1.93 times further than the straight line. That is not a
 * boat sailing badly, it is a boat with no idea where the land is: every helm in the
 * game aims at the destination and lets `stepHull`'s coast clause slide her along
 * whatever she hits. On open water that is invisible. On an archipelago it is a hull
 * grinding down a shoreline in a series of hard corrections, which is exactly what he
 * watched.
 *
 * So the ship gets a route. A* over a coarse grid of the depth field, then the corners
 * pulled out of it so what is left is the smallest number of straight runs that stay
 * in water. It is the same shape as the walk law's own `findPath` and deliberately so:
 * a body and a hull both want the shortest legal line, and neither should be steered
 * by something that cannot see a wall.
 */

export type Pt = { x: number; y: number }
/** is there enough water at this point for the hull, probe and all */
export type Water = (x: number, y: number) => boolean

export type SeaRouteOpts = {
  /** grid pitch in world pixels. Coarse is fine: the pull-out puts the corners back. */
  step?: number
  /** how many cells the search may open before it gives up */
  budget?: number
}

/* the eight ways off a cell, diagonals last so a tie goes to a square move */
const WAYS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/** every point on the segment is water, sampled at half the grid pitch */
export function clearWater(a: Pt, b: Pt, water: Water, step = 16): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(2, step / 2)))
  for (let i = 0; i <= n; i++) {
    const k = i / n
    if (!water(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)) return false
  }
  return true
}

/* ---- THE CORNERS COME BACK OUT ------------------------------------------
 *
 * A grid path is a staircase, and a hull steered at a staircase turns on every step.
 * String pulling walks the list and keeps only the points the line cannot see past,
 * so a crossing over open water comes back as two points and a crossing round a
 * headland comes back as three. This is the difference between a boat that turns
 * twice and a boat that turns forty times. */
export function pullTaut(pts: Pt[], water: Water, step: number): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    /* the furthest point still in sight of where we stand */
    while (j > i + 1 && !clearWater(pts[i], pts[j], water, step)) j--
    out.push(pts[j])
    i = j
  }
  return out
}

/** the nearest cell centre with water in it, spiralling out from a point that has none */
function nearestWater(p: Pt, water: Water, step: number, rings = 6): Pt | null {
  if (water(p.x, p.y)) return p
  for (let r = 1; r <= rings; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const q = { x: p.x + dx * step, y: p.y + dy * step }
        if (water(q.x, q.y)) return q
      }
    }
  }
  return null
}

/**
 * The line a hull should steer, from where she is to where she is going, over water
 * only. Returns the waypoints INCLUDING the destination, or null when there is no way
 * through at this pitch, which is an honest answer and not a failure: the caller falls
 * back to the old aim-and-slide rather than pretending a route exists.
 */
export function seaRoute(from: Pt, to: Pt, water: Water, opts: SeaRouteOpts = {}): Pt[] | null {
  const step = opts.step ?? 24
  const budget = opts.budget ?? 9000

  /* THE STRAIGHT LINE FIRST, because most crossings are one. An A* that opens nine
   * thousand cells to answer "sail forwards" is a waste of a Chromebook's frame. */
  if (clearWater(from, to, water, step)) return [to]

  const start = nearestWater(from, water, step)
  const goal = nearestWater(to, water, step)
  if (!start || !goal) return null

  /* the grid is anchored on the start, so `from` is always cell 0,0 and nothing has
   * to be rounded into a world-space origin that may not exist */
  const key = (cx: number, cy: number) => cx + ',' + cy
  const at = (cx: number, cy: number): Pt => ({ x: start.x + cx * step, y: start.y + cy * step })
  const gx = Math.round((goal.x - start.x) / step)
  const gy = Math.round((goal.y - start.y) / step)
  const h = (cx: number, cy: number) => Math.hypot(cx - gx, cy - gy)

  const g = new Map<string, number>([[key(0, 0), 0]])
  const came = new Map<string, string>()
  /* a plain array kept in order. A binary heap is the textbook answer and this list
   * never holds enough to pay for one: the budget caps it. */
  const open: Array<{ cx: number; cy: number; f: number }> = [{ cx: 0, cy: 0, f: h(0, 0) }]
  const shut = new Set<string>()
  let opened = 0

  while (open.length) {
    let best = 0
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i
    const cur = open.splice(best, 1)[0]
    const ck = key(cur.cx, cur.cy)
    if (shut.has(ck)) continue
    shut.add(ck)
    if (cur.cx === gx && cur.cy === gy) break
    if (++opened > budget) return null

    for (const [dx, dy] of WAYS) {
      const nx = cur.cx + dx, ny = cur.cy + dy
      const nk = key(nx, ny)
      if (shut.has(nk)) continue
      const np = at(nx, ny)
      if (!water(np.x, np.y)) continue
      /* A DIAGONAL MAY NOT CUT A CORNER OF LAND, which is how a grid route ends up
       * clipping a headland it never opened a cell on. */
      if (dx && dy) {
        const a = at(cur.cx + dx, cur.cy)
        const b = at(cur.cx, cur.cy + dy)
        if (!water(a.x, a.y) || !water(b.x, b.y)) continue
      }
      const cost = (g.get(ck) ?? 0) + (dx && dy ? Math.SQRT2 : 1)
      if (cost >= (g.get(nk) ?? Infinity)) continue
      g.set(nk, cost)
      came.set(nk, ck)
      open.push({ cx: nx, cy: ny, f: cost + h(nx, ny) })
    }
  }

  if (!shut.has(key(gx, gy))) return null

  const back: Pt[] = []
  let k: string | undefined = key(gx, gy)
  while (k) {
    const [cx, cy] = k.split(',').map(Number)
    back.push(at(cx, cy))
    k = came.get(k)
  }
  back.reverse()
  /* the real destination replaces the cell that stood in for it, then the corners
   * come out. The first point is where she already is, so it is dropped. */
  back[back.length - 1] = to
  return pullTaut([from, ...back], water, step).slice(1)
}
