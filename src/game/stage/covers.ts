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
import type { CoverVoice, TransitionSpec } from '../../app/transitions'
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

/* ---- WHAT KIND OF ARRIVAL A DESTINATION IS -------------------------------
 *
 * DERIVED FROM DATA SOMEBODY ALREADY AUTHORED, not from a second table nobody
 * will maintain. Two facts already on the wire answer it between them:
 *
 *   the world composition puts a SLOT on the water for every map that is a place
 *   you sail to, so a map with a slot is somewhere you arrive at from outside;
 *
 *   the roster's `Place.arrival` names which of a place's maps a voyage lands on,
 *   so a map that belongs to a place and is NOT its arrival is somewhere you walk
 *   into from inside. `home-island` carries `maps: ['hub', 'panther-maw']` and
 *   `arrival: 'hub'`, which is exactly the archipelago-versus-the-Maw distinction
 *   §4.1 is about, already written down and never once read.
 *
 * A map that is in neither is a crossing: the open sea, or a destination nobody
 * has placed yet. It gets the ship, which is the honest picture for "somewhere
 * this game has not put on the chart". */
export type CoverClass = 'arrival' | 'inside' | 'crossing'

export function coverClassOf(mapId: string): CoverClass {
  const c = compositionCache()
  if (c && slotOfMap(c, mapId)) return 'arrival'
  const place = placeOfMap(mapId)
  if (place) return place.arrival === mapId ? 'arrival' : 'inside'
  return 'crossing'
}

/* ---- THE COVER ART REGISTRY ----------------------------------------------
 *
 * §3.1's own words: "This cover is also the first instance of the thing that has
 * no document. Ash asked for a per-destination painted cover, one for the
 * archipelago and another for the Maw, and there is no account anywhere of where
 * those come from or how a new one is added. The game holds two by hand today."
 *
 * It held ONE by hand, and it was the wrong one: `loading-voyage.png` was
 * hardcoded for every destination in the game, so walking into a cave under a
 * volcano raised a tall ship at sunset. `public/art/ui/` has held
 * `loading-maw.png`, `loading-port.png` and `loading-islands.png` the whole time
 * and nothing in `src/` named any of them.
 *
 * THIS IS THE GAME-SIDE HALF OF Q3.1.a AND IT DOES NOT DECIDE IT. The open
 * question is whether a map's cover ships inside its MAPVIS bundle or lives in a
 * registry keyed by map id. This is the registry, with a derived answer under it
 * so an island nobody has entered here still gets the right KIND of cover rather
 * than nothing. The day a bundle carries its own cover, this table becomes the
 * fallback and one line reads the bundle first.
 *
 * The four paintings, and what each one is actually of, checked by looking:
 *   loading-port     a jetty, a boathouse and palms with a ketch on a gold sea
 *   loading-maw      a lit cavern behind a waterfall, a lectern under lanterns
 *   loading-islands  one volcanic island ringed by small ones, seen from above
 *   loading-voyage   a tall ship crossing open water toward a headland
 */
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
  /* THE MAW WEARS ITS OWN ROOM (BRIEF-CLOSE-THE-LOOP section 5).
   *
   * Ash, 2026-09-08: *"Do not call it 'Bonney Lake Highschool' call it the
   * Panthers Maw, on the transition screen, and any other dialogue. and change
   * the transition picture for it, to something better."*
   *
   * `loading-maw.png` is a generic lit cavern with a waterfall and a lectern,
   * drawn before the room existed and showing a place that is not in the game.
   * `scene.png` IS the room: the same oval floor, the same two bridges and the
   * same lava the student is about to be standing in. A cover is a picture of
   * where you are going, and this is the only picture of it. */
  'panther-maw': '/maps-painted/panther-maw/scene.png',
}

