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

export function yearStatus(s: SaveGame): YearStatus {
  const year = s.year
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
    readyForYearbook: plan.stamped && coreBeatDone && classesPending.length === 0 && plan.classes.length === 2,
    yearbookSeen: s.flags.includes(`yearbook:y${year}`),
  }
}

/** the yearbook's one gentle nudge (§7.6) — observed, never scolding */
export function nudgeLine(st: YearStatus): string {
  const rising = st.voyages.find((v) => !v.playable && !v.done)
  if (rising) return `The ${rising.name} island is still rising from the sea. Your flag waits at its dock.`
  const open = SEASONS.find((se) => !st.voyages.some((v) => v.season === se))
  if (open) return `You left ${open.toLowerCase()} open this year. The sea kept the time.`
  const unplayed = st.voyages.find((v) => v.playable && !v.done)
  if (unplayed) return `You never did sail for ${unplayed.name}. The dock remembers.`
  return 'Not a season wasted.'
}
