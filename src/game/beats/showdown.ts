// the showdown chassis: a turn-based drive where correct answers, and no clock, move the ball

import type { ShowdownRound } from '../../vine/contract'
import type { Response } from './palette'

/** the whole of a drive, and small on purpose: it is what a resume has to carry */
export type ShowdownState = {
  /** which round is on screen. Equals `total` when the drive is over. */
  round: number
  /** rounds answered correctly so far. The ONLY thing that moves the ball. */
  earned: number
  /** how many rounds this drive is */
  total: number
  /** the pick on the current round, null until the student answers it */
  picked: number | null
  /** what was picked in each answered round, keyed by round id, so the runner hands the palette one Response for the whole showdown */
  picks: Record<string, number>
  done: boolean
}

export type ShowdownAction =
  /** answer the round on screen, ignored once the round is answered so a double click cannot score twice */
  | { kind: 'pick'; index: number }
  /** take the answered round off the screen and start the next one */
  | { kind: 'next' }

export const startShowdown = (rounds: ShowdownRound[]): ShowdownState => ({
  round: 0, earned: 0, total: rounds.length, picked: null, picks: {}, done: rounds.length === 0,
})

export function showdownReduce(s: ShowdownState, a: ShowdownAction, rounds: ShowdownRound[]): ShowdownState {
  if (s.done) return s
  const rd = rounds[s.round]
  if (!rd) return { ...s, done: true }

  if (a.kind === 'pick') {
    if (s.picked !== null) return s
    if (a.index < 0 || a.index >= rd.options.length) return s
    const right = !!rd.options[a.index].correct
    return {
      ...s,
      picked: a.index,
      earned: s.earned + (right ? 1 : 0),
      picks: { ...s.picks, [rd.id]: a.index },
    }
  }

  /* next only from an answered round, so the chassis cannot be advanced past a question the student never saw and end with a denominator it did not earn */
  if (s.picked === null) return s
  const round = s.round + 1
  return { ...s, round, picked: null, done: round >= s.total }
}

/* ---- what the game arm draws ------------------------------------------------ */

/** the yard line: the rounds not yet earned, over the total, across the field */
export const yardsRemaining = (s: ShowdownState, fieldYards = 80): number =>
  s.total === 0 ? 0 : Math.round(fieldYards * ((s.total - s.earned) / s.total))

/** 0 to 1, for whatever the kit draws the drive with */
export const progressOf = (s: ShowdownState): number =>
  s.total === 0 ? 1 : s.earned / s.total

/** the drive as an answer the palette can score, so a showdown goes through the same scoring function a two-option choice does */
export const responseOf = (checkId: string, s: ShowdownState): Response =>
  Object.fromEntries(Object.entries(s.picks).map(([roundId, i]) => [`${checkId}:${roundId}`, String(i)]))
