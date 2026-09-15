// scoring a beat, and the school's retake policy: under a B- you may retake once

import type { SaveGame } from '../save'
import { checksOf, type CoreBeat } from './frames'
/* the denominator comes from the palette, where each kind declares its own, so the transcript total and the total the runner scores against are the same number by construction */
import { pointsOf } from './palette'
import { retakeKind } from './state'

/** points earned per check, keyed by check id or item, accumulated by the runner */
export type BeatScore = { earned: number; total: number }

export const emptyScore = (beat: CoreBeat): BeatScore => ({
  earned: 0,
  total: checksOf(beat).reduce((n, c) => n + pointsOf(c), 0),
})

/** the 0-4.0 grade (§8.1), rounded to 2dp like everything on the transcript */
export const gradeOf = (s: BeatScore): number =>
  s.total === 0 ? 4 : Math.round((s.earned / s.total) * 4 * 100) / 100

/** B- on the scale `progress.ts`'s `letterOf` prints, where B- starts at 2.5: at 2.7 a 2.6 printed the letter B- above a line saying the student scored under a B-. A game rule about when a retake is offered, not the school's under 79 percent, and nothing in the year waits on one being taken. */
export const RETAKE_BELOW = 2.5

/* the rule itself lives in `state.ts`, because `grade < B- && !retaken` spent the single retake on a failed beat and then answered no for ever, leaving a run nobody could finish; a fail and a near miss are different offers, and this wrapper stays because a dozen callers mean this sentence */
export function retakeAvailable(save: SaveGame, beatId: string): boolean {
  return retakeKind(save, beatId) !== 'none'
}
