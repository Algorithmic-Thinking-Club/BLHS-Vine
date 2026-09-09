// what a year still asks of the student, worked out from the save alone

import type { SaveGame, Season } from '../save'
import { SEASONS, completedIn } from '../save'
import { hasCoreBeat, beatDone } from '../beats/beats'
import { classDone } from '../beats/classes'
import { programmeById, placeOfProgramme } from '../roster/roster'

/* the last year the run hands out, so the session ends once that year's page turns */
export const SESSION_ENDS_AFTER_YEAR = 1

/** the last page a student turns has turned: nothing else in the run wakes up */
export const sessionOver = (s: SaveGame | null): boolean =>
  !!s && s.flags.includes(`yearbook:y${SESSION_ENDS_AFTER_YEAR}`)

/* where a run is, in one line a student reads, with no season named in it */
export function runLine(s: SaveGame | null): string {
  if (!s) return ''
  if (sessionOver(s)) return 'Year one is done'
  if (!s.introDone) return 'Just started'
  return s.year === 1 ? 'Year one' : `Year ${s.year}`
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
  /** true when the year's core beat is on the ledger (years without authored content pass) */
  coreBeatDone: boolean
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
  const classesDone = plan.classes.filter((c) => classDone(s.ledger, c))
  const classesPending = plan.classes.filter((c) => !classDone(s.ledger, c))
  const coreBeatDone = !hasCoreBeat(year) || beatDone(s.ledger, year)
  return {
    year,
    vignetteSeen: s.flags.includes(`vignette:y${year}`),
    planStamped: plan.stamped,
    coreBeatDone,
    classesDone,
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
    readyForYearbook: plan.stamped && coreBeatDone && classesPending.length === 0,
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
