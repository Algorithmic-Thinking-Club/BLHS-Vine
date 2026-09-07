// THE YEAR'S RHYTHM as pure state (§7.5) — what this year still asks of the student,
// derived entirely from the save. The required spine of a year: the stamped sheet, the
// advisory core beat, and the two focus classes. Committed island voyages complete when
// their islands are playable (§6.6 — the grape phase); until then they read honestly as
// "still rising" and never block the yearbook. Every beat is individually resumable
// because every beat's doneness lives on the ledger/plan, not in component state.

import type { SaveGame, Season } from '../save'
import { SEASONS, completedIn } from '../save'
import { hasCoreBeat, beatDone } from '../beats/beats'
import { classDone } from '../beats/classes'
import { programmeById, placeOfProgramme } from '../roster/roster'

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

/* `PLAYABLE_ISLANDS` was a hardcoded `new Set<string>([])` here, and shipping an
 * island meant editing it plus the activity array plus a deploy, with no review
 * step. Playability is a field on a programme in the roster now, so a programme
 * that can run says so where everything else about it is written. */

/* THE YEAR IS AN ARGUMENT, because the yearbook has to compose a page for a year
 * that already turned. It read `s.year` and nothing else, so every derived answer
 * in the run was about today and a past page could only be rendered by lying
 * about which year it was. Everything below already took a year: `completedIn`,
 * `beatDone` and `hasCoreBeat` all do, so the only thing that was current-year
 * about this function was the one line that read the field. */
export function yearStatus(s: SaveGame, forYear = s.year): YearStatus {
  const year = forYear
  const plan = s.plans[year] ?? { slots: {}, classes: [], stamped: false }
  const voyages: VoyageStatus[] = SEASONS.flatMap((season) => {
    const id = plan.slots[season]
    if (!id) return []
    const g = programmeById(id)
    /* COMPLETION IS KEYED BY THE PROGRAMME AND NEVER BY THE PLACE. Two entries
     * naming one stadium used to be done the moment either was, because both
     * read the same island id, so a student spent a winter token on a voyage the
     * year model already believed was over. */
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
    /* THE YEAR CLOSES ON THE STAMP AND ADVISORY, AND THE CLASSES DO NOT HOLD IT.
     *
     * BRIEF-MAW-RAIL's year one is five beats: the principal, the pick, the fire,
     * the wall, the counselor. Its fourth beat is the wall "showing what filled
     * and what is still empty, in his own picks' names", and its fifth is the
     * page turning, so the page is meant to turn with the two picked classes
     * still unsat. This line read `classesPending.length === 0 && classes.length
     * === 2` and made that unreachable: a freshman walked to the counselor and
     * she had nothing to say, because the year model was waiting on two three
     * minute activities nothing on screen had sent him to.
     *
     * THE CLASSES ARE NOT CUT. They are still on the sheet, still scored, still
     * tagged, still moving the cords, and My Year still offers them by name. What
     * changed is that they are the year's OPTIONAL depth rather than its gate,
     * which is what the yearbook's own nudge line has always said out loud about
     * a season nobody spent. */
    readyForYearbook: plan.stamped && coreBeatDone,
    yearbookSeen: s.flags.includes(`yearbook:y${year}`),
  }
}

/** the yearbook's one gentle nudge (§7.6) — observed, never scolding */
export function nudgeLine(st: YearStatus): string {
  const rising = st.voyages.find((v) => !v.playable && !v.done)
  if (rising) return `The ${rising.name} island is not open yet, so that season did not run.`
  const open = SEASONS.find((se) => !st.voyages.some((v) => v.season === se))
  if (open) return `You left ${open.toLowerCase()} open this year. You never spent that season token.`
  const unplayed = st.voyages.find((v) => v.playable && !v.done)
  if (unplayed) return `You signed up for ${unplayed.name} and never went.`
  /* A CLASS ON THE SHEET THAT WAS NEVER SAT. It used to hold the year OPEN, so
   * it could never be a nudge; now that the year closes on the stamp and
   * Advisory (`readyForYearbook` above), this is where a student is told what
   * they left behind. Last of the four, because a whole season nobody spent is a
   * bigger miss than one class still waiting on the sheet. */
  if (st.classesPending.length) {
    return st.classesPending.length === 1
      ? 'You picked a class this year and never sat it. It is still on your sheet.'
      : `You picked ${st.classesPending.length} classes this year and sat neither of them.`
  }
  return 'Not a season wasted.'
}
