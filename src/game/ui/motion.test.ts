/* ONE VALUE FOR REDUCED MOTION, NOT TWO THAT USUALLY AGREE.
 *
 * W12's finding was that `data-rm` is read by CSS and nothing drawn on the Pixi
 * canvas can see it. The fix was `motion.ts`. What that fix left behind, and what
 * these tests hold, is the other direction: `motion.ts` also reads the OS media
 * query and the stylesheets do not, so the two could disagree and a student whose
 * Chromebook already asked for less motion got a shortened camera move and a
 * full-length panel animation in the same second.
 *
 * The attribute is the file's output now. What the stylesheets match on is
 * exactly the boolean the renderer is handed, and every `html[data-rm='1']` rule
 * in the tree, including the ones in files this session does not own, starts
 * honouring the OS setting without being edited.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { motionAmp, motionMs, onReducedMotion, prefersReducedMotion, setReducedMotion } from './motion'

beforeEach(() => { setReducedMotion(false) })

describe('the setting is a value and an attribute at the same time', () => {
  it('writes what it reads, so CSS and the renderer cannot drift', () => {
    setReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(document.documentElement.dataset.rm).toBe('1')

    setReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
    expect(document.documentElement.dataset.rm).toBe('')
  })

  it('tells a renderer that is mid-animation, so a swing can shorten rather than finish', () => {
    const seen: boolean[] = []
    const off = onReducedMotion((on) => seen.push(on))
    setReducedMotion(true)
    setReducedMotion(false)
    off()
    setReducedMotion(true)
    expect(seen).toEqual([true, false])
  })
})

describe('what reduced means to something that draws', () => {
  it('shortens a camera travel instead of cutting it, which is what §11.3 asks for', () => {
    expect(motionMs(900)).toBe(900)
    setReducedMotion(true)
    expect(motionMs(900)).toBe(120)
    // a move that was already short is left alone rather than made longer
    expect(motionMs(60)).toBe(60)
    // and it is never zero, because a move that takes no time is a cut
    expect(motionMs(900)).toBeGreaterThan(0)
  })

  it('stops a decorative swing outright', () => {
    expect(motionAmp(8)).toBe(8)
    setReducedMotion(true)
    expect(motionAmp(8)).toBe(0)
  })
})
