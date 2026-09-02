// THE WOVEN-CHECK FRAME (GAME-DESIGN §6.7 baseline, §7.3), the vine's reusable activity
// chassis. A beat is DATA: dialogue lines and checks in sequence, reusing the grape
// contract's own CheckStep/SceneLine types so core beats, island activities, and member
// grapes all speak ONE language (§14). The runner (ActivityRunner.tsx) plays this data in
// either study arm; scoring lives in palette.ts as one table keyed by kind. Never a bare
// MCQ wall: checks sit between dialogue, and a sort/choice IS the conversation continuing.

import type { CheckStep, SceneLine } from '../../vine/contract'
import type { Intent, IntentResult } from '../../vine/intents'
import { checkIdOf, pointsOf as palettePoints, refuseCheck } from './palette'

export type BeatStep =
  | { kind: 'say'; line: SceneLine }
  | { kind: 'check'; check: CheckStep }

export type CoreBeat = {
  id: string             // ledger id, e.g. 'core:y1' / 'class:ap-human-geo'
  year: number
  title: string          // "This is the place"
  place: string          // where it stages, in fiction ("the Advisory Hearth")
  /** ledger kind (§8.1 credit classes): core beats and class beats share this chassis */
  kind: 'core' | 'class'
  /** cord tags carried onto the ledger entry ('ap'/'cte'/'lang'/..., which progress.ts reads) */
  tags?: string[]
  steps: BeatStep[]
  /** Handbook fact ids collected on completion (the takeaway cards, §6.6 beat 5) */
  takeaways: string[]
  credit: number         // 0.5 for core and class beats (§8.1)
}

/* AN INVALID ITEM IS REFUSED HERE, WHICH IS WHY IT IS REFUSED EVERYWHERE (K5).
 *
 * `refuseCheck` is a validator and a validator nobody calls is a comment. This is
 * the one place every arm reads the scorable spine from: the runner plays it, the
 * form renders it, and `emptyScore` counts it. Dropping a refused item here means
 * the denominator and the two arms cannot disagree about which items exist, which
 * would be the worse bug than the broken item.
 *
 * WHO THE REFUSAL IS FOR. Not the student, who is shown one fewer question and is
 * not penalised for a member's mistake. The AUTHOR, at their own item, by name,
 * with what is wrong with it. That is the same law src/vine/intents.ts settled for
 * unbuilt intents: a word that cannot perform says so, and it says so to the
 * person who wrote it. Warned once per item, because a beat re-reads its checks on
 * every render and a console with four hundred copies of a message is a console
 * nobody reads. */
const warned = new Set<string>()

export function checksOf(beat: CoreBeat): CheckStep[] {
  const out: CheckStep[] = []
  for (const s of beat.steps) {
    if (s.kind !== 'check') continue
    const why = refuseCheck(s.check)
    if (!why) { out.push(s.check); continue }
    const key = `${beat.id}:${checkIdOf(s.check)}`
    if (!warned.has(key)) { warned.add(key); console.warn(`[beat ${beat.id}] item refused and dropped: ${why}`) }
  }
  return out
}

/** the beat's steps with any refused item taken out, so the woven path plays
 *  exactly the items `checksOf` counts and never one more */
export function playableSteps(beat: CoreBeat): BeatStep[] {
  const kept = new Set(checksOf(beat).map(checkIdOf))
  return beat.steps.filter((s) => s.kind !== 'check' || kept.has(checkIdOf(s.check)))
}

/* THE DENOMINATOR HAS ONE HOME AND IT IS NO LONGER THIS FILE.
 *
 * `pointsOf` used to be a one-line ternary here ("a sort is its item count, and
 * everything else is 1"), which was true of three kinds and is a wrong answer for
 * five of the eight. It is re-exported rather than moved outright because
 * score.ts, beats.test.ts and year.test.ts all read it from here, and a kind
 * declaring its own points beside its own plain rendering is the point of
 * palette.ts. One source, two doors. */
export const pointsOf = palettePoints

/* ---- W8: a check that is a world object, and the whole of what that means -----
 *
 * A scored activity can stage IN the world rather than over it: walk to the place
 * and the item is answered by having gone there. The wide version of this hands
 * every beginner a scene reference, so this is the narrow one, and the narrowness
 * is the design rather than a first pass.
 *
 * A running beat may issue the SAME intents an island can already issue, through
 * the intent layer it already has, and receives back exactly ONE kind of world
 * event as an item's input: the player reached a named anchor. No second
 * vocabulary. No access to the scene, the renderer or the ticker. Scoring stays in
 * the runner, the beat stays pure data, and the plain arm derives from the items
 * exactly as it does for a quiz, so a world-staged frame has a control-arm
 * rendering by construction rather than by a member remembering to write one.
 *
 * What it buys is the difference between a drill on a field and a quiz about a
 * field, which is the difference between the stadium being an island and not.
 *
 * A scene supplies this. A runner without one is not broken: a `do` item falls
 * back to naming its places as buttons, which is what the plain arm shows anyway,
 * so a beat authored against the world is still playable in the Handbook, in the
 * harness and in a test with no map at all. */
export type BeatWorld = {
  /** put an intent on the wire. Same words, same performer, same refusals. */
  issue: (i: Intent) => Promise<IntentResult>
  /** the one event that comes back. Returns its own unsubscribe. */
  onReached: (cb: (anchor: string) => void) => () => void
}
