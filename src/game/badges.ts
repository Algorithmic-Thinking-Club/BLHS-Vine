/* the six badges, most of them worked out from the run rather than granted by an event */
import { FACTS } from './facts'
import type { SaveGame } from './save'
import { ranksOf, rankName } from './progress'
import { PROGRAMMES, rankTrackOf } from './roster/roster'

export type BadgeId = 'resident' | 'cartographer' | 'early-bird' | 'renaissance' | 'loyal' | 'bookworm'

/** how many true things about Bonney Lake there are to collect at all */
export const FACT_POOL = FACTS.length

export type BadgeRow = {
  id: BadgeId
  name: string
  /** the criterion, in the words a student reads */
  how: string
  earned: boolean
  /** where it comes from, which decides what an unearned card says */
  from: 'run' | 'world'
  /** live progress for the ones that count something, else undefined */
  detail?: string
}

/* what counts as every island comes from the world document, not the save: an island a student cannot reach yet is not one they failed to find, so the denominator is what the chart shows */
function visitedEvery(s: SaveGame, isles: string[]): { done: boolean; detail: string } {
  const seen = new Set((s.exposure ?? []).map((e) => e.place))
  const found = isles.filter((i) => seen.has(i)).length
  return { done: isles.length > 0 && found >= isles.length, detail: `${found} of ${isles.length} islands seen` }
}

/** every category the roster offers, which is what "every category" has to mean */
const CATEGORIES = [...new Set(PROGRAMMES.map((p) => p.kind))]

function everyCategory(s: SaveGame): { done: boolean; detail: string } {
  const spent = new Set<string>()
  for (const plan of Object.values(s.plans ?? {})) {
    for (const id of Object.values(plan.slots ?? {})) {
      const p = PROGRAMMES.find((q) => q.id === id)
      if (p) spent.add(p.kind)
    }
  }
  const n = CATEGORIES.filter((c) => spent.has(c)).length
  return { done: n >= CATEGORIES.length, detail: `${n} of ${CATEGORIES.length} kinds of activity` }
}

function anyCaptain(s: SaveGame): { done: boolean; detail: string } {
  const ladders = ranksOf(s)
  let best = 0
  for (const years of Object.values(ladders)) best = Math.max(best, years)
  /* `rankName` answers null below JV, the honest answer for a run that has not stayed with anything, and not a string to print */
  const named = rankName(best)
  return { done: named === 'Captain', detail: named ?? 'No rank yet' }
}

/** every badge, with its criterion and whether this run has met it */
export function badgesOf(s: SaveGame | null, isles: string[] = []): BadgeRow[] {
  const has = (id: string) => !!s?.badges?.includes(id)
  const facts = s?.facts.length ?? 0
  const carto = s ? visitedEvery(s, isles) : { done: false, detail: '' }
  const ren = s ? everyCategory(s) : { done: false, detail: '' }
  const cap = s ? anyCaptain(s) : { done: false, detail: '' }
  return [
    {
      id: 'resident', name: 'Orca Spotter', from: 'world',
      how: 'Spot the orca on open water.',
      earned: has('resident'),
    },
    {
      id: 'cartographer', name: 'Island Finder', from: 'run',
      how: 'See every island on the chart.',
      earned: has('cartographer') || carto.done,
      detail: carto.detail,
    },
    {
      id: 'early-bird', name: 'Early Bird', from: 'world',
      how: 'Finish a year with time to spare.',
      earned: has('early-bird'),
    },
    {
      id: 'renaissance', name: 'All-Around Panther', from: 'run',
      how: 'Spend a season on a sport and a season in a club.',
      earned: has('renaissance') || ren.done,
      detail: ren.detail,
    },
    {
      id: 'loyal', name: 'Loyal', from: 'run',
      how: `Reach ${rankName(3) ?? 'Captain'} in any sport or club.`,
      earned: has('loyal') || cap.done,
      detail: cap.detail,
    },
    {
      id: 'bookworm', name: 'Bookworm', from: 'run',
      /* the goal count is read from the pool and never typed: a hardcoded 25 against a pool of 18 told students to collect facts the game did not have */
      how: `Collect all ${FACT_POOL} school facts.`,
      earned: has('bookworm') || facts >= FACT_POOL,
      detail: `${facts} of ${FACT_POOL} facts`,
    },
  ]
}

/** the one badge a save can cross on its own while reading the Handbook */
export const bookwormThreshold = FACT_POOL

/* whether a track is a real track, kept beside the ladder it reads so an island added later cannot silently fall out of any track */
export const trackOf = rankTrackOf
