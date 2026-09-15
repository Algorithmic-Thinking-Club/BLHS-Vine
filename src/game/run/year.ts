// what a year still asks of the student, worked out from the save alone

import type { SaveGame, Season } from '../save'
import { SEASONS, completedIn } from '../save'
import { hasCoreBeat, beatDone, beatPassedIn } from '../beats/beats'
import { classDone, classPassed } from '../beats/classes'
import { programmeById, placeOfProgramme } from '../roster/roster'

/* the last year the run hands out, so play ends once that year's page turns */
export const SESSION_ENDS_AFTER_YEAR = 1

/* this asks about the year the run is in, not about year one for ever: reading the `SESSION_ENDS_AFTER_YEAR` flag alone shut the run permanently once year one's page turned, and that number stays separate because the yearbook is where the ending is written */
export const sessionOver = (s: SaveGame | null): boolean =>
  !!s && !s.graduated && s.flags.includes(`yearbook:y${s.year}`)

/** the next year there is authored content for, or null at the end of the road */
export const nextYear = (s: SaveGame | null): number | null =>
  s && !s.graduated && sessionOver(s) && s.year < 4 ? s.year + 1 : null

/* the year in words, in one place: five surfaces spelled "year one" out as a literal and none of them asked the save, and these are ordinals rather than digits because the game talks; four is the whole range because `endYear` graduates at four */
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
  /* the place that programme happens at, which is what the world draws and what an exposure record counts: three programmes at the stadium share a place and do not share completion, which is why these are two fields */
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
      /* per programme and per year, off the append-only record, because a ladder re-slots the same programme three years running and "done" has to mean done this year */
      done: completedIn(s, id, year),
    }]
  })
  /* sat and passed are two different facts: the year waits on passed, while `classesTried` counts anyone who sat it, because "has a row" let an F close the class, close the year and print a credit */
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
    /* the year is done when every picked thing with play behind it is done, both classes and every picked club or sport whose island exists; voyages stay out of this expression because `nextObjective` counts only the playable ones, so an unbuilt island can never hold a year open */
    /* every pick, not only the classes: each pick has exactly one button that finishes it, a voyage where there is an island and a card that counts it where there is not, so nothing on the sheet can be unfinishable */
    readyForYearbook: plan.stamped && coreBeatDone
      && classesPending.length === 0 && voyages.every((v) => v.done),
    yearbookSeen: s.flags.includes(`yearbook:y${year}`),
  }
}

/** the yearbook's one gentle nudge, observed and never scolding */
export function nudgeLine(st: YearStatus, s?: SaveGame | null): string {
  /* a year of F grades is not a year well spent: looking only at what was unfinished closed such a year on "Not a season wasted", so this clause is said first, and `s` stays optional so older callers keep the behaviour they had */
  const failed = s ? s.ledger.filter((e) => e.year === st.year && e.grade < 1.0) : []
  if (failed.length === 1) return `${failed[0].title} came back an F. You can sit it again.`
  if (failed.length > 1) return `${failed.length} things came back an F. You can sit them again.`

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
