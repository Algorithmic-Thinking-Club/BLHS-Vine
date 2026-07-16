// Scoring + the Universal Retake Policy as pure logic (§8.1). The real policy, teaching
// itself: score under a B- (2.7 on the real BLHS scale) and you may retake ONCE, after
// reviewing the takeaways ("legitimate effort"). The ledger is the retake truth — a kept
// best grade marked `retaken` means the retake is spent.

import type { SaveGame } from '../save'
import { checksOf, pointsOf, type CoreBeat } from './frames'

/** points earned per check, keyed by check id/item — the runner accumulates this */
export type BeatScore = { earned: number; total: number }

export const emptyScore = (beat: CoreBeat): BeatScore => ({
  earned: 0,
  total: checksOf(beat).reduce((n, c) => n + pointsOf(c), 0),
})

/** the 0-4.0 grade (§8.1), rounded to 2dp like everything on the transcript */
export const gradeOf = (s: BeatScore): number =>
  s.total === 0 ? 4 : Math.round((s.earned / s.total) * 4 * 100) / 100

/** B- on the real BLHS scale (blhs-specifics: B- = 2.7) — the retake threshold */
export const RETAKE_BELOW = 2.7

/** may this beat be retaken right now? (§8.1: under B-, once, per the ledger's memory) */
export function retakeAvailable(save: SaveGame, beatId: string): boolean {
  const e = save.ledger.find((x) => x.id === beatId)
  if (!e) return false
  return e.grade < RETAKE_BELOW && !e.retaken
}
