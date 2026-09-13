// what the player sees between one place and the next, chosen by where they are going
import type { CoverVoice, TransitionSpec } from '../../app/transitions'
import { compositionCache, slotOfMap } from '../world/composition'
import { placeOfMap } from '../roster/roster'

// the set of maps already arrived at this sitting, kept in session storage with a timestamp
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

// what kind of arrival a destination is, worked out from the world and the roster
export type CoverClass = 'arrival' | 'inside' | 'crossing'

export function coverClassOf(mapId: string): CoverClass {
  const c = compositionCache()
  if (c && slotOfMap(c, mapId)) return 'arrival'
  const place = placeOfMap(mapId)
  if (place) return place.arrival === mapId ? 'arrival' : 'inside'
  return 'crossing'
}

// the four cover paintings a destination can wear
const ART_PORT = '/art/ui/loading-port.png'
const ART_MAW = '/art/ui/loading-maw.png'
const ART_ISLANDS = '/art/ui/loading-islands.png'
const ART_VOYAGE = '/art/ui/loading-voyage.png'

/** a cover named for one specific destination, which beats the derived one */
const COVER_ART: Record<string, string> = {
  /* the Central Island is reached by boat and the student steps onto a dock, so
   * the harbour is the picture rather than the archipelago seen from the sky */
  hub: ART_PORT,
  'hub-a2': ART_PORT,
  /* the Maw's cover is the room's own painting, since that is the place you are going */
  'panther-maw': '/maps-painted/panther-maw/scene.png',
}

// the name a map is called on its cover, where the world does not publish one
const MAP_TITLE: Record<string, string> = {
  'panther-maw': "The Panther's Maw",
}

const CLASS_ART: Record<CoverClass, string> = {
  arrival: ART_ISLANDS,
  inside: ART_MAW,
  crossing: ART_VOYAGE,
}

// the one word every cover says over its picture, spaced out by hand
const ENTERING = 'E N T E R I N G'

// the cover for a destination, with whether this is the first time here this sitting
export type CoverChoice = { spec: TransitionSpec; first: boolean; title: string }

export function coverFor(mapId: string, bundleTitle?: string): CoverChoice {
  const first = !seenThisSession(mapId)
  const title = titleOfMap(mapId, bundleTitle)
  // every door gets the painted cover every time, while `first` still marks a real arrival
  const voice: CoverVoice = coverClassOf(mapId)
  // no `holdMs` here, so the cover takes the one shared floor in `transitions.tsx`
  return {
    spec: {
      kind: 'scene',
      title: title.toUpperCase(),
      image: COVER_ART[mapId] ?? CLASS_ART[voice],
      kicker: ENTERING,
      voice,
    },
    first,
    title,
  }
}

// the graduation cover, the one that carries no fact under it
/* ---- PASSING THROUGH, WHICH IS NOT ARRIVING --------------------------------
 *
 * A voyage's first leg goes through whichever map the dock is on, and that hop used
 * to wear the same card as a real arrival: the place's name in spaced capitals, a
 * progress bar and a fact. Ash read it as a second journey he had not asked for.
 *
 * So this says nothing at all. No title, no kicker, no fact, no picture: a short
 * fade, which is what a cut inside one continuous move should be. The name of the
 * place he is actually going to still gets its card when he gets there. */
export function passingCover(): CoverChoice {
  return {
    spec: { kind: 'fade', holdMs: 240, fact: false },
    first: false,
    title: '',
  }
}

export function ceremonyCover(title: string): CoverChoice {
  return {
    spec: {
      kind: 'scene',
      title: title.toUpperCase(),
      holdMs: 2400,
      image: ART_ISLANDS,
      kicker: ENTERING,
      voice: 'ceremony',
      fact: false,
    },
    first: true,
    title,
  }
}

/** the name a player reads for a map, and never its id */
export function titleOfMap(mapId: string, bundleTitle?: string): string {
  const c = compositionCache()
  const slot = c ? slotOfMap(c, mapId) : undefined
  if (slot?.title) return slot.title
  /* THE OVERRIDE SITS ABOVE THE BUNDLE AND BELOW THE WORLD. A slot Ash authored
   * in MAPVIS always wins; below that, a map this game knows the name of says it
   * rather than borrowing the name of the place it happens to sit inside. */
  if (MAP_TITLE[mapId]) return MAP_TITLE[mapId]
  if (bundleTitle) return bundleTitle
  const place = placeOfMap(mapId)
  if (place?.name) return place.name
  /* THE LAST RESORT IS STILL NOT A SLUG. `panther-maw` becomes "Panther Maw",
   * which is a name a fourteen year old can read, and the id never reaches a
   * screen. */
  return mapId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}
