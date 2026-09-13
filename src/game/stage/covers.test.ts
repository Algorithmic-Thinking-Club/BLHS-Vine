/* WHERE A COVER'S PICTURE COMES FROM, now that covers belong to maps.
 *
 * The rule: a destination's own bundle is asked first, then the hand-kept table, then
 * the class's art, which is committed in this repo and cannot miss. Nothing is
 * fetched to find out, so a map with no cover drawn yet costs one aborted image
 * request and looks exactly as it did before any of this existed.
 */
import { describe, expect, it } from 'vitest'
import { bundleCovers, ceremonyCover, coverFor, passingCover } from './covers'

describe('a cover asks the map it is going to first', () => {
  it('names the two roots a bundle is really loaded from, in that order', () => {
    /* the same order PmapScene tries: the vendored copy the build writes, then the
     * folder committed here. Guessed rather than fetched, which is the whole point. */
    expect(bundleCovers('atc-1')).toEqual([
      '/maps-vendored/atc-1/cover.png',
      '/maps-painted/atc-1/cover.png',
    ])
  })

  it('asks for a named cover under the map own covers folder', () => {
    expect(bundleCovers('atc-1', 'the_stair')).toEqual([
      '/maps-vendored/atc-1/covers/the_stair.png',
      '/maps-painted/atc-1/covers/the_stair.png',
    ])
  })

  it('says nothing at all for a map with no id', () => {
    expect(bundleCovers('')).toEqual([])
  })

  it('puts the bundle candidates in front of the art committed here', () => {
    const c = coverFor('atc-1')
    expect(c.spec.images?.[0]).toBe('/maps-vendored/atc-1/cover.png')
    /* AND THE FLOOR IS STILL THERE. The overlay walks `images` and then falls to
     * `image`, so a destination nobody has drawn a cover for is not a blank screen. */
    expect(c.spec.image).toBeTruthy()
    expect(c.spec.image!.startsWith('/')).toBe(true)
  })

  it('keeps the hand-kept picture for a map that has one, underneath', () => {
    /* the Maw's cover is its own room painting, chosen by hand before bundles
     * carried covers. It stays the fallback rather than being replaced by one. */
    expect(coverFor('panther-maw').spec.image).toBe('/maps-painted/panther-maw/scene.png')
  })

  it('gives a map being crossed no picture, no name and no fact', () => {
    /* Ash: "for some reason, it put a transition screen while sailing to the atc
     * island." A pass-through is a cut inside one continuous move, so it says nothing. */
    const p = passingCover()
    expect(p.spec.kind).toBe('fade')
    expect(p.spec.title).toBeUndefined()
    expect(p.spec.images).toBeUndefined()
    expect(p.spec.fact).toBe(false)
    expect(p.first).toBe(false)
  })

  it('and the graduation keeps its own held title', () => {
    const c = ceremonyCover('Bonney Lake High')
    expect(c.spec.voice).toBe('ceremony')
    expect(c.spec.title).toBe('BONNEY LAKE HIGH')
    expect(c.spec.fact).toBe(false)
  })
})
