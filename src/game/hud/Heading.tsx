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
 *
 * ---- IT STANDS NOW, AND THAT IS A RULING RATHER THAN A TWEAK ---------------
 *
 * THE NON-READER LAW, added to `docs/ops/BRIEF-UI.md` by Ash on 2026-09-01:
 * "The player is a freshman who did not choose this game and will not read a
 * paragraph... One line above his head is the task. It is the ONLY standing text
 * on the screen."
 *
 * This component was built the other way round. It appeared for seven seconds
 * when the objective CHANGED, and again after twelve seconds of a student doing
 * nothing, and then it went away, on the argument that "a heading that stays is
 * furniture". That argument is right about a heading and wrong about a TASK. A
 * student who looked away, or who was reading the year sheet, or who simply took
 * longer than seven seconds to decide, came back to a screen with nothing on it
 * that said what to do, and the whole reason this component exists is that such
 * a student had no other way to find out.
 *
 * So the line stands while the world is QUIET and yields to anything with more
 * to say. It is not furniture because it is not decoration: it is the one
 * sentence the game owes a player who did not choose to be here.
 *
 * WHAT IT STILL YIELDS TO, unchanged, and this is what keeps it from being
 * clutter: a panel, an arrival card, and anybody speaking. The world bus already
 * counts all three, so the line is present exactly when nothing else is talking.
 * The idle clock is gone with the hide, because a thing that never leaves does
 * not need to be called back.
 */
import { useEffect, useRef, useState } from 'react'
import { loadSave, subscribeSave } from '../save'
import { nextObjective } from '../run/objective'
import { panelDepth } from '../ui/a11y'
import { placeCardUp } from '../stage/stage-bus'
import { onWorldHold, worldHeld } from '../world-bus'
import { track } from '../telemetry'
import './heading.css'

export function Heading() {
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])

  /* what the game currently thinks is next, recomputed on every save write. Pure,
   * so this costs a function call rather than a fetch. */
  const obj = nextObjective(loadSave())
  const key = obj ? `${obj.phase}:${obj.anchor}:${obj.map}` : ''

  /* THE WORLD BEING QUIET IS A QUESTION, NOT A CLOCK. `worldHeld` counts every
   * lease at once: a station mid-sentence, a cutscene mid-shot, an open panel,
   * a scripted walk. Asking it is how one line can stand permanently and still
   * never be the second thing talking. */
  const [held, setHeld] = useState(worldHeld)
  useEffect(() => { setHeld(worldHeld()); return onWorldHold(setHeld) }, [])

  /* and an arrival card is the world not being quiet either. It is a bus rather
   * than a hold, so it is asked separately and on its own signal. */
  const [cardUp, setCardUp] = useState(placeCardUp)
  useEffect(() => {
    setCardUp(placeCardUp())
    const t = window.setInterval(() => setCardUp(placeCardUp()), 300)
    return () => window.clearInterval(t)
  }, [])

  /* SAID ONCE PER OBJECTIVE, NOT ONCE PER SHOW. The line is on screen nearly all
   * the time now, so logging every appearance would be logging the frame rate.
   * What the study wants is which objective a student was looking at and when it
   * changed, which is exactly this. */
  const last = useRef('')
  useEffect(() => {
    if (!obj || key === last.current) return
    last.current = key
    track('heading_shown', { phase: obj.phase, anchor: obj.anchor, why: 'changed' })
  }, [key, obj])

  if (!obj || panelDepth() > 0 || held || cardUp) return null

  return (
    <div className="hd-wrap" role="status" aria-live="polite">
      <div className="hd-card kit-surface-dialogue">
        <p className="hd-say">{obj.say}</p>
      </div>
    </div>
  )
}
