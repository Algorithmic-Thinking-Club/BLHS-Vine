/* THE ARROW GOES ROUND THE WALL, and it goes round it by the same law the body
 * walks by. These are built on hand-drawn masks rather than on a real bundle, so
 * a failure names the geometry rather than the map.
 *
 * The level encoding is MAPVIS's: 0 is blocked, 40 is L0, and a step is legal when
 * the two levels differ by no more than `stepTolerance`. The hip probes read the
 * row ABOVE the feet, which is why every corridor below is at least three pixels
 * tall: a one-pixel line is not walkable and never was.
 */
import { describe, it, expect } from 'vitest'
import { findPath, aheadOn } from './path'
import { defaultCfg, canStandFrom, type MaskDoc, type WalkCfg } from './walk'

const W = 60, H = 40

/** a document over a grid of level values, in the shape walk.ts asks for */
function docOf(lvl: Uint8Array): MaskDoc {
  return {
    W, H, lvl, hits: new Uint8Array(W * H), spawn: [0, 0],
    idx: (x, y) => y * W + x,
    inB: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
    lvlAt: (x, y) => {
      const xi = Math.round(x), yi = Math.round(y)
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
      return lvl[yi * W + xi]
    },
    markHit: () => { /* the game has nowhere to put a hits layer */ },
  }
}

const cfg = (over: Partial<WalkCfg> = {}): WalkCfg => ({
  ...defaultCfg(), hip: 2, hipDY: 1, near: 10, yScale: 1, ...over,
})

/** an open floor at level 40 with a solid border of blocked pixels */
function openField(): Uint8Array {
  const lvl = new Uint8Array(W * H)
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) lvl[y * W + x] = 40
  return lvl
}

describe('an open floor', () => {
  it('finds a route and it is roughly the straight line', () => {
    const doc = docOf(openField())
    const r = findPath(doc, cfg(), { x: 6, y: 20 }, { x: 50, y: 20 }, { step: 2 })
    expect(r.reached).toBe(true)
    // nothing is in the way, so the route should not wander far off the row
    for (const p of r.points) expect(Math.abs(p.y - 20)).toBeLessThan(6)
  })

  it('answers immediately when the goal is already underfoot', () => {
    const doc = docOf(openField())
    const r = findPath(doc, cfg(), { x: 20, y: 20 }, { x: 22, y: 20 }, { step: 2, reach: 10 })
    expect(r.reached).toBe(true)
    expect(r.nodes).toBe(0)
  })
})

describe('a wall in the way', () => {
  /** the same field with a vertical wall down the middle and a gap at the bottom */
  function walled(gapTop: number, gapBottom: number): Uint8Array {
    const lvl = openField()
    for (let y = 2; y < H - 2; y++) {
      if (y >= gapTop && y <= gapBottom) continue
      for (let x = 28; x <= 32; x++) lvl[y * W + x] = 0
    }
    return lvl
  }

  it('routes THROUGH THE GAP rather than through the wall', () => {
    const doc = docOf(walled(30, 35))
    const r = findPath(doc, cfg(), { x: 8, y: 8 }, { x: 50, y: 8 }, { step: 2 })
    expect(r.reached).toBe(true)
    // every point on the route must be somewhere the walker could actually stand
    for (const p of r.points.slice(0, -1)) {
      expect(canStandFrom(doc, cfg(), p.x, p.y, doc.lvlAt(p.x, p.y)), `${p.x},${p.y}`).toBe(true)
    }
    // and it must dip toward the gap instead of cutting straight across
    const crossing = r.points.find((p) => p.x >= 28 && p.x <= 32)
    expect(crossing, 'the route never crosses the wall line at all').toBeTruthy()
    expect(crossing!.y).toBeGreaterThan(25)
  })

  it('says it did NOT reach a goal walled off completely, and still points somewhere', () => {
    const lvl = openField()
    for (let y = 2; y < H - 2; y++) for (let x = 28; x <= 32; x++) lvl[y * W + x] = 0
    const r = findPath(docOf(lvl), cfg(), { x: 8, y: 8 }, { x: 50, y: 8 }, { step: 2 })
    expect(r.reached).toBe(false)
    // the best it managed is still a real place, so the arrow can say "this far"
    expect(r.points.length).toBeGreaterThan(0)
  })

  it('never returns more nodes than its own cap, so a sealed goal cannot hang a frame', () => {
    const lvl = openField()
    for (let y = 2; y < H - 2; y++) for (let x = 28; x <= 32; x++) lvl[y * W + x] = 0
    const r = findPath(docOf(lvl), cfg(), { x: 8, y: 8 }, { x: 50, y: 8 }, { step: 1, maxNodes: 50 })
    expect(r.nodes).toBeLessThanOrEqual(51)
  })
})

describe('the walk contract, not a second opinion', () => {
  it('refuses a terrace step taller than stepTolerance and takes the ramp', () => {
    // left half at L0 (40), right half at L1 (60): a 20 gap against a tolerance of 10.
    // One column of ramp (50) at the bottom bridges it, and it is the only way across.
    const lvl = new Uint8Array(W * H)
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < 30; x++) lvl[y * W + x] = 40
      for (let x = 30; x < W - 2; x++) lvl[y * W + x] = 60
    }
    for (let y = 30; y < H - 2; y++) for (let x = 28; x < 33; x++) lvl[y * W + x] = 50
    const doc = docOf(lvl)
    const c = cfg({ near: 10 })

    const r = findPath(doc, c, { x: 8, y: 8 }, { x: 50, y: 8 }, { step: 2 })
    expect(r.reached).toBe(true)
    const crossing = r.points.find((p) => p.x >= 30)
    expect(crossing!.y).toBeGreaterThan(25)   // it went down to the ramp
  })

  it('will not stand where the hip probes disagree with the feet', () => {
    // a one-pixel-tall ledge: the feet are on floor and the hips are over nothing
    const lvl = new Uint8Array(W * H)
    for (let x = 2; x < W - 2; x++) lvl[20 * W + x] = 40
    const doc = docOf(lvl)
    const r = findPath(doc, cfg(), { x: 6, y: 20 }, { x: 50, y: 20 }, { step: 1, maxNodes: 5000 })
    expect(r.reached).toBe(false)
  })
})

describe('where the arrow sits', () => {
  it('picks the point that far along the ROUTE, not that far in a straight line', () => {
    const pts = [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 10, y: 30 }]
    const at = aheadOn(pts, { x: 0, y: 0 }, 35)
    expect(at).toEqual({ x: 20, y: 30 })   // round the corner, not the near point beside it
  })
  it('lands on the last point when the route is shorter than the lead', () => {
    expect(aheadOn([{ x: 5, y: 0 }], { x: 0, y: 0 }, 999)).toEqual({ x: 5, y: 0 })
  })
  it('answers nothing for an empty route rather than a coordinate nobody chose', () => {
    expect(aheadOn([], { x: 0, y: 0 }, 10)).toBeNull()
  })
})
