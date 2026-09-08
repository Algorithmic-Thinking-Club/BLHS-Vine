// where a panel placed in the world draws, and what it must not cover
import { describe, it, expect } from 'vitest'
import { normaliseSite, placeAtSite, type Rect, type WorldUiSite } from './worldSite'

const VIEW: Rect = { x: 0, y: 0, w: 200, h: 200 }
const face: Rect = { x: 90, y: 90, w: 20, h: 20 }

const site = (over: Partial<WorldUiSite> = {}): WorldUiSite => ({
  name: 'counter', rect: { x: 20, y: 20, w: 160, h: 160 }, keepClear: face, gap: 4, ...over,
})

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('the keep-clear area stays clear', () => {
  it('puts the card above the thing the card is about', () => {
    const p = placeAtSite(site(), { w: 60, h: 20 }, VIEW)
    expect(p.side).toBe('above')
    expect(overlaps(p, face)).toBe(false)
    expect(p.y + p.h).toBe(face.y - 4)
    // and centred on it, which is what makes it read as belonging to it
    expect(p.x + p.w / 2).toBe(face.x + face.w / 2)
  })

  it('goes below when there is no room above', () => {
    const s = site({ keepClear: { x: 90, y: 4, w: 20, h: 20 }, rect: { x: 0, y: 0, w: 200, h: 200 } })
    const p = placeAtSite(s, { w: 60, h: 40 }, VIEW)
    expect(p.side).toBe('below')
    expect(overlaps(p, s.keepClear!)).toBe(false)
  })

  it('goes beside it when there is room neither above nor below', () => {
    const s = site({ keepClear: { x: 90, y: 0, w: 20, h: 200 }, rect: { x: 0, y: 0, w: 200, h: 200 } })
    const p = placeAtSite(s, { w: 60, h: 40 }, VIEW)
    expect(['left', 'right']).toContain(p.side)
    expect(overlaps(p, s.keepClear!)).toBe(false)
  })

  it('obeys the order an author asked for', () => {
    const p = placeAtSite(site({ prefer: ['right', 'above'] }), { w: 40, h: 20 }, VIEW)
    expect(p.side).toBe('right')
  })

  /* THE PROMISE THAT MATTERS. When nothing fits whole, a clamped card that still
   * misses the face beats a tidy one that lands on it. */
  it('would rather be clamped into the view than cover the face', () => {
    const s = site({ keepClear: { x: 0, y: 0, w: 200, h: 60 }, rect: { x: 0, y: 0, w: 200, h: 200 } })
    const p = placeAtSite(s, { w: 300, h: 40 }, VIEW)
    expect(overlaps(p, s.keepClear!)).toBe(false)
    expect(p.clamped).toBe(true)
  })

  it('never picks over-the-top by itself while a keep-clear area exists', () => {
    for (const content of [{ w: 10, h: 10 }, { w: 190, h: 190 }, { w: 400, h: 400 }]) {
      expect(placeAtSite(site(), content, VIEW).side).not.toBe('over')
    }
  })

  it('centres in the site when the author named no keep-clear area', () => {
    const p = placeAtSite(site({ keepClear: undefined }), { w: 60, h: 20 }, VIEW)
    expect(p.x).toBe(70)     // 20 + (160 - 60) / 2
    expect(p.y).toBe(90)
    expect(p.clamped).toBe(false)
  })
})

describe('it stays on screen, and says when it could not', () => {
  it('clamps a card that would hang off the edge of the view', () => {
    const s = site({ keepClear: { x: 190, y: 100, w: 8, h: 8 }, rect: { x: 0, y: 0, w: 200, h: 200 } })
    const p = placeAtSite(s, { w: 80, h: 20 }, VIEW)
    expect(p.x).toBeGreaterThanOrEqual(VIEW.x)
    expect(p.x + p.w).toBeLessThanOrEqual(VIEW.x + VIEW.w)
  })

  /* A CARD DRAWN AT A SITE THE CAMERA CANNOT SEE IS A CARD NOBODY READS, and the
   * caller has to be able to tell, because the right answer then is a panel. */
  it('flags a site the camera has left behind rather than drawing off screen', () => {
    const s = site({ rect: { x: 900, y: 900, w: 40, h: 40 }, keepClear: { x: 905, y: 905, w: 10, h: 10 } })
    const p = placeAtSite(s, { w: 40, h: 20 }, VIEW)
    expect(p.fallback).toBe(true)
    expect(p.x).toBeGreaterThanOrEqual(VIEW.x)
    expect(p.y).toBeGreaterThanOrEqual(VIEW.y)
  })

  it('says nothing is wrong when the site is in view', () => {
    expect(placeAtSite(site(), { w: 40, h: 20 }, VIEW).fallback).toBe(false)
  })

  it('gives whole pixels, because half a pixel is a blurred panel', () => {
    const p = placeAtSite(site({ keepClear: { x: 91, y: 91, w: 21, h: 21 } }), { w: 41, h: 21 }, VIEW)
    expect(Number.isInteger(p.x)).toBe(true)
    expect(Number.isInteger(p.y)).toBe(true)
  })
})

describe('an author can type a point and still get an extent', () => {
  it('never leaves a zero-sized rect for the arithmetic to divide by', () => {
    const n = normaliseSite({ name: 'sign', rect: { x: 10.4, y: 10.6, w: 0, h: 0 }, keepClear: { x: 1.2, y: 1.2, w: 0, h: 0 } })
    expect(n.rect).toEqual({ x: 10, y: 11, w: 1, h: 1 })
    expect(n.keepClear).toEqual({ x: 1, y: 1, w: 1, h: 1 })
  })

  it('leaves a site with no keep-clear area without one', () => {
    expect(normaliseSite({ name: 'sign', rect: { x: 0, y: 0, w: 4, h: 4 } }).keepClear).toBeUndefined()
  })
})
