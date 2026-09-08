// the band of screen the UI is holding, so the camera never draws the player under a panel
import { describe, it, expect, beforeEach } from 'vitest'
import { bandFromRects, setUiBand, setUiBandStacked, uiBand } from './frame'

beforeEach(() => {
  setUiBand('dialogue', 0)
  setUiBand('yearstart', 0)
  setUiBand('other', 0)
  setUiBandStacked('placecard', 0)
})

describe('the ui band', () => {
  it('is zero when nothing is talking', () => {
    expect(uiBand()).toBe(0)
  })

  it('is what the one surface on screen claims', () => {
    setUiBand('dialogue', 210)
    expect(uiBand()).toBe(210)
  })

  it('is the TALLEST claim when two surfaces are up at once', () => {
    setUiBand('dialogue', 210)
    setUiBand('yearstart', 240)
    expect(uiBand()).toBe(240)
    setUiBand('dialogue', 330)          // a question opens: three choices above the box
    expect(uiBand()).toBe(330)
  })

  /* THE BUG THE REGISTER EXISTS FOR. With one shared variable this left the band
   * at zero while the year's card was still on screen, and the camera dropped
   * the body back behind it. */
  it('keeps the surviving claim when one of two surfaces leaves', () => {
    setUiBand('dialogue', 330)
    setUiBand('yearstart', 240)
    setUiBand('dialogue', 0)            // the line is answered and the box unmounts
    expect(uiBand()).toBe(240)
    setUiBand('yearstart', 0)
    expect(uiBand()).toBe(0)
  })

  it('refuses a measurement that is not a number, because NaN blanks the scene', () => {
    setUiBand('dialogue', Number.NaN)
    expect(uiBand()).toBe(0)
    setUiBand('dialogue', Number.POSITIVE_INFINITY)
    expect(uiBand()).toBe(0)
    setUiBand('dialogue', -40)
    expect(uiBand()).toBe(0)
  })

  it('publishes the number to CSS, which is where the place card reads it', () => {
    setUiBand('dialogue', 226)
    expect(document.documentElement.style.getPropertyValue('--ui-band')).toBe('226px')
  })

  /* A SURFACE CANNOT STAND ON ITS OWN SHOULDERS. The place card places itself
   * from `--ui-band` and also costs the camera, and if its own height went into
   * the number it reads it would climb the screen one measurement at a time. */
  it('keeps a stacked claim out of the number it reads, and in the one the camera reads', () => {
    setUiBand('dialogue', 209)
    setUiBandStacked('placecard', 330)
    expect(uiBand()).toBe(330)
    expect(document.documentElement.style.getPropertyValue('--ui-band')).toBe('209px')
    setUiBand('dialogue', 0)
    expect(uiBand()).toBe(330)
    expect(document.documentElement.style.getPropertyValue('--ui-band')).toBe('0px')
  })
})

describe('measuring the band off the DOM', () => {
  const rect = (top: number, height: number) =>
    ({ getBoundingClientRect: () => ({ top, height }) }) as unknown as Element

  it('measures from the TOP of the tallest thing to the bottom of the window', () => {
    window.innerHeight = 800
    expect(bandFromRects([rect(590, 190)])).toBe(210)
    expect(bandFromRects([rect(470, 110), rect(590, 190)])).toBe(330)
  })

  it('ignores a claimant that has not been laid out, rather than reading it as the whole window', () => {
    window.innerHeight = 800
    expect(bandFromRects([rect(0, 0), rect(590, 190)])).toBe(210)
    expect(bandFromRects([null, undefined, rect(0, 0)])).toBe(0)
  })
})