/* ---- AND WHAT IT IS CALLED, WHICH THE PLACE WAS ANSWERING FOR IT ----------
 *
 * `titleOfMap` falls through the world composition, the bundle's own title, and
 * then the PLACE. The Maw belongs to `home-island`, whose name is Bonney Lake
 * High School, and the live world publishes no slot for the Maw, so every cover
 * into the room a student spends the whole game in said the name of the school
 * that contains it. Ash saw it and said so.
 *
 * ONE TABLE, KEYED THE SAME WAY THE ART IS, because it is the same class of
 * decision: what this destination is called, said once, where somebody looking
 * for it will find it. The day the platform's world publishes a slot for the Maw
 * this row agrees with it and can go. */
const MAP_TITLE: Record<string, string> = {
  'panther-maw': "The Panther's Maw",
}

const CLASS_ART: Record<CoverClass, string> = {
  arrival: ART_ISLANDS,
  inside: ART_MAW,
  crossing: ART_VOYAGE,
}

/* ---- WHAT THE COVER SAYS OVER THE PICTURE --------------------------------
 *
 * ONE WORD, SPACED BY HAND rather than by letter-spacing alone, which is how the
 * kicker has always been drawn: the tracking on its own reads as tracking and
 * this reads as lettering.
 *
 * §4.1 wanted the word to change with the kind of arrival, and it did: ENTERING,
 * INSIDE, GOING TO and THE CEREMONY, with the plaque moving up and down the
 * painting to match. That is the design Ash looked at and called bad.
 *
 * ---- AND THEN ASH PLAYED IT, 2026-09-06 ----------------------------------
 *
 * His words: the two covers he likes are the archipelago one and the far shore
 * one, "every other cover is bad", and a cover "says where you are going and
 * nothing else". The two he likes are the two that were written by hand before
 * any of the reasoning above existed: `kind: 'scene'`, one word over a painting
 * over a name, no fact, no per-destination voice.
 *
 * So the four voices collapse to one word. What §4.1 wanted was for the second
 * cover to feel like a different EVENT from the first, and the answer it reached
 * for was a different caption and a different plaque height; the answer Ash gave
 * after looking at both is that the painting behind it is the difference and the
 * lettering is not supposed to move at all. The type stays where the archipelago
 * cover puts it on every destination in the game.
 *
 * `CoverVoice` survives because the picture is still chosen by it and because it
 * is a published type. It no longer changes a word or a position. */
const ENTERING = 'E N T E R I N G'

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
  /* ---- EVERY DOOR GETS THE PAINTED COVER, EVERY TIME ----------------------
   *
   * ASH, PLAYING 2026-09-06: "no cover plays at all when walking from the hub
   * into the Maw or from the Maw back out to the hub."
   *
   * He is right, and this was the line. Q80.4.c's recommendation on record was
   * painted for arrivals and quick for interior doors, and the shown-already set
   * turned every door after the first into a 240 millisecond iris, which at a
   * door you take four times in a session is indistinguishable from a hard cut.
   * The Maw is the door the whole first act runs through, so the one transition a
   * student takes most often in the game was the one with nothing on it.
   *
   * `first` still travels with the choice, because the ARRIVAL CARD is a genuine
   * first-time-here event and its rule has not changed. Only the cover has: a
   * cover is the page turning, and a page turns the same way every time. */
  const voice: CoverVoice = coverClassOf(mapId)
  /* NO `holdMs` HERE ON PURPOSE. It used to say 1800 while the bar's CSS was
   * drawn for `(holdMs ?? 2600) + 620` and the controller waited
   * `holdMs ?? 60`, which is three numbers for one wait. `holdFloorMs` in
   * `transitions.tsx` is the one number now and a painted cover takes it, so a
   * destination only says a floor when it means something different from every
   * other destination. */
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

/* ---- THE ONE COVER THAT CARRIES NO FACT ----------------------------------
 *
 * §14.4, in as many words: "A fact card does not belong on this cover. The run
 * is over, the fact pool exists to teach during a wait, and a freshman-facing
 * club fact under the word Graduation is the wrong instrument at the wrong
 * moment. That is a content decision and it should be written into the cover
 * registry rather than left to whoever wires it."
 *
 * So it is written into the registry. `src/game/run/Graduation.tsx` is the
 * caller and this session does not own that file, so nothing calls it yet and
 * the handoff says so; the decision is recorded here rather than left for
 * whoever wires the ceremony to make again from scratch. */
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
