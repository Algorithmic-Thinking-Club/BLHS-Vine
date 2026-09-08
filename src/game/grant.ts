// how the game answers when a student earns something: one call per thing earned, and it writes nothing
import type { SaveGame } from './save'
import { awarded } from './ui/feedback'
import { badgesOf } from './badges'
import { cordsOf } from './progress'

/** what the caller knows it just gave. `detail` is the second line on the card. */
export type Granted = { what: string; detail?: string }

/** fired on every grant, so the world can redress itself as well as the corner popping */
export const GRANT_EVENT = 'blhs:granted'

// runs a step without ever throwing into the caller, so a failed answer cannot undo a grant
function safely(fn: () => void) {
  try { fn() } catch (e) { console.warn('[grant] the answer failed, the grant stands', e) }
}

/** say once that something was earned, given the save from either side of the writes */
export function grant(before: SaveGame | null, after: SaveGame | null, said: Granted): void {
  if (!after) return
  safely(() => {
    awarded(said.what, said.detail)

    // a badge or cord this grant also completed, named one at a time rather than as a list
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

// a second card waits until the first has had its time on screen
const HOLD_MS = 2400
function queue(fn: () => void) {
  setTimeout(fn, HOLD_MS + 200)
}
