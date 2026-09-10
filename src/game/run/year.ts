// what a year still asks of the student, worked out from the save alone

import type { SaveGame, Season } from '../save'
import { SEASONS, completedIn } from '../save'
import { hasCoreBeat, beatDone, beatPassedIn } from '../beats/beats'
import { classDone, classPassed } from '../beats/classes'
import { programmeById, placeOfProgramme } from '../roster/roster'

/* the last year the run hands out, so the session ends once that year's page turns */
export const SESSION_ENDS_AFTER_YEAR = 1

/* ---- THE YEAR HE IS IN HAS BEEN CLOSED --------------------------------------
 *
 * ASH, 2026-09-09, on the title screen a finished run lands on: *"the option
 * says 'your yearbook'. This is useful. But the main button should be 'start
 * year 2' with the button below being 'your yearbook', am I right?"*
 *
 * He is, and year two is real: `beats/y2.ts` is an authored Advisory at the
 * counselor's office about every honor cord the school gives, the catalog offers
 * classes for years one to four, and `endYear()` already hands out a fresh sheet
 * and three fresh season tokens. Nothing was missing but a way in.
 *
 * SO THIS ASKS ABOUT THE YEAR HE IS IN rather than about year one for ever. It
 * used to read the flag for `SESSION_ENDS_AFTER_YEAR` and nothing else, so once
 * year one's page turned the run was shut permanently: the Maw went quiet, the
 * bar said "look around", and the only thing left in the game was a yearbook.
 * Starting year two now makes this false again and the whole year opens.
 *
 * `SESSION_ENDS_AFTER_YEAR` is still the STUDY's number and is still read by the
 * yearbook, which is where the session's own ending is written. This is the
 * game's question and that is the study's; they were one line and should not
 * have been. */
export const sessionOver = (s: SaveGame | null): boolean =>
  !!s && !s.graduated && s.flags.includes(`yearbook:y${s.year}`)

/** the next year there is authored content for, or null at the end of the road */
export const nextYear = (s: SaveGame | null): number | null =>
  s && !s.graduated && sessionOver(s) && s.year < 4 ? s.year + 1 : null

/* ---- THE YEAR, IN WORDS, IN ONE PLACE (Ash, 2026-09-09) -------------------
 *
 * *"I finished year 2, and it says 'year one is done' everywhere."*
 *
 * It did. Five surfaces spelled "year one" out as a literal, written in the week
 * when year one was the only year there was: the objective bar's last sentence,
 * the yearbook's closing card and its plank, the counselor's cord line and the
 * principal's congratulation. Every one of them was true once and none of them
 * asked the save.
 *
 * ORDINALS RATHER THAN DIGITS, because "That is year two" is what a person says
 * and "That is year 2" is what a form says, and this game talks. Four is the
 * whole range: `endYear` graduates at four and there is no fifth. */
const YEAR_WORDS = ['zero', 'one', 'two', 'three', 'four'] as const

/** "year two", for a sentence. `Year two` when it opens one. */
export const yearWord = (n: number): string => YEAR_WORDS[n] ?? String(n)

/* where a run is, in one line a student reads, with no season named in it */
export function runLine(s: SaveGame | null): string {
  if (!s) return ''
  if (sessionOver(s)) return `Year ${yearWord(s.year)} is done`
  if (!s.introDone) return 'Just started'
  return `Year ${yearWord(s.year)}`
}

export type VoyageStatus = {
  season: Season
  /** what the token was spent on. A slot points at a PROGRAMME, never at a map. */
  programmeId: string
  name: string
  /* the place that programme happens at, which is what the world draws and what
   * an exposure record counts. Three programmes at the stadium share this and do
   * not share their completion, which is the whole reason they are two fields. */
  placeId?: string
  /** the programme's loop can actually run today (roster, N1) */
  playable: boolean
  done: boolean
}

export type YearStatus = {
  year: number
  vignetteSeen: boolean
  planStamped: boolean
  /** true when the year's core beat is on the ledger WITH A PASSING GRADE */
  coreBeatDone: boolean
  /** true when it has been sat at all, whatever came of it */
  coreBeatTried: boolean
  /** the classes sat at least once, passed or not */
  classesTried: string[]
  classesDone: string[]
  classesPending: string[]
  voyages: VoyageStatus[]
  /** stamp + advisory + both classes: the year may close */
  readyForYearbook: boolean
  yearbookSeen: boolean
}

/* whether a programme can run today is a field on it in the roster, not a list kept here */

