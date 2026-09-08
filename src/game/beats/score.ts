// scoring a beat, and the school's retake policy: under a B- you may retake once

import type { SaveGame } from '../save'
import { checksOf, type CoreBeat } from './frames'
/* the denominator comes from the palette, where each kind declares its own, so
 * the total on the transcript and the total the runner scores against are the
 * same number by construction rather than by two files agreeing */
import { pointsOf } from './palette'

/** points earned per check, keyed by check id/item — the runner accumulates this */
export type BeatScore = { earned: number; total: number }

export const emptyScore = (beat: CoreBeat): BeatScore => ({
  earned: 0,
  total: checksOf(beat).reduce((n, c) => n + pointsOf(c), 0),
})

/** the 0-4.0 grade (§8.1), rounded to 2dp like everything on the transcript */
export const gradeOf = (s: BeatScore): number =>
  s.total === 0 ? 4 : Math.round((s.earned / s.total) * 4 * 100) / 100

/** B- on the real BLHS scale (docs/blhs/sourced-facts.md §grading: B- = 2.7) — the retake
 *  threshold. It is a GAME rule about when a retake is offered and is never printed as the
 *  school's; the school's own trigger is under 79% with legitimate effort. */
export const RETAKE_BELOW = 2.7

/** may this beat be retaken right now? (§8.1: under B-, once, per the ledger's memory) */
export function retakeAvailable(save: SaveGame, beatId: string): boolean {
  const e = save.ledger.find((x) => x.id === beatId)
  if (!e) return false
  return e.grade < RETAKE_BELOW && !e.retaken
}
