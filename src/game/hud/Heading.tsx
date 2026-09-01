/* WHAT TO DO NEXT, SAID OUT LOUD, WHICH THIS GAME HAS NEVER ONCE DONE.
 *
 * Ash, 2026-08-31: *"our goal is for anyone to understand the game. as of right
 * now i would have 0 clue."* And `docs/ops/BRIEF-THE-GAME.md`'s test: a fourteen
 * year old opens this unattended in advisory and knows what the game is and what
 * to do next WITHIN TEN SECONDS, without being told.
 *
 * THE ANSWER WAS ALREADY WRITTEN AND HAS NEVER BEEN ON A SCREEN. `run/objective.ts`
 * computes one live objective from the year's own state machine and gives it a
 * sentence: "Someone is waiting for you inside the mountain." · "The year sheet is
 * unstamped. The chart table is waiting." · "Advisory is at the fire." Seven of
 * them, in character, each one the exact answer to what a lost student is asking.
 * `Objective.say` is read in ONE place in this repository and that place is a
 * unit test. The two call sites of `nextObjective` both take `anchor` and `map`
 * and throw the sentence away.
 *
 * So this component is not a new idea. It is a renderer for an answer the game
 * has been computing all along, and it is the single cheapest move available
 * against the ten-second test.
 *
 * WHY IT IS NOT A QUEST LOG. §40.6's absence list forbids one and names the
 * replacement: "src/game/run/objective.ts is the replacement and it is
 * deliberately one live thing at a time, because a home base with six glowing
 * stations is a menu." One sentence, never a list, and it is the same one thing
 * the pennant in the world points at.
 *
 * WHY IT SHARES A SLOT WITH THE PLACE CARD RATHER THAN STACKING UNDER IT. Two
 * cards in the same corner is two reads, and the ten seconds only has room for
 * one. The place card says where you ARE and this says what you are FOR, and a
 * student meets them a second apart on arrival, so they are one object that
 * changes its mind rather than two competing for a corner.
 */
import { useEffect, useRef, useState } from 'react'
import { loadSave, subscribeSave } from '../save'
import { nextObjective, type Objective } from '../run/objective'
import { panelDepth } from '../ui/a11y'
import { placeCardUp } from '../stage/stage-bus'
import { track } from '../telemetry'
import './heading.css'

/* HOW LONG A STUDENT GETS BEFORE THE GAME SAYS IT AGAIN.
 *
 * A frozen student in a noisy advisory room is frozen well before twenty seconds,
 * and a screen that looks fine and says nothing is the exact failure `PLAYTEST.md`
 * records this project shipping. Twelve is short enough to catch somebody who has
 * stopped and long enough that it is not nagging a player who is walking. The
 * timer only runs while NOTHING else is happening: no input, no panel, nobody
 * speaking, so it can never talk over the game. */
const IDLE_MS = 12_000

type Shown = { obj: Objective; key: string; why: 'arrived' | 'changed' | 'idle' }

export function Heading() {
  const [shown, setShown] = useState<Shown | null>(null)
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])

  /* what the game currently thinks is next, recomputed on every save write. Pure,
   * so this costs a function call rather than a fetch. */
  const obj = nextObjective(loadSave())
  const key = obj ? `${obj.phase}:${obj.anchor}:${obj.map}` : ''
  const last = useRef('')
  const hideAt = useRef(0)

  /* ---- WHEN IT SPEAKS ------------------------------------------------------
   *
   * Three moments and no others, which is what keeps one sentence from becoming a
   * notification feed: the objective CHANGED, the student ARRIVED somewhere, or
   * the student has done nothing at all for twelve seconds. */
  useEffect(() => {
    if (!obj) { setShown(null); return }
    /* THE FIRST COMPUTATION IS NOT A CHANGE, and saying it out loud was the bug.
     * Measured with scripts/ten-seconds.mjs: the sentence appeared at 0.8s, which
     * is DURING the cover, while the screen is still black and the painting has
     * not drawn. It said the most important line in the game to a student who was
     * looking at a fade, and it had gone by the time the world arrived.
     *
     * The first show belongs to the arrival, which fires when the map is really
     * up. This branch is for the objective CHANGING under a student who is already
     * standing there, which is a different moment and a real one. */
    if (!last.current) { last.current = key; return }
    if (key === last.current) return
    last.current = key
    setShown({ obj, key, why: 'changed' })
    track('heading_shown', { phase: obj.phase, anchor: obj.anchor, why: 'changed' })
  }, [key, obj])

  /* THE ARRIVAL CASE MOVED ONTO THE CARD ITSELF (stage/PlaceCard.tsx). Two cards
   * in one corner, four and a half seconds apart, was two reads for one thought
   * and it put the sentence past ten seconds on a slow load. What is left here is
   * the two moments that are NOT an arrival: the objective changing under a
   * student who is already standing there, and a student who has stopped.
   */

  /* ---- AND WHEN IT SAYS IT AGAIN ------------------------------------------
   *
   * The safety net, and the one that answers the actual complaint. Any real input
   * resets the clock, so a student who is playing is never told anything; a
   * student who has stopped is told again rather than left in a screen that looks
   * fine and says nothing. */
  useEffect(() => {
    let t = 0
    const arm = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        if (panelDepth() > 0) { arm(); return }
        const o = nextObjective(loadSave())
        if (!o) return
        setShown({ obj: o, key: `${o.phase}:${o.anchor}:${o.map}`, why: 'idle' })
        track('heading_shown', { phase: o.phase, anchor: o.anchor, why: 'idle' })
      }, IDLE_MS)
    }
    /* capture, so a key the game swallows still counts as the student being alive */
    const wake = () => arm()
    for (const e of ['keydown', 'pointerdown', 'wheel']) window.addEventListener(e, wake, true)
    arm()
    return () => {
      window.clearTimeout(t)
      for (const e of ['keydown', 'pointerdown', 'wheel']) window.removeEventListener(e, wake, true)
    }
  }, [])

  /* it leaves on its own. A heading that stays is furniture, and §40.6's whole
   * position is that nothing floats that does not have to. */
  useEffect(() => {
    if (!shown) return
    /* long enough to be read twice at classroom distance. The line is at most two
     * short sentences and this is a fourteen year old reading it in a noisy room
     * while also looking at a painting for the first time. */
    hideAt.current = Date.now() + 7_000
    const t = window.setTimeout(() => setShown(null), 7_000)
    return () => window.clearTimeout(t)
  }, [shown])

  /* IT WAITS FOR A PANEL RATHER THAN BEING DESTROYED BY ONE, which is the one
   * behaviour the arrival card gets deliberately wrong and must not inherit.
   * `PlaceCard` drops a card that arrives while a panel is open, and its own
   * comment gives the reason: a card about somewhere the student stopped being.
   * That reason is TRUE of an arrival and FALSE of this: losing the only line
   * that says where to go is not the same as losing a place name. */
  /* AND IT DOES NOT TALK OVER THE ARRIVAL CARD. They share a corner on purpose,
   * one after the other: where you ARE, then what you are FOR. Both at once is two
   * cards stacked in the same place and two reads out of a budget of ten seconds.
   * The wait is not a timer here, it is a question about what is on screen, so a
   * card that lingers cannot be talked over by a clock that fired anyway. */
  if (!shown || panelDepth() > 0 || placeCardUp()) return null

  return (
    <div className="hd-wrap" role="status" aria-live="polite">
      <div className="hd-card kit-surface-dialogue">
        <p className="hd-say">{shown.obj.say}</p>
      </div>
    </div>
  )
}
