/* THE BADGES, DERIVED FROM THE RUN RATHER THAN WAITED FOR.
 *
 * BRIEF-UI item 10 asks for "the badges page with no badge whose criterion is
 * unreachable", and §40.41 lists that as one of four live instances of the same
 * defect. Audited 2026-09-02, the page had six cards and this state:
 *
 *   `grep grantBadge src/` returned two call sites. One is `transitions.tsx`,
 *   which grants Bookworm at twenty-five collected facts against a pool of
 *   nineteen. The other is the `award` intent, which an island can call and
 *   which no island calls, because no island in the shipped game names a badge.
 *
 * So five cards read "Not yet" forever and the sixth read "Out of reach", and
 * the page was honest about it without being right.
 *
 * ---- WHAT CHANGED, AND WHAT DID NOT ---------------------------------------
 *
 * `progress.ts` already had the answer for cords: `cordsOf` computes them from
 * the save on every read, so a cord cannot be "granted" wrongly and cannot be
 * missed. Three of these six are exactly that kind of fact and were being
 * treated as events:
 *
 *   Cartographer  every island on the chart has been visited. The chart already
 *                 knows both halves of that; nothing had ever compared them.
 *   Renaissance   a season spent in every category the roster has. `plans` holds
 *                 every season a student has ever committed.
 *   Loyal         Captain on any track. `ranksOf` computes the ladder already
 *                 and the rank names are in one place.
 *
 * The other two stay events, honestly:
 *
 *   Resident      spotting an orca is a thing that happens in the world, not a
 *                 fact about the save. It stays on the `award` path.
 *   Early Bird    "with time to spare" has no clock behind it in this game yet,
 *                 and inventing one to make a badge grantable would be inventing
 *                 a mechanic to fit a label.
 *
 * Both of those now say which they are, so a student reads "no island gives this
 * one yet" instead of a criterion that will never come true silently.
 *
 * AND BOOKWORM'S NUMBER IS THE POOL. The threshold is computed from `FACTS`
 * rather than typed, so the criterion cannot drift away from the content again:
 * adding a fact raises the bar, and there is no arithmetic left that can make it
 * unreachable.
 */
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

/* WHAT COUNTS AS "EVERY ISLAND", which is a question about the world document
 * and not about the save. An island a student cannot reach yet is not one they
 * have failed to find, so the denominator is what the chart actually shows. */
function visitedEvery(s: SaveGame, isles: string[]): { done: boolean; detail: string } {
  const seen = new Set((s.exposure ?? []).map((e) => e.place))
  const found = isles.filter((i) => seen.has(i)).length
  return { done: isles.length > 0 && found >= isles.length, detail: `${found} of ${isles.length} found` }
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
  return { done: n >= CATEGORIES.length, detail: `${n} of ${CATEGORIES.length} kinds` }
}

function anyCaptain(s: SaveGame): { done: boolean; detail: string } {
  const ladders = ranksOf(s)
  let best = 0
  for (const years of Object.values(ladders)) best = Math.max(best, years)
  /* `rankName` answers null below JV, which is the honest answer for a student
   * who has not stayed with anything yet and is not a string to print. */
  const named = rankName(best)
  return { done: named === 'Captain', detail: named ?? 'no track yet' }
}

/**
 * every badge, with its criterion and whether the run has met it.
 *
 * `isles` is the chart's own island list, handed in rather than imported,
 * because the world document is loaded asynchronously and this file must stay a
 * pure function of what it is given.
 */
export function badgesOf(s: SaveGame | null, isles: string[] = []): BadgeRow[] {
  const has = (id: string) => !!s?.badges?.includes(id)
  const facts = s?.facts.length ?? 0
  const carto = s ? visitedEvery(s, isles) : { done: false, detail: '' }
  const ren = s ? everyCategory(s) : { done: false, detail: '' }
  const cap = s ? anyCaptain(s) : { done: false, detail: '' }
  return [
    {
      id: 'resident', name: 'Resident', from: 'world',
      how: 'Spot the orca on open water.',
      earned: has('resident'),
    },
    {
      id: 'cartographer', name: 'Cartographer', from: 'run',
      how: 'Discover every island on the chart.',
      earned: has('cartographer') || carto.done,
      detail: carto.detail,
    },
    {
      id: 'early-bird', name: 'Early Bird', from: 'world',
      how: 'Finish a year with time to spare.',
      earned: has('early-bird'),
    },
    {
      id: 'renaissance', name: 'Renaissance Panther', from: 'run',
      how: 'Spend a season in every kind of thing the school offers.',
      earned: has('renaissance') || ren.done,
      detail: ren.detail,
    },
    {
      id: 'loyal', name: 'Loyal', from: 'run',
      how: `Reach ${rankName(3) ?? 'Captain'} on any track.`,
      earned: has('loyal') || cap.done,
      detail: cap.detail,
    },
    {
      id: 'bookworm', name: 'Bookworm', from: 'run',
      /* THE NUMBER IS THE POOL AND IS WRITTEN FROM IT. Twenty-five was typed
       * once against a pool of eighteen and the pool has been nineteen for
       * months; a student read a goal the game could not honour. */
      how: `Collect all ${FACT_POOL} handbook facts.`,
      earned: has('bookworm') || facts >= FACT_POOL,
      detail: `${facts} of ${FACT_POOL}`,
    },
  ]
}

/** the one badge a save can cross on its own while reading the Handbook */
export const bookwormThreshold = FACT_POOL

/* WHETHER A TRACK IS A REAL TRACK, kept beside the ladder it reads so an island
 * added later cannot silently fall out of "any track". */
export const trackOf = rankTrackOf
