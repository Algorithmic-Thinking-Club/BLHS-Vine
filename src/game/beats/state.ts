/* the three states a scored thing can be in, and the only place that decides */

import type { LedgerEntry, SaveGame } from '../save'
import { PASSING_GRADE } from '../progress'
import { RETAKE_BELOW } from './score'

/* why this file exists: there was no such thing as failed, so beatDone asked is there a row, wallOf is there a passing row and retakeAvailable a third thing, and a failed beat read done to the year gate and unearned to the trophy wall. A scored thing is untried, failed or passed, one function, every surface reads it. */

/** the three states, and there are only three */
export type BeatState = 'untried' | 'failed' | 'passed'

/** the row this scored thing wrote, or undefined when it has never been sat */
export const rowOf = (s: SaveGame | null, id: string): LedgerEntry | undefined =>
  s?.ledger.find((e) => e.id === id)

/** what the ledger says about one scored thing: the id carries its own year (core:y2, class:spanish-1), so this never needs telling which year, and two callers filtering on e.year while three did not was the other half of the bug */
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

/* required is a failed thing the year will not close without, and offered is a thing it will */
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
