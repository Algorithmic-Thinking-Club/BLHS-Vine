/* THE BUS BETWEEN AN ISLAND AND THE SCREENS IT ASKS FOR.
 *
 * Every one of these is about a promise settling. An island yields `play(...)` and
 * waits on the answer, and the station that called the handler is holding the controls
 * the whole time. A promise that never settles is not a slow frame, it is a dead map:
 * no bars, no panel, no prompt, and nothing on screen saying why. A reload is the only
 * way out and a fourteen year old has no reason to think of one.
 */
import { describe, expect, it } from 'vitest'
import { onBeatRequest, requestBeat } from './ui-bus'

describe('asking for a beat', () => {
  it('refuses when nothing is mounted to play it', async () => {
    await expect(requestBeat('core:y1', false)).rejects.toThrow(/no HUD mounted/)
  })

  it('comes back with the grade the listener reports', async () => {
    const off = onBeatRequest((r) => r.done(3.5))
    await expect(requestBeat('core:y1', false)).resolves.toBe(3.5)
    off()
  })

  it('comes back null for a screen the student closed without finishing', async () => {
    const off = onBeatRequest((r) => r.done(null))
    await expect(requestBeat('core:y1', false)).resolves.toBeNull()
    off()
  })

  /* ---- THE ONE THAT KILLED A MAP -----------------------------------------
   *
   * Building a beat out of what an island declared can throw: a malformed item, a
   * shape the validator did not expect, anything a person typed in Python.
   * `dispatchEvent` swallows what a listener throws, and the listener has ALREADY
   * called `preventDefault`, which is how it tells `requestBeat` that somebody has
   * this. So the throw took the answer with it and the island waited for ever.
   */
  it('turns a listener that throws into a refusal rather than a silence', async () => {
    const off = onBeatRequest(() => { throw new Error('that item has no options') })
    await expect(requestBeat('atc:the_program', false)).rejects.toThrow(/that item has no options/)
    off()
  })

  it('and a throw that is not an Error still answers', async () => {
    /* a member's own code can reach this through the worker, and it does not have to
     * throw something well formed for the island to deserve an answer */
    const off = onBeatRequest(() => { throw 'just a string' })
    await expect(requestBeat('atc:the_program', false)).rejects.toThrow(/just a string/)
    off()
  })

  it('a listener that answers AND then throws keeps the answer it gave', async () => {
    /* the first settle wins, which is what stops a late throw turning a played beat
     * into a refusal the island then reports as a failure */
    const off = onBeatRequest((r) => { r.done(4); throw new Error('too late') })
    await expect(requestBeat('core:y1', false)).resolves.toBe(4)
    off()
  })
})
