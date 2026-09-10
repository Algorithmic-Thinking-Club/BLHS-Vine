/* the three states a scored thing can be in, and the only place that decides */

import type { LedgerEntry, SaveGame } from '../save'
import { PASSING_GRADE } from '../progress'
import { RETAKE_BELOW } from './score'

/* ---- ASH, 2026-09-09 ------------------------------------------------------
 *
 * *"I purposefully failed advisory. Retake is an option as soon as you fail. But
 * once i left the advisory panel, finished the intro cutscene, and came back, it
 * says 'advisory is done for this year'. Obviously it should allow the user to
 * retake, only if they havent passed."*
 *
 * And: *"I gave you this for specifically advisory. But realistically, every
 * thing that needs a quiz or some form of that, needs this same system. Any
 * island, anything. Should be a part of the engine."*
 *
 * And: *"It shouldnt allow a user to finish their year, if they just failed
 * everything, right? It should register their attempts, and that they failed
 * first attempt, but they should have multiple attempts."*
 *
 * WHY THIS FILE EXISTS. There was no such thing as "failed". Every surface in
 * the game asked one of two questions and each picked its own: `beatDone` and
 * `classDone` asked "is there a row", `wallOf` asked "is there a row with a
 * passing grade", and `retakeAvailable` asked a third thing again. So a student
 * who failed Advisory was DONE to the year gate, the year sheet and the hearth,
 * and UNEARNED to the trophy wall, with one retake and then no way back in. Ash
 * hit both halves of that in one sitting.
 *
 * A scored thing is untried, failed, or passed. Three states, one function, and
 * every surface reads it. That is the whole of the fix, and it is why this is a
 * file rather than four edits.
 *
 * WHAT IS DELIBERATELY *NOT* HERE: how hard it is to pass. `PASSING_GRADE` is a
 * D on the school's own scale, which is one item right out of three on most
 * beats. Ash: *"and its not that hard to pass."* Unlimited retakes on a low bar
 * is a student who cannot get stuck, which is the point; the study measures what
 * they learned on the way, not whether they were gated.
 */

/** the three states, and there are only three */
export type BeatState = 'untried' | 'failed' | 'passed'

/** the row this scored thing wrote, or undefined when it has never been sat */
export const rowOf = (s: SaveGame | null, id: string): LedgerEntry | undefined =>
  s?.ledger.find((e) => e.id === id)

/**
 * What the ledger says about one scored thing.
 *
 * The id carries its own year (`core:y2`, `class:spanish-1`), so this never
 * needs telling which year it is being asked about. That was the other half of
 * the bug: two callers filtered on `e.year` and three did not, which is two
 * answers to one question waiting to disagree.
 */
export function beatState(s: SaveGame | null, id: string): BeatState {
  const row = rowOf(s, id)
  if (!row) return 'untried'
  return row.grade >= PASSING_GRADE ? 'passed' : 'failed'
}

/** passed, which is what every gate on the year means and none of them said */
export const beatPassed = (s: SaveGame | null, id: string): boolean =>
  beatState(s, id) === 'passed'

/** sat at least once, whatever came of it. The wall's frame and the study's own count. */
export const beatTried = (s: SaveGame | null, id: string): boolean =>
  beatState(s, id) !== 'untried'

/** how many times it has been sat, which the result card and the study both want */
export const attemptsOn = (s: SaveGame | null, id: string): number =>
  rowOf(s, id)?.attempts ?? 0

/* ---- WHEN A RETAKE IS OFFERED, AND WHETHER IT IS OPTIONAL -----------------
 *
 * TWO DIFFERENT THINGS wearing one word before today, which is why the harder
 * one went missing:
 *
 * `required` is a FAILED thing. The year will not close without it, so it is
 * always offered, with no limit. A student who cannot pass on the second try
 * gets a third, and the alternative is a run that cannot be finished.
 *
 * `offered` is the school's own Universal Retake (§8.1): passed, but under a
 * B-, once. Nothing waits on it. It is a chance to do better, not a gate.
 *
 * The old rule was `grade < B- && !retaken`, which collapsed the two: it caught
 * a fail, spent the single retake on it, and then answered "no" for ever. */
export type RetakeKind = 'required' | 'offered' | 'none'

export function retakeKind(s: SaveGame | null, id: string): RetakeKind {
  const row = rowOf(s, id)
  if (!row) return 'none'
  if (row.grade < PASSING_GRADE) return 'required'
  return row.grade < RETAKE_BELOW && !row.retaken ? 'offered' : 'none'
}

/** the sentence a station says about a thing in this state, in the student's words */
export function stateLine(state: BeatState, what: string): string {
  if (state === 'untried') return `${what} is waiting for you.`
  if (state === 'failed') return `${what} is not passed yet. You can take it again.`
  return `${what} is done for this year.`
}
