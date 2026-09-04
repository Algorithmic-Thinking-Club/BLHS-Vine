/* EVERY GRANT ANSWERS, AND IT ANSWERS FROM HERE.
 *
 * `docs/ops/BRIEF-SELF-EVIDENT.md` law 5, verbatim: *"Every action answers.
 * Placing a token, stamping the sheet, finishing a beat, earning a cord: the
 * thing you touched changes on screen, a pop or a sound says yes, and the next
 * thing lights. No silent state changes."*
 *
 * WHAT WAS ACTUALLY HAPPENING. `src/game/ui/feedback.ts` has shipped a reward
 * pop, a sound and a drawn stamp since the UI wave, and five surfaces import it.
 * `intent-engine.ts`'s `award` is not one of them. That is the single entry point
 * for every grant a member's island can make, a fact, a sticker, a badge, a grade
 * and a finished programme, and it said nothing at all: the student pressed E,
 * answered an island's questions, finished it, and the screen did not move. The
 * one moment the whole study is built to measure was silent.
 *
 * WHY THIS IS NOT A HOOK INSIDE `writeSave`, which is where it obviously belongs
 * until you look. `PmapScene` writes the player's position through `writeSave`
 * ONCE A SECOND for as long as he is walking, so a pop hung there would stamp a
 * reward on the screen every second of the game, forever, and the pop kills and
 * restarts its own timer on each call so it would never leave. The loading covers
 * collect a fact on every door. The settings panel writes on a name edit. A field
 * allowlist would fix the frequency and is just this list written somewhere less
 * honest.
 *
 * AND A DIFF OF THE SAVE COULD NOT SEE HALF OF WHAT A STUDENT EARNS. Four of the
 * six badges and all seven cords are COMPUTED from the run rather than stored:
 * `badgesOf` reads `earned: has('cartographer') || carto.done` and `cordsOf`
 * works the same way, so a student can finish a cord without one byte changing in
 * any field named after it. Those are exactly the grants worth the loudest
 * answer, and they are invisible to anything watching the storage.
 *
 * SO: ONE LOGICAL GRANT IS ONE CALL. Not one write. `award()` alone runs six
 * writes for a single `yield award(...)`, so wrapping the writers would give six
 * pops for one thing earned. The caller says what happened, hands over the save
 * from either side of it, and this file works out what else came with it.
 *
 * IT WRITES NOTHING. Every write already happened before it is called, which is
 * what lets it be called from a React panel, a Pixi scene and a worker's intent
 * without any of them knowing about the others.
 */
import type { SaveGame } from './save'
import { awarded } from './ui/feedback'
import { badgesOf } from './badges'
import { cordsOf } from './progress'

/** what the caller knows it just gave. `detail` is the second line on the card. */
export type Granted = { what: string; detail?: string }

/* THE EVENT, so the world can answer as well as the corner. A placement bound to
 * an anchor is dressed by the island that owns it, and an island only re-dresses
 * on arrival and on a press, so a trophy earned while a student is standing in
 * the room does not appear on the wall until they leave and come back. This is
 * the signal that fixes that when the shelves exist to fill. Nothing in the game
 * listens for it yet, and it is dispatched anyway: it costs nothing, and the
 * alternative is that whoever draws those shelves also has to come back here. */
export const GRANT_EVENT = 'blhs:granted'

/* IT NEVER THROWS INTO ITS CALLER. This runs at the end of `award`, which is the
 * end of a member's own line of Python, and a member whose island scored
 * correctly must never see a refusal because a badge row could not be counted. */
function safely(fn: () => void) {
  try { fn() } catch (e) { console.warn('[grant] the answer failed, the grant stands', e) }
}

/**
 * say that something was earned, once, however many writes it took.
 *
 * `before` and `after` are the save on either side of the writes. Pass the same
 * value twice, or null for `before`, when there is nothing derived to look for.
 */
export function grant(before: SaveGame | null, after: SaveGame | null, said: Granted): void {
  if (!after) return
  safely(() => {
    awarded(said.what, said.detail)

    /* AND WHAT ELSE CAME WITH IT. A grade that tips a cord over its line, or a
     * fact that completes the Bookworm, is a second thing earned in the same
     * instant and the student has no other way to find out: neither is a field,
     * so nothing redraws and nothing announces.
     *
     * Said one at a time and never as a list. The pop shows one thing, so a run
     * that crosses two lines at once names the first and leaves the second to the
     * board, which is where a list belongs. */
    if (!before) return
    const wasBadge = new Set(badgesOf(before).filter((b) => b.earned).map((b) => b.id))
    const newBadge = badgesOf(after).find((b) => b.earned && !wasBadge.has(b.id))
    if (newBadge) {
      queue(() => awarded(newBadge.name, newBadge.how))
      return
    }
    const wasCord = new Set(cordsOf(before).filter((c) => c.earned).map((c) => c.id))
    const newCord = cordsOf(after).find((c) => c.earned && !wasCord.has(c.id))
    if (newCord) queue(() => awarded(newCord.name, newCord.rule))
  })
  safely(() => { window.dispatchEvent(new CustomEvent(GRANT_EVENT)) })
}

/* THE SECOND CARD WAITS FOR THE FIRST. `feedback()` removes whatever is on screen
 * and starts a fresh timer, so two calls in the same tick would show only the
 * second one and the thing the student actually did would be the one they never
 * saw. The pop holds for 2.4 seconds; this follows it. */
const HOLD_MS = 2400
function queue(fn: () => void) {
  setTimeout(fn, HOLD_MS + 200)
}
