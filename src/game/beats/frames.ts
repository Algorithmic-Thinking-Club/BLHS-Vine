// THE WOVEN-CHECK FRAME (GAME-DESIGN §6.7 baseline, §7.3) — the vine's reusable activity
// chassis. A beat is DATA: dialogue lines and checks in sequence, reusing the grape
// contract's own CheckStep/SceneLine types so core beats, island activities, and member
// grapes all speak ONE language (§14). The runner (ActivityRunner.tsx) plays this data in
// either study arm; scoring lives in score.ts as pure functions. Never a bare MCQ wall:
// checks sit between dialogue, and a sort/choice IS the conversation continuing.

import type { CheckStep, SceneLine } from '../../vine/contract'

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
  /** cord tags carried onto the ledger entry ('ap'/'cte'/'lang'/... — progress.ts reads these) */
  tags?: string[]
  steps: BeatStep[]
  /** Handbook fact ids collected on completion (the takeaway cards, §6.6 beat 5) */
  takeaways: string[]
  credit: number         // 0.5 for core and class beats (§8.1)
}

/** every check in a beat, in order (the scorable spine) */
export function checksOf(beat: CoreBeat): CheckStep[] {
  return beat.steps.filter((s): s is { kind: 'check'; check: CheckStep } => s.kind === 'check').map((s) => s.check)
}

/** total scorable points: a choice/quiz is 1, a sort is 1 per item */
export function pointsOf(check: CheckStep): number {
  return check.kind === 'sort' ? check.items.length : 1
}