/* the state of one year, taking the year as an argument so a past page can be composed */
export function yearStatus(s: SaveGame, forYear = s.year): YearStatus {
  const year = forYear
  const plan = s.plans[year] ?? { slots: {}, classes: [], stamped: false }
  const voyages: VoyageStatus[] = SEASONS.flatMap((season) => {
    const id = plan.slots[season]
    if (!id) return []
    const g = programmeById(id)
    /* completion is keyed by the programme and never by the place it happens at */
    return [{
      season, programmeId: id, name: g?.name ?? id, placeId: placeOfProgramme(id)?.id,
      playable: !!g?.playable,
      /* PER PROGRAMME AND PER YEAR, off the append-only record. A ladder re-slots
       * the same programme three years running, so "done" has to mean done THIS
       * year or year two opens with year one's tick still on the sheet. */
      done: completedIn(s, id, year),
    }]
  })
  /* ---- SAT AND PASSED ARE TWO DIFFERENT FACTS (Ash, 2026-09-09) ---------
   *
   * *"It shouldnt allow a user to finish their year, if they just failed
   * everything. It should register their attempts, and that they failed first
   * attempt, but they should have multiple attempts."*
   *
   * `classesDone` used to be "has a row", so an F closed the class, closed the
   * year and printed a credit on the transcript. Both facts are kept now: the
   * year waits on PASSED, and `classesTried` is what the wall and the study read
   * so a student who sat it and missed is not drawn as a student who never came. */
  const classesDone = plan.classes.filter((c) => classPassed(s, c))
  const classesTried = plan.classes.filter((c) => classDone(s.ledger, c))
  const classesPending = plan.classes.filter((c) => !classPassed(s, c))
  const coreBeatDone = !hasCoreBeat(year) || beatPassedIn(s, year)
  const coreBeatTried = !hasCoreBeat(year) || beatDone(s.ledger, year)
  return {
    year,
    vignetteSeen: s.flags.includes(`vignette:y${year}`),
    planStamped: plan.stamped,
    coreBeatDone,
    coreBeatTried,
    classesDone,
    classesTried,
    classesPending,
    voyages,
    /* the year closes on the stamp and advisory, and the picked classes do not hold it */
    /* THE YEAR IS DONE WHEN EVERY PICKED THING WITH PLAY BEHIND IT IS DONE.
     *
     * ASH, 2026-09-08: *"The year is done only when every picked thing with play
     * behind it is done: both classes today, and every picked club or sport the
     * day its island exists, through the voyage clause that already exists. A
     * pick with nothing behind it cannot be picked, so it never holds the year
     * open."*
     *
     * The class clause was taken out on 2026-09-05 because a student walked to
     * the counselor and she had nothing to say: the year was waiting on two
     * activities nothing on screen had sent him to. That was the right diagnosis
     * and the wrong fix. The bar sends him to them now (`objective.ts`, the
     * `class` clause), so the gate can go back to being honest.
     *
     * THE VOYAGES ARE NOT IN THIS EXPRESSION and still must not be. A committed
     * voyage is held by `nextObjective`'s own clause, which counts only the
     * playable ones, so an island nobody has built can never hold a year open.
     * Two gates for two kinds of thing, and the second one already existed. */
    /* ---- AND EVERY PICK, NOT ONLY THE CLASSES (Ash, 2026-09-08 item 6) -----
     *
     * *"THE YEAR ENDS in the Maw. When every pick is done the bar says 'Go back
     * to the Maw. The principal is waiting.'"*
     *
     * The voyages used to be left out of this expression and had to be: a club
     * whose island nobody had built could never be finished, so counting it here
     * would have held year one open for ever, and the objective's own voyage
     * clause counted only the playable ones as a way round that.
     *
     * ITEM 4 CLOSED THAT HOLE. Every pick now has exactly one button and it
     * always finishes the pick: a voyage where there is an island, a card that
     * counts it where there is not. So nothing on this sheet can be unfinishable
     * any more, and the year gate can mean what it says. */
    readyForYearbook: plan.stamped && coreBeatDone
      && classesPending.length === 0 && voyages.every((v) => v.done),
    yearbookSeen: s.flags.includes(`yearbook:y${year}`),
  }
}

/** the yearbook's one gentle nudge (§7.6) — observed, never scolding */
export function nudgeLine(st: YearStatus): string {
  const rising = st.voyages.find((v) => !v.playable && !v.done)
  if (rising) return `The ${rising.name} island is not open yet, so nobody could sail there.`
  /* no nudge about an empty season, since the sheet never showed a student one */
  const unplayed = st.voyages.find((v) => v.playable && !v.done)
  if (unplayed) return `You signed up for ${unplayed.name} and never went.`
  /* a class on the sheet that was never sat, said last because it is the smaller miss */
  if (st.classesPending.length) {
    return st.classesPending.length === 1
      ? 'You picked a class this year and never sat it. It is still on your sheet.'
      : `You picked ${st.classesPending.length} classes this year and sat neither of them.`
  }
  return 'Not a season wasted.'
}
