// the reusable activity chassis: a beat is data, dialogue lines and checks in sequence

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
  /* ledger kind, the credit class: core beats, class beats and an island's own all share this chassis, and finish() copies this straight onto LedgerEntry.kind */
  kind: 'core' | 'class' | 'island'
  /* what the activity is framed in: a card is the panel every beat has always opened in, a screen is the full bleed monitor an island pushes the camera into, and it is chrome that changes nothing asked, answered or scored */
  chrome?: 'card' | 'screen'
  /** cord tags carried onto the ledger entry ('ap'/'cte'/'lang'/..., which progress.ts reads) */
  tags?: string[]
  steps: BeatStep[]
  /** Handbook fact ids collected on completion (the takeaway cards, §6.6 beat 5) */
  takeaways: string[]
  credit: number         // 0.5 for core and class beats (§8.1)
}

/* an item that will not validate is dropped here, and the author is warned by name */
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

/** the beat's steps with any refused item taken out, so the woven path plays exactly the items checksOf counts and never one more */
export function playableSteps(beat: CoreBeat): BeatStep[] {
  const kept = new Set(checksOf(beat).map(checkIdOf))
  return beat.steps.filter((s) => s.kind !== 'check' || kept.has(checkIdOf(s.check)))
}

/* the points a check is worth, re-exported from palette.ts so there is one source */
export const pointsOf = palettePoints

/* what a beat is given when it stages in the world: the intent wire and arrivals at anchors */
export type BeatWorld = {
  /** put an intent on the wire. Same words, same performer, same refusals. */
  issue: (i: Intent) => Promise<IntentResult>
  /** the one event that comes back. Returns its own unsubscribe. */
  onReached: (cb: (anchor: string) => void) => () => void
}
