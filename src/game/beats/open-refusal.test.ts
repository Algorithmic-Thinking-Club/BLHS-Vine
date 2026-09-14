import { describe, expect, it } from 'vitest'
import { performIntent } from '../../vine/intents'
import { UI_PANELS } from '../ui-bus'

/* ---- A MEMBER'S TYPO IS A SENTENCE, NEVER A FROZEN GAME ------------------
 *
 * `open` was the one word in the vocabulary whose argument was never checked against
 * its own closed list, and it is a word a member types by hand in Python. `open(
 * "guide")` for "handbook" reached the Hud, which is a chain of equality tests with
 * no else. Nothing matched, nothing opened, and with `wait=True` the waiter it had
 * already parked was released only by the bus's ten minute ceiling - with the world
 * held for the whole of it. A student stood still with no dialogue, no panel and no
 * controls, and then the island carried on as though the panel had opened and shut.
 *
 * The Maw's founding film says `open(..., wait=True)` four times, so this was in the
 * first two minutes of the game.
 */
/* the smallest host `open` can be asked through: it needs an engine and nothing else */
const host = (openUi: (ui: string, wait: boolean) => void) => ({
  world: () => ({}) as never,
  engine: { openUi } as never,
}) as never

describe('open, with a name nobody has', () => {
  it('refuses by name and lists the panels that exist', async () => {
    const r = await performIntent({ kind: 'open', ui: 'guide' } as never,
      host(() => { throw new Error('the engine must never be reached with a bad name') }))
    expect(r.ok).toBe(false)
    const why = r.ok ? '' : r.why
    expect(why).toMatch(/"guide" is not a panel/)
    /* the list is in the refusal, because a member reading it has to be able to fix
     * their own line without reading the engine */
    for (const p of UI_PANELS) expect(why).toContain(p)
  })

  it('and every real panel is still let through', async () => {
    for (const p of UI_PANELS) {
      let reached = ''
      const r = await performIntent({ kind: 'open', ui: p } as never,
        host((ui) => { reached = ui }))
      expect(r.ok, p).toBe(true)
      expect(reached).toBe(p)
    }
  })
})
