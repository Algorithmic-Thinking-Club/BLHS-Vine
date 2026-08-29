// THE SHOWDOWN CHASSIS: the turn-based frame, where knowledge is the ammunition.
//
// The stadium's last drive is the frame that argued for widening the palette in the
// first place. It is not a choice, a quiz or a sort, and it is the whole reason
// that island is a place a student stands in rather than a page they read. A debate
// round, a robotics match and a DECA roleplay are the same frame with different
// words on the buttons.
//
// NO CLOCK. NOT ANYWHERE IN THIS FILE.
//
// This is the sharpest content decision 80.7 produced and it is worth stating in
// full rather than assuming: in the boss frame the item scores and the body does
// not. Progress is a function of rounds remaining minus rounds correct AND NOTHING
// ELSE. No timing window, no streak bonus, no reaction time, no elapsed anything.
// A student who answers every round correctly and dawdles over each one drives the
// length of the field, and a student who answers fast and wrong does not move.
//
// Two reasons, and the second is the load-bearing one:
//
//   1. The alternative confounds the study with reaction time on a machine whose
//      input latency nobody has measured. The deployment target is a 4 GB school
//      Chromebook and the measurement would have to be made on one.
//   2. A member who widens their own timing window makes their island's grade
//      easier in a way the transcript cannot see. So the window is not a member's
//      to set, and the frame that would most obviously want one does not have one
//      at all. There is nothing here to widen.
//
// The test in showdown.test.ts reads this file's own source and fails if `Date`,
// `performance` or `setTimeout` ever appears in it, because a rule this easy to
// break by accident deserves a tripwire and not a paragraph.
//
// RESUME IS A PROPERTY OF THE CHASSIS, not something a frame opts into. A drive is
// the longest thing in the palette and therefore the one a bell lands inside, and
// the frames most worth resuming are written by the people least likely to think
// about it. So the whole of the per-round state is this one serialisable object:
// hand it back and the drive continues where it stopped.

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
  /** what was picked in each answered round, keyed by round id, so the runner can
   *  hand the palette one Response for the whole showdown and score it in one line */
  picks: Record<string, number>
  done: boolean
}

export type ShowdownAction =
  /** answer the round on screen. Ignored once the round is answered, so a double
   *  click cannot score twice, which is the bug every quiz UI ships once. */
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

  /* next: only from an answered round, so the chassis cannot be advanced past a
   * question the student never saw and end the drive with a denominator it did
   * not earn the right to */
  if (s.picked === null) return s
  const round = s.round + 1
  return { ...s, round, picked: null, done: round >= s.total }
}

/* ---- what the game arm draws ------------------------------------------------ */

/** THE YARD LINE. `total - earned` over `total`, times the length of the field.
 *
 *  Read the signature: a state and a field length. There is no third argument and
 *  there is nowhere for one to go. That is the timing law expressed as an API
 *  rather than as a comment somebody has to obey. */
export const yardsRemaining = (s: ShowdownState, fieldYards = 80): number =>
  s.total === 0 ? 0 : Math.round(fieldYards * ((s.total - s.earned) / s.total))

/** 0 to 1, for whatever the kit draws the drive with */
export const progressOf = (s: ShowdownState): number =>
  s.total === 0 ? 1 : s.earned / s.total

/** the drive as an answer the palette can score, so a showdown goes through the
 *  same single scoring function as a two-option choice does */
export const responseOf = (checkId: string, s: ShowdownState): Response =>
  Object.fromEntries(Object.entries(s.picks).map(([roundId, i]) => [`${checkId}:${roundId}`, String(i)]))
