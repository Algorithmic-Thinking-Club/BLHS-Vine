import { describe, expect, it } from 'vitest'
import { clearWater, pullTaut, seaRoute, type Water } from './searoute'

/* an open sea with one wall across the middle and a gap in it */
const walled = (gapY: number, gapH: number): Water => (x, y) =>
  !(x > 200 && x < 260 && !(y > gapY && y < gapY + gapH))

describe('the line a hull steers', () => {
  it('answers with one point when the way is already clear', () => {
    const r = seaRoute({ x: 0, y: 0 }, { x: 400, y: 0 }, () => true)
    expect(r).toEqual([{ x: 400, y: 0 }])
  })

  it('goes round a wall rather than through it', () => {
    const water = walled(300, 80)
    const r = seaRoute({ x: 100, y: 0 }, { x: 400, y: 0 }, water, { step: 20 })
    expect(r).not.toBeNull()
    /* every leg of the answer stays in water, which is the whole promise */
    let a = { x: 100, y: 0 }
    for (const b of r!) {
      expect(clearWater(a, b, water, 20)).toBe(true)
      a = b
    }
    expect(a).toEqual({ x: 400, y: 0 })
  })

  it('keeps the number of turns small, because every corner is a turn of the wheel', () => {
    const water = walled(300, 80)
    const r = seaRoute({ x: 100, y: 0 }, { x: 400, y: 0 }, water, { step: 20 })
    /* round one wall through one gap is three runs of straight water at most, out, across and back, where a staircase would be dozens */
    expect(r!.length).toBeLessThanOrEqual(4)
  })

  it('says so plainly when there is no way through', () => {
    const shut: Water = (x) => x < 200
    expect(seaRoute({ x: 0, y: 0 }, { x: 400, y: 0 }, shut, { step: 20, budget: 2000 })).toBeNull()
  })

  it('starts from the nearest water when the hull is sitting on the coast', () => {
    /* a berth is the shallowest water there is and rounds onto land often enough */
    const water: Water = (x, y) => !(x < 10 && y < 10)
    const r = seaRoute({ x: 0, y: 0 }, { x: 300, y: 300 }, water, { step: 20 })
    expect(r).not.toBeNull()
    expect(r!.at(-1)).toEqual({ x: 300, y: 300 })
  })

  it('gives up inside its budget rather than hanging the frame', () => {
    /* a huge empty sea with the goal behind a wall with no gap: the search has to stop itself, because nothing else in the tick will */
    const shut: Water = (x) => x < 500 || x > 520
    const r = seaRoute({ x: 0, y: 0 }, { x: 4000, y: 0 }, shut, { step: 8, budget: 500 })
    expect(r).toBeNull()
  })
})

describe('pulling a staircase taut', () => {
  it('drops every point the line can see past', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }]
    expect(pullTaut(pts, () => true, 10)).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }])
  })

  it('keeps the one it cannot', () => {
    const water: Water = (x, y) => !(x > 5 && x < 15 && y > -5 && y < 5)
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 40 }, { x: 20, y: 0 }]
    const out = pullTaut(pts, water, 5)
    expect(out.length).toBe(3)
  })
})
