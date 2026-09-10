// scoring a beat, and the school's retake policy: under a B- you may retake once

import type { SaveGame } from '../save'
import { checksOf, type CoreBeat } from './frames'
/* the denominator comes from the palette, where each kind declares its own, so
 * the total on the transcript and the total the runner scores against are the
 * same number by construction rather than by two files agreeing */
import { pointsOf } from './palette'
import { retakeKind } from './state'

/** points earned per check, keyed by check id/item — the runner accumulates this */
export type BeatScore = { earned: number; total: number }

export const emptyScore = (beat: CoreBeat): BeatScore => ({
  earned: 0,
  total: checksOf(beat).reduce((n, c) => n + pointsOf(c), 0),
})

/** the 0-4.0 grade (§8.1), rounded to 2dp like everything on the transcript */
export const gradeOf = (s: BeatScore): number =>
  s.total === 0 ? 4 : Math.round((s.earned / s.total) * 4 * 100) / 100

/** B- ON THE SCALE THIS GAME PRINTS, which is `progress.ts`'s `letterOf`, where
 *  B- starts at 2.5. It was 2.7 and that was one number disagreeing with another:
 *  a 2.6 printed the letter "B-" in the result card's big mark and, ten lines
 *  under it, the sentence "You scored under a B-, so you can take this again". A
 *  2-of-3 lands there, which is an ordinary way to finish an ordinary beat.
 *
 *  It is a GAME rule about when a retake is OFFERED, never printed as the
 *  school's; the school's own trigger is under 79% with legitimate effort. And it
 *  is only ever an offer: nothing in the year waits on a retake being taken
 *  (Ash, 2026-09-08 item 5), which `run/wall.ts` is the other half of. */
export const RETAKE_BELOW = 2.5

/* ---- AND THE RULE ITSELF LIVES IN `state.ts` (Ash, 2026-09-09) ------------
 *
 * This used to BE the rule, and it was the wrong one: `grade < B- && !retaken`
 * caught a FAILED beat, spent the student's single retake on it, and then
 * answered no for ever. A student who failed Advisory twice had a run that could
 * not be finished and nothing on screen that would let him try again.
 *
 * A fail and a near-miss are two different offers. `retakeKind` is where that
 * distinction lives; this is kept because a dozen callers say this sentence and
 * it is the sentence they mean. */
export function retakeAvailable(save: SaveGame, beatId: string): boolean {
  return retakeKind(save, beatId) !== 'none'
}
