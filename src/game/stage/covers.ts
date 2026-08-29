/* WHAT THE PLAYER SEES BETWEEN ONE PLACE AND THE NEXT.
 *
 * §80.4's E2: covers callable from a station, a cutscene and an intent. E1 cut
 * the controller out of the router (`src/app/transitions.tsx`); this file is the
 * decision layer over it, and the decisions are the two the substrate names:
 *
 *   A COVER IS CHOSEN BY THE DESTINATION RATHER THAN BY THE DOOR. Twenty islands
 *   with three rooms each is sixty doors and twenty destinations, and if the door
 *   picks, sixty authors pick sixty different ways. Q80.4.c's recommendation on
 *   record is painted for arrivals and quick for interior doors, and that is a
 *   property of where you are going.
 *
 *   ONE SHOWN-ALREADY SET SERVES THE COVER CHOICE AND THE PLACE CARD, EXPIRING ON
 *   A REAL CLOCK, so a week-old session is not one session. §80.4 asks for one
 *   set rather than two, because two sets is how the card fires on a map whose
 *   full cover was skipped.
 */
import type { TransitionSpec } from '../../app/transitions'
import { compositionCache, slotOfMap } from '../world/composition'
import { placeOfMap } from '../roster/roster'

/* ---- the shown-already set ------------------------------------------------
 *
 * A REAL CLOCK, NOT A MODULE VARIABLE. A module variable resets on a reload and
 * survives a week in a tab that never closed, and both of those are wrong in the
 * same classroom: a student who reloads sees every card again, and a student who
 * left the tab open over a weekend sees none. Session storage plus a stamp gets
 * both right, and it is deliberately session storage rather than the save,
 * because what a student has seen this sitting is not part of their run. */
const SEEN_KEY = 'blhs_seen_v1'
export const SESSION_MS = 45 * 60 * 1000   // one advisory block, and then some

type SeenRow = { at: number }

const readSeen = (): Record<string, SeenRow> => {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as Record<string, SeenRow>
    const now = Date.now()
    const live: Record<string, SeenRow> = {}
    for (const [k, v] of Object.entries(j)) if (now - v.at < SESSION_MS) live[k] = v
    return live
  } catch { return {} }
}

const writeSeen = (rows: Record<string, SeenRow>) => {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(rows)) } catch { /* private mode */ }
}

/** has this map been arrived at inside the live session window */
export function seenThisSession(mapId: string): boolean {
  return !!readSeen()[mapId]
}

export function markSeen(mapId: string) {
  const rows = readSeen()
  rows[mapId] = { at: Date.now() }
  writeSeen(rows)
}

/** the proof harness and the tests need a clean slate */
export function clearSeen() { try { sessionStorage.removeItem(SEEN_KEY) } catch { /* ignore */ } }

/* ---- the cover for a destination -------------------------------------------
 *
 * A FIRST ARRIVAL AT A PLACE GETS THE PAINTED CARD. It carries the cover art,
 * the map's own name, and one real fact off the fact table, which is the whole
 * of what the brief asks a door swap to show. Coming back through the same door
 * in the same sitting gets the quick one, because the card is an arrival and not
 * a loading screen: it fires when a student reaches somewhere, and reaching
 * somewhere twice in four minutes is not reaching it.
 *
 * The name is read off the composition, then off the roster, then off the
 * bundle's own title, and only then off the id. A SLUG IS NEVER SHOWN: §80.4
 * says the place card never shows one and this is the function that could. */
export type CoverChoice = { spec: TransitionSpec; first: boolean; title: string }

export function coverFor(mapId: string, bundleTitle?: string): CoverChoice {
  const first = !seenThisSession(mapId)
  const title = titleOfMap(mapId, bundleTitle)
  if (!first) {
    /* THE QUICK ONE STILL HAS A MINIMUM DWELL. A fetch that comes back in
     * eighty milliseconds under a cover with no floor is a flash, which reads as
     * a bug rather than as a transition. */
    return { spec: { kind: 'iris', holdMs: 240 }, first, title }
  }
  return {
    spec: { kind: 'scene', title: title.toUpperCase(), holdMs: 1800, image: '/art/ui/loading-voyage.png' },
    first, title,
  }
}

/** the name a player reads for a map, and never its id */
export function titleOfMap(mapId: string, bundleTitle?: string): string {
  const c = compositionCache()
  const slot = c ? slotOfMap(c, mapId) : undefined
  if (slot?.title) return slot.title
  if (bundleTitle) return bundleTitle
  const place = placeOfMap(mapId)
  if (place?.name) return place.name
  /* THE LAST RESORT IS STILL NOT A SLUG. `panther-maw` becomes "Panther Maw",
   * which is a name a fourteen year old can read, and the id never reaches a
   * screen. */
  return mapId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}
