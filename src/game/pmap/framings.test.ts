/* THE MAP OWNS THE SHOT, and the script's typed number is only a fallback.
 *
 * The defect these are written against is a real line that shipped: `maw-founding`
 * carried `zoom: 1.35`, guessed once at a keyboard for one painting, with nothing
 * to notice when that painting was re-cut. A framing is authored where the thing
 * is, so the close-up moves with the desk.
 */
import { describe, it, expect, vi } from 'vitest'
import { framingOf, framingNames, shotOf } from './framings'
import { resolveScript, type AuthoredScript } from '../cutscene/scripts'

const DESK = {
  framing: { zoom: 1.5, dy: -14, name: 'default' },
  framings: { close: { zoom: 1.9, dy: -18 }, wide: { zoom: 1.05, dy: 0 } },
}

describe('a framing on an anchor', () => {
  it('reads the default shot off the meta bag that already survives export', () => {
    expect(framingOf(DESK)).toEqual({ zoom: 1.5, dx: 0, dy: -14, name: 'default' })
  })

  it('reads a named one, and keeps the name it was asked for', () => {
    expect(framingOf(DESK, 'close')).toEqual({ zoom: 1.9, dx: 0, dy: -18, name: 'close' })
  })

  /* A NAME THE MAP DOES NOT CARRY FALLS BACK TO ITS OWN DEFAULT rather than to
   * nothing, because a shot that half-happens is worse than the author's own
   * wide one. The caller is told, which is PmapScene's job and not this one's. */
  it('falls back to the anchor own default when the name is not there', () => {
    expect(framingOf(DESK, 'nope')?.name).toBe('default')
  })

  it('answers nothing at all for an anchor nobody framed', () => {
    expect(framingOf(undefined)).toBeNull()
    expect(framingOf({ why: 'a note somebody left' })).toBeNull()
  })

  /* AN EMPTY BAG IS NOT A FRAMING. It would otherwise override a script's zoom
   * with undefined and pull every shot back to the map's load scale, which is
   * worse than the hand-typed number it replaced. */
  it('refuses a framing that says nothing', () => {
    expect(framingOf({ framing: {} })).toBeNull()
    expect(framingOf({ framing: { name: 'empty' } })).toBeNull()
  })

  it('lists what an anchor really carries, for a refusal that can name them', () => {
    expect(framingNames(DESK)).toEqual(['(default)', 'close', 'wide'])
    expect(framingNames(undefined)).toEqual([])
  })

  it('applies the offset, which is the thing look_at could never express', () => {
    expect(shotOf({ x: 196, y: 322 }, framingOf(DESK, 'close'))).toEqual({ x: 196, y: 304, zoom: 1.9 })
    /* no framing at all is the anchor itself, at whatever the caller fell back to */
    expect(shotOf({ x: 10, y: 20 }, null, 1.35)).toEqual({ x: 10, y: 20, zoom: 1.35 })
  })
})

describe('resolving a script against a map that frames itself', () => {
  const spot = (n: string) => (n === 'desk' ? { x: 196, y: 322 } : null)
  const script: AuthoredScript = {
    id: 'test', steps: [{ t: 'cameraAt', anchor: 'desk', framing: 'close', zoom: 1.35, ms: 900 }],
  }

  it('uses the MAP number and not the script number', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { script: r, missing } = resolveScript(script, spot, (_n, name) => framingOf(DESK, name))
    expect(missing).toEqual([])
    expect(r.steps[0]).toEqual({ t: 'camera', to: { x: 196, y: 304 }, zoom: 1.9, ms: 900 })
    /* and it says so, once, rather than silently discarding what somebody typed */
    expect(info).toHaveBeenCalledWith(expect.stringContaining('is framed at 1.9 by the map'))
    info.mockRestore()
  })

  it('falls back to the script number on a map whose author has not framed it', () => {
    const { script: r } = resolveScript(script, spot, () => null)
    expect(r.steps[0]).toEqual({ t: 'camera', to: { x: 196, y: 322 }, zoom: 1.35, ms: 900 })
  })

  /* THE OLD BEHAVIOUR IS STILL THE BEHAVIOUR WITH NO READER PASSED, which is what
   * keeps every caller that has not been taught about framings working. */
  it('is unchanged when nobody hands it a framing reader at all', () => {
    const { script: r } = resolveScript(script, spot)
    expect(r.steps[0]).toEqual({ t: 'camera', to: { x: 196, y: 322 }, zoom: 1.35, ms: 900 })
  })

  it('still refuses a whole script for an anchor the map does not have', () => {
    const bad: AuthoredScript = { id: 'bad', steps: [{ t: 'cameraAt', anchor: 'nowhere', ms: 10 }] }
    expect(resolveScript(bad, spot, () => null).missing).toEqual(['nowhere'])
  })
})
