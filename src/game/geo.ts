// Geometry + isometric projection for the BLHS overworld.
// The campus model is in real feet (origin = building centroid). We keep the real SHAPE and
// relative layout from the aerial, but project to a game-scaled isometric world that Thor
// explores with a follow camera (the world is several screens wide, like Stardew/TavernWorld).

export type Pt = [number, number] // world feet [x east, y south]
export type Vec = { sx: number; sy: number } // iso screen pixels

// Projection knobs. 2:1 isometric. Tuned so the main building reads ~1000px wide on screen
// and Thor (a ~64px sprite) sits believably against a door. Raise SCALE to zoom the world in.
export const SCALE_X = 0.86
export const SCALE_Y = 0.43

export function iso(wx: number, wy: number): Vec {
  return { sx: (wx - wy) * SCALE_X, sy: (wx + wy) * SCALE_Y }
}

// inverse: screen pixels (world space, pre-camera) back to feet
export function unIso(sx: number, sy: number): Pt {
  const a = sx / SCALE_X // wx - wy
  const b = sy / SCALE_Y // wx + wy
  return [(a + b) / 2, (b - a) / 2]
}

export function bbox(poly: Pt[]) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const [x, y] of poly) {
    if (x < minx) minx = x
    if (y < miny) miny = y
    if (x > maxx) maxx = x
    if (y > maxy) maxy = y
  }
  return { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny }
}

export function centroid(poly: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    const cross = x0 * y1 - x1 * y0
    a += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-6) {
    // degenerate: average the verts
    const m = poly.reduce((s, p) => [s[0] + p[0], s[1] + p[1]] as Pt, [0, 0] as Pt)
    return [m[0] / poly.length, m[1] / poly.length]
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function signedArea(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

export function pointInPoly(px: number, py: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const hit = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

// distance from point to a segment, in feet
export function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

export function distToPolyline(px: number, py: number, line: Pt[]): number {
  let d = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    d = Math.min(d, distToSeg(px, py, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]))
  }
  return d
}

// Ramer-Douglas-Peucker simplify (feet epsilon). Cleans the jagged OSM footprint for tidy massing.
export function simplify(poly: Pt[], eps: number): Pt[] {
  if (poly.length < 3) return poly
  const keep = new Array(poly.length).fill(false)
  keep[0] = true
  keep[poly.length - 1] = true
  const stack: [number, number][] = [[0, poly.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let dmax = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = distToSeg(poly[i][0], poly[i][1], poly[s][0], poly[s][1], poly[e][0], poly[e][1])
      if (d > dmax) { dmax = d; idx = i }
    }
    if (dmax > eps && idx !== -1) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return poly.filter((_, i) => keep[i])
}
