/* the arrow routes round walls by the same walk law the body uses, on hand-drawn masks */
import { describe, it, expect } from 'vitest'
import { findPath, aheadOn, onFloor } from './path'
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
    // left half at level 40 and right at 60, a 20 gap against a tolerance of 10, bridged by one ramp column
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

/* ---- a goal that is not on the floor */
describe('onFloor', () => {
  /* the hub near the tunnel, where everything above row 385 is doorway and the terrace lip below stands */
  const hubish = (_x: number, y: number) => y >= 385

  it('leaves a goal that already stands exactly where it is', () => {
    const r = onFloor({ x: 343, y: 400 }, hubish, 0.72)
    expect(r.moved).toBe(false)
    expect(r.at).toEqual({ x: 343, y: 400 })
  })

  it('steps the hub door onto the terrace lip 7px south', () => {
    const r = onFloor({ x: 343, y: 378 }, hubish, 0.72)
    expect(r.moved).toBe(true)
    expect(r.at).toEqual({ x: 343, y: 385 })
  })

  /* the search uses findPath's own metric, where vertical ground costs 1/yScale */
  it('measures in the search own y corrected metric, not in raw pixels', () => {
    const cross = (x: number, y: number) => (x === 351 && y === 378) || (x === 343 && y === 385)
    const r = onFloor({ x: 343, y: 378 }, cross, 0.72)
    expect(r.at).toEqual({ x: 351, y: 378 })
  })

  it('keeps the spot when nothing within reach stands, rather than inventing one', () => {
    const r = onFloor({ x: 343, y: 378 }, () => false, 0.72)
    expect(r.moved).toBe(false)
    expect(r.at).toEqual({ x: 343, y: 378 })
  })

  it('will not reach past the limit it was given', () => {
    const far = (_x: number, y: number) => y >= 500
    expect(onFloor({ x: 343, y: 378 }, far, 0.72, 24).moved).toBe(false)
    expect(onFloor({ x: 343, y: 378 }, far, 0.72, 200).moved).toBe(true)
  })
})
