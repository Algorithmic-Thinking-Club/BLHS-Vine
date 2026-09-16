/* the chart's arithmetic, which is the part that decides whether the picture tells the truth */
import { describe, expect, it } from 'vitest'
import {
  atPct, chartBox, CHART_ASPECT, clampAspect, gridStep, islandCut, pinPx,
} from './chart-frame'
import { FALLBACK, type WorldSlot } from './composition'

const pt = (x: number, y: number) => ({ x, y })

describe('the box the world is drawn in', () => {
  it('holds every island with open water round it', () => {
    const box = chartBox([pt(0, 0), pt(1000, 400)])
    expect(box.x0).toBeLessThan(0)
    expect(box.y0).toBeLessThan(0)
    expect(box.x0 + box.w).toBeGreaterThan(1000)
    expect(box.y0 + box.h).toBeGreaterThan(400)
  })

  it('pulls a flat world down into the band by growing the short axis', () => {
    /* the live world: two islands 826 apart east to west and 27 apart north to south */
    const box = chartBox([pt(2077.5, 1973.5), pt(1251, 1946)])
    expect(box.aspect).toBeLessThanOrEqual(CHART_ASPECT.max)
    expect(box.aspect).toBeGreaterThanOrEqual(CHART_ASPECT.min)
  })

  it('never shrinks the long axis, because that would push an island off the paper', () => {
    const loose = chartBox([pt(0, 0), pt(4000, 10)])
    expect(loose.w).toBeGreaterThanOrEqual(4000)
    expect(loose.h).toBeGreaterThanOrEqual(10)
  })

  it('the margin alone already holds a flat world inside the band', () => {
    /* measured here rather than asserted in a comment, so a change to the margin says so, and it is why the ceiling has never fired */
    for (const span of [200, 900, 4000, 90_000]) {
      expect(chartBox([pt(0, 0), pt(span, 0)]).aspect).toBeLessThanOrEqual(CHART_ASPECT.max)
    }
  })

  it('grows the width when the world is taller than it is wide', () => {
    const box = chartBox([pt(0, 0), pt(10, 4000)])
    expect(box.h).toBeGreaterThanOrEqual(4000)
    expect(box.aspect).toBeCloseTo(CHART_ASPECT.min, 3)
  })

  it('gives one island a box it is in the middle of', () => {
    const box = chartBox([pt(500, 500)])
    const at = atPct(box, pt(500, 500))
    expect(at.left).toBe('50%')
    expect(at.top).toBe('50%')
  })

  it('answers for an empty world rather than dividing by nothing', () => {
    const box = chartBox([])
    expect(box.w).toBeGreaterThan(0)
    expect(box.h).toBeGreaterThan(0)
    expect(Number.isFinite(box.aspect)).toBe(true)
  })

  it('draws the same world distance as the same number of pixels on both axes', () => {
    /* the element is told to be the shape of the water it is drawing */
    const box = chartBox([pt(0, 0), pt(1200, 900)])
    const pxW = 700, pxH = pxW / box.aspect
    const o = atPct(box, pt(600, 450))
    const east = atPct(box, pt(900, 450))
    const south = atPct(box, pt(600, 750))
    const dx = ((parseFloat(east.left) - parseFloat(o.left)) / 100) * pxW
    const dy = ((parseFloat(south.top) - parseFloat(o.top)) / 100) * pxH
    expect(dx).toBeCloseTo(dy, 9)
  })
})

describe('the aspect band on its own', () => {
  it('grows the height of a shape that is too flat and touches nothing else', () => {
    const fit = clampAspect(1000, 100)
    expect(fit.w).toBe(1000)
    expect(fit.w / fit.h).toBeCloseTo(CHART_ASPECT.max, 6)
  })
  it('grows the width of a shape that is too tall', () => {
    const fit = clampAspect(100, 1000)
    expect(fit.h).toBe(1000)
    expect(fit.w / fit.h).toBeCloseTo(CHART_ASPECT.min, 6)
  })
  it('leaves a shape already in the band exactly as it was', () => {
    const fit = clampAspect(2000, 1000)
    expect(fit).toEqual({ w: 2000, h: 1000 })
  })
})

describe('the ruling', () => {
  it('keeps the lines countable whatever the span', () => {
    for (const span of [400, 1466, 5000, 90_000]) {
      expect(span / gridStep(span)).toBeLessThanOrEqual(16)
    }
  })
  it('has an answer for a span past the biggest step it knows', () => {
    expect(gridStep(10_000_000)).toBeGreaterThan(0)
  })
})

describe('how big an island is drawn', () => {
  it('stays inside the band Ash asked for at every count', () => {
    for (const n of [1, 2, 3, 6, 12, 25, 50, 200]) {
      expect(pinPx(n)).toBeGreaterThanOrEqual(28)
      expect(pinPx(n)).toBeLessThanOrEqual(56)
    }
  })
  it('never grows as the archipelago fills up', () => {
    let last = Infinity
    for (let n = 1; n <= 60; n++) {
      expect(pinPx(n)).toBeLessThanOrEqual(last)
      last = pinPx(n)
    }
  })
  it('sits on its floor by the time there are fifty', () => {
    expect(pinPx(50)).toBe(30)
  })
})

describe('cutting an island out of its own bundle', () => {
  const hub = FALLBACK.slots.find((s) => s.map === 'hub')!

  it('reads the painted rectangle off the world document', () => {
    const cut = islandCut(hub, 52)!
    /* the hub is 669x377 painted inside a 688x640 canvas at 7,194 */
    expect(cut.w).toBe(52)
    expect(cut.h).toBe(Math.round(377 * (52 / 669)))
    expect(cut.imgW).toBe(Math.round(688 * (52 / 669)))
    expect(cut.left).toBe(-Math.round(7 * (52 / 669)))
    expect(cut.top).toBe(-Math.round(194 * (52 / 669)))
  })

  it('asks the vendored bundle first and keeps the committed folder in reserve', () => {
    const cut = islandCut(hub, 40)!
    expect(cut.src).toBe('/maps-vendored/hub/scene.png')
    expect(cut.spare).toBe('/maps-painted/hub/scene.png')
  })

  it('centres a painting in a canvas that never said where it sits', () => {
    const s: WorldSlot = {
      map: 'x', title: 'x', at: pt(0, 0),
      footprint: { w: 100, h: 100 }, canvas: { w: 200, h: 200 },
      state: 'available', release: 100,
    }
    const cut = islandCut(s, 50)!
    expect(cut.left).toBe(-25)
    expect(cut.top).toBe(-25)
  })

  it('draws nothing for a slot with no map and nothing for one with no extent', () => {
    const bare: WorldSlot = { title: 'rumour', at: pt(0, 0), footprint: { w: 1, h: 1 }, state: 'rumour', release: 100 }
    expect(islandCut(bare, 40)).toBeNull()
    const flat: WorldSlot = { map: 'x', title: 'x', at: pt(0, 0), footprint: { w: 0, h: 0 }, state: 'available', release: 100 }
    expect(islandCut(flat, 40)).toBeNull()
  })
})
