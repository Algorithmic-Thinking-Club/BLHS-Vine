// THE YEAR'S RHYTHM as pure state (§7.5) — what this year still asks of the student,
// derived entirely from the save. The required spine of a year: the stamped sheet, the
// advisory core beat, and the two focus classes. Committed island voyages complete when
// their islands are playable (§6.6 — the grape phase); until then they read honestly as
// "still rising" and never block the yearbook. Every beat is individually resumable
// because every beat's doneness lives on the ledger/plan, not in component state.

import type { SaveGame, Season } from '../save'
import { SEASONS } from '../save'
import { hasCoreBeat, beatDone } from '../beats/beats'
import { classDone } from '../beats/classes'
import { activityById } from '../planner/catalog'

export type VoyageStatus = {
  season: Season
  activityId: string
  name: string
  islandId?: string
  /** an island scene exists and the loop can play (flips as grapes ship) */
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

// island scenes that can actually PLAY their loop today — grows as grapes ship (§16 F).
// (Sessions A/B are building the maps; the ARRIVE→DO→RESULT loop is future spine work.)
const PLAYABLE_ISLANDS = new Set<string>([])

export function yearStatus(s: SaveGame): YearStatus {
  const year = s.year
  const plan = s.plans[year] ?? { slots: {}, classes: [], stamped: false }
  const voyages: VoyageStatus[] = SEASONS.flatMap((season) => {
    const id = plan.slots[season]
    if (!id) return []
    const a = activityById(id)
    return [{
      season, activityId: id, name: a?.name ?? id, islandId: a?.islandId,
      playable: !!a?.islandId && PLAYABLE_ISLANDS.has(a.islandId),
      done: !!a?.islandId && s.islands[a.islandId] === 'completed',
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
