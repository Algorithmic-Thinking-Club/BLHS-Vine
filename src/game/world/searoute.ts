/* the ship gets a route: aiming at the destination and letting `stepHull`'s coast clause slide her along the shore measured aground 49 of 229 frames and 2053 units over a 1065 unit crossing, 1.93 times the straight line, so A* over a coarse grid of the depth field with the corners pulled out */

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

/* a grid path is a staircase and a hull steered at one turns on every step, so string pulling keeps only the points the line cannot see past: two points over open water, three round a headland */
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

/** the line a hull should steer from where she is to where she is going, over water only, returning the waypoints including the destination or null when there is no way through at this pitch, so the caller falls back to aim-and-slide rather than pretending a route exists */
export function seaRoute(from: Pt, to: Pt, water: Water, opts: SeaRouteOpts = {}): Pt[] | null {
  const step = opts.step ?? 24
  const budget = opts.budget ?? 9000

  /* the straight line first, because most crossings are one and an A* opening nine thousand cells to answer "sail forwards" wastes a Chromebook's frame */
  if (clearWater(from, to, water, step)) return [to]

  const start = nearestWater(from, water, step)
  const goal = nearestWater(to, water, step)
  if (!start || !goal) return null

  /* the grid is anchored on the start, so `from` is always cell 0,0 and nothing has to be rounded into a world-space origin that may not exist */
  const key = (cx: number, cy: number) => cx + ',' + cy
  const at = (cx: number, cy: number): Pt => ({ x: start.x + cx * step, y: start.y + cy * step })
  const gx = Math.round((goal.x - start.x) / step)
  const gy = Math.round((goal.y - start.y) / step)
  const h = (cx: number, cy: number) => Math.hypot(cx - gx, cy - gy)

  const g = new Map<string, number>([[key(0, 0), 0]])
  const came = new Map<string, string>()
  /* a plain array kept in order, because the budget caps its length and it never holds enough to pay for a binary heap */
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
      /* a diagonal may not cut a corner of land, which is how a grid route ends up clipping a headland it never opened a cell on */
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
  /* the real destination replaces the cell that stood in for it, then the corners come out, and the first point is where she already is so it is dropped */
  back[back.length - 1] = to
  return pullTaut([from, ...back], water, step).slice(1)
}
