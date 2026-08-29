/* THE ROSTER: what exists in the world, and which key addresses which part of it.
 *
 * One key called `islandId` used to be five things at once. It was a map id, a
 * planner entry's target, a completion key, a rank track and a member of the
 * playable set, and the real school does not agree that those are one thing.
 * The stadium is the proof: Football runs there in fall under Ashton Bruce,
 * Girls Flag Football in winter under Eric Jarvis and Track and Field in spring
 * under Brooke Wilson. Three programmes, one place, one painting. Under one key
 * the first of them to finish marks the other two finished, and the student
 * spends a winter token on a voyage the year model already believes is over.
 * Nothing in any file an author can see says so.
 *
 * SO THERE ARE FOUR KEYS AND NOTHING HOLDS TWO OF THEM IN ONE FIELD.
 *
 *   a MAP id       one painting, one MAPVIS bundle. `hub`, `panther-maw`.
 *   a PLACE id     one real BLHS location, holding one to four maps, one world
 *                  position, one discovery and one recognition brief.
 *   a PROGRAMME id one thing a student can do at a place: one season, one host,
 *                  one rank track, one completion record per year.
 *   an ACTIVITY SLOT  the planner entry that spends a season token on a
 *                  programme. That one is the run's (80.6) and lives in the
 *                  save; the roster only says what a slot may point at.
 *
 * THE ROSTER IS SHARED BY EVERY STUDENT AND IS NEVER IN THE SAVE. It changes on
 * a deploy. What one student did with it is the run's, and that boundary is the
 * whole reason this file exists.
 *
 * A PROGRAMME NAMES ITS PLACE, and the place's programme list is derived. That
 * way a member building one programme never has to edit another member's file,
 * and the board at the shore still gets a list to read.
 *
 * NOTHING HERE IS INVENTED. Every entry carries where it came from. A field
 * nobody has sourced is absent rather than guessed, which is why ATC has no room
 * number and the stadium has no painting.
 */
import type { Season } from '../save'

export type MapId = string
export type PlaceId = string
export type ProgrammeId = string

/* ---- the season vocabulary, as ONE source ---------------------------------
 *
 * The sheet, the ledger, the sports table, the dock's out-of-season line and a
 * programme manifest all ask the same question and they now ask it here.
 * blhs.sumnersd.org/athletics/our-sports, 2025-26. */
export const SPORT_SEASONS: Record<string, Season> = {
  // fall
  'cross-country': 'Fall', football: 'Fall', 'girls-golf': 'Fall', 'girls-soccer': 'Fall',
  'girls-swim-dive': 'Fall', 'boys-tennis': 'Fall', volleyball: 'Fall',
  // winter
  'boys-basketball': 'Winter', 'girls-basketball': 'Winter', gymnastics: 'Winter',
  'girls-bowling': 'Winter', 'boys-swim-dive': 'Winter', wrestling: 'Winter',
  'girls-flag-football': 'Winter',
  // spring
  baseball: 'Spring', 'boys-golf': 'Spring', 'boys-lacrosse': 'Spring',
  'girls-lacrosse': 'Spring', 'boys-soccer': 'Spring', softball: 'Spring',
  'girls-tennis': 'Spring', 'track-field': 'Spring',
}

/* ---- a place ------------------------------------------------------------- */

export type Place = {
  id: PlaceId
  /** the real place's name as the player reads it */
  name: string
  /* THE MAPS THIS PLACE IS MADE OF, which is W2 and the reason a place is not a
   * map. Two to four connected districts at full resolution is MAPS.md's own
   * answer to getting detail out of a small painting, and this is the field that
   * answer needs. Empty means nobody has painted it yet, and that is honest
   * rather than broken: the dock says so and the voyage reads as still rising. */
  maps: MapId[]
  /** which of its maps a voyage arrives at. Absent while the place has no maps. */
  arrival?: MapId

  /* THERE IS NO `at` HERE, AND PUTTING ONE BACK IS THE BUG. Ruled 2026-08-29.
   *
   * This type carried `at?: {x, y}`, commented "where it sits on the ocean, in
   * the ocean's own untransformed screen space", set by no place and read by no
   * file. It was written before the world composition existed. A POSITION IS THE
   * COMPOSITION'S: `src/game/world/composition.ts`, where a slot carries `at`, a
   * `footprint`, a `state`, a `release` radius and a `berth`, and names a roster
   * place by id.
   *
   * Two fields spelling one fact is the same defect as one key spelling four,
   * which is the whole reason this file exists. It would have been worse here
   * than the `islandId` conflation was, because only ONE of the two is authored:
   * MAPVIS W2 writes the composition, and nothing anywhere writes a roster. A
   * place moved in MAPVIS and a stale `at` still sitting in this file would
   * disagree silently, and the reader that happened to pick this one would put
   * an island in the wrong water with no error.
   *
   * The split, said once: THE ROSTER SAYS WHAT EXISTS AND WHAT HAPPENS THERE.
   * THE COMPOSITION SAYS WHERE IT IS. A place with no slot has not been placed
   * on the water yet, which is a true thing about it and reads correctly as a
   * missing slot rather than as a coordinate of zero. `slotOfPlace(c, placeId)`
   * is the lookup; there is nothing to add to this type to get one. */

  /* W14, THE PAINTING BUDGET. How many paintings this place has been authorised.
   * Every generation is Ash's hands and his explicit word for that specific
   * spend, so a member who needs a second district finds the number here rather
   * than at review. It is a count of what is ALLOWED, not of what exists. */
  paintings: number
  /* P16's recognition brief: which real place this is and what a student's eye
   * is holding. Absent when nobody has written one; never guessed. */
  recognise?: string
  /** where it really is in the building, when a source says. Never invented. */
  room?: string

  /* WHICH CLASS DEPARTMENTS SIT HERE, and it is the field a class beat resolves
   * its room through. `src/game/beats/classes.ts` carried a `HALL` table that
   * mapped a department to 'the AP Academy', 'the international hall', 'the
   * Trades Harbor' and 'the arts wing'. Not one of those is a real BLHS place,
   * not one is on this roster and not one is on a map, so a class beat named a
   * room a student could not walk to and the objective arrow could never point
   * at a class.
   *
   * IT IS EMPTY ON EVERY PLACE TODAY AND THAT IS THE ANSWER, not an omission.
   * `docs/blhs/sourced-facts.md` carries a room for a club (200 Flex, Rm 104,
   * Rm 206/207) and carries none for a department: the course catalog lists what
   * is taught and never where. So a class resolves to nothing and says so, in
   * the same register an unpainted place says it has no painting.
   *
   * Typed as a string rather than the planner's `Dept` because the roster must
   * not import the planner; the planner's vocabulary is 'ap' | 'lang' | 'cte' |
   * 'arts' and `rosterFaults` refuses two places claiming one department. */
  teaches?: string[]

  /** where the two lines above came from */
  source: string
}

/* ---- a programme --------------------------------------------------------- */

export type Programme = {
  id: ProgrammeId
  name: string
  /** the place this happens at. The place's list is derived from this field. */
  place: PlaceId
  kind: 'sport' | 'club'
  /** clubs take any season; a sport's season comes from SPORT_SEASONS by id */
  season?: Season
  /** cord-relevance tags, the same vocabulary classes use */
  tags: string[]
  /* its own rank ladder, or absent when this programme has none. One track per
   * programme rather than one per place: Q80.11.b is open and this is the
   * simple answer, marked as a choice rather than a fact. */
  rankTrack?: string
  /* N1: PLAYABILITY IS A PROPERTY OF THE PROGRAMME, read here.
   * `PLAYABLE_ISLANDS` was a hardcoded Set in year.ts whose own neighbours
   * claimed the list "grows as grapes ship with zero planner-code changes",
   * which was true about the planner and false about the Set. */
  playable: boolean
  /** the one-line WHAT IT IS, sourced */
  blurb: string
  /** who runs it, when a source names them. Never invented. */
  host?: string
  /** where the blurb and the host came from */
  source: string
}

/* ---- the registry (A2), now a list of PLACES ------------------------------ */

const SPORTS_SRC = 'blhs.sumnersd.org/athletics/our-sports, 2025-26'
const CLUBS_SRC = 'blhs.sumnersd.org/activities/clubs-activities/blhs-clubs, 2025-26'

export const PLACES: Place[] = [
  {
    /* the home base, and the first place in the game made of more than one
     * painting. The hub and the Maw are two map ids and one location, the door
     * between them already walks with no page reload, and before the roster
     * there was no way to say they were the same place. */
    id: 'home-island',
    name: 'the Central Island',
    maps: ['hub', 'panther-maw'],
    arrival: 'hub',
    paintings: 2,
    recognise: 'the harbour and the mountain the school lives inside',
    source: 'the game\'s own home base; not a claim about a real BLHS location',
  },
  {
    /* THE SHARED FACILITY, and the reason for the split. Three programmes, three
     * seasons, three coaches, one field. */
    id: 'stadium',
    name: 'the stadium',
    maps: [],
    paintings: 0,
    source: SPORTS_SRC,
  },
  {
    /* the other shared facility in the sourced material: Key Club meets here on
     * Tuesdays and DECA on Thursdays. Only Key Club is on the roster today. */
    id: 'flex-200',
    name: '200 Flex',
    maps: [],
    paintings: 0,
    room: '200 Flex',
    source: CLUBS_SRC,
  },
  {
    /* NO ROOM IS SOURCED FOR ATC and none is invented. The club is real and
     * student-founded; the official clubs hub does not list it yet. */
    id: 'atc-room',
    name: 'the Algorithmic Thinking Club',
    maps: [],
    paintings: 0,
    source: 'student-founded Sep 2025; not yet on the official clubs list',
  },
]

export const PROGRAMMES: Programme[] = [
  {
    id: 'atc', name: 'Algorithmic Thinking Club', place: 'atc-room', kind: 'club',
    tags: [], rankTrack: 'atc', playable: false,
    blurb: 'BLHS’s first CS club. Members build real software, including this game.',
    host: 'Ashwath Polali', source: 'student-founded Sep 2025',
  },
  {
    id: 'football', name: 'Football', place: 'stadium', kind: 'sport',
    tags: [], rankTrack: 'football', playable: false,
    blurb: 'Varsity, JV and Freshmen. Coach Bruce. No tryouts, and Fridays get loud.',
    host: 'Ashton Bruce', source: SPORTS_SRC,
  },
  {
    id: 'girls-flag-football', name: 'Girls Flag Football', place: 'stadium', kind: 'sport',
    tags: [], rankTrack: 'girls-flag-football', playable: false,
    blurb: 'Varsity, JV and C. Coach Jarvis. No-cut, and it runs while the field is quiet.',
    host: 'Eric Jarvis', source: SPORTS_SRC,
  },
  {
    id: 'track-field', name: 'Track and Field', place: 'stadium', kind: 'sport',
    tags: [], rankTrack: 'track-field', playable: false,
    blurb: 'Varsity and JV, co-ed. Coach Wilson. No-cut, and the oval is the whole place.',
    host: 'Brooke Wilson', source: SPORTS_SRC,
  },
  {
    id: 'key-club', name: 'Key Club', place: 'flex-200', kind: 'club',
    tags: ['key-club'], rankTrack: 'keyclub', playable: false,
    blurb: 'Student-led service. Tuesdays 2:10, 200 Flex, with Ms. Berwick.',
    host: 'Ellen Berwick', source: CLUBS_SRC,
  },
]

/* ---- THE ONE RESOLVER ------------------------------------------------------
 *
 * Every question anybody asks about which key means what is answered here, so a
 * second reading of the key space cannot grow somewhere else. Maps are indexed
 * once at module scope rather than scanned per call, because the objective
 * arrow asks `placeOfMap` every frame.
 */

const placeIndex = new Map<PlaceId, Place>(PLACES.map((p) => [p.id, p]))
const programmeIndex = new Map<ProgrammeId, Programme>(PROGRAMMES.map((p) => [p.id, p]))
const mapIndex = new Map<MapId, Place>()
for (const p of PLACES) for (const m of p.maps) if (!mapIndex.has(m)) mapIndex.set(m, p)

export const placeById = (id: PlaceId | undefined): Place | undefined =>
  id ? placeIndex.get(id) : undefined

export const programmeById = (id: ProgrammeId | undefined): Programme | undefined =>
  id ? programmeIndex.get(id) : undefined

/** which place a painting belongs to. One map is on exactly one place. */
export const placeOfMap = (mapId: MapId | undefined): Place | undefined =>
  mapId ? mapIndex.get(mapId) : undefined

/* WHERE A DEPARTMENT'S CLASSES SIT, and today the honest answer is nowhere.
 * A class beat asks this instead of reading an invented hall name off a table,
 * so the day somebody sources a room for the AP department the beat names it and
 * the arrow points at it with no code change. Undefined is a real answer and
 * every caller has to have a line for it. */
const deptIndex = new Map<string, Place>()
for (const p of PLACES) for (const d of p.teaches ?? []) if (!deptIndex.has(d)) deptIndex.set(d, p)

/* the override argument is `rosterFaults`'s own pattern and it is here for the
 * same reason: nothing on the shipped roster teaches a department, so a test that
 * could not supply one could only ever prove the absence and never the lookup. */
export const placeOfDept = (dept: string | undefined, places?: readonly Place[]): Place | undefined => {
  if (!dept) return undefined
  if (!places) return deptIndex.get(dept)
  return places.find((p) => (p.teaches ?? []).includes(dept))
}

/** the place a programme happens at, resolved through the programme's own field */
export const placeOfProgramme = (id: ProgrammeId | undefined): Place | undefined =>
  placeById(programmeById(id)?.place)

/* THE DERIVED LIST, which is the half of Q80.11.a that makes the board at the
 * shore possible: "football is out of season and flag football is not" is a
 * sentence about a place, and a place cannot say it without this. */
export const programmesAt = (placeId: PlaceId | undefined): Programme[] =>
  placeId ? PROGRAMMES.filter((p) => p.place === placeId) : []

/** the season a programme runs in: a sport's is the school's, a club takes any */
export function seasonOf(p: Programme): Season | undefined {
  return p.kind === 'sport' ? (p.season ?? SPORT_SEASONS[p.id]) : undefined
}

/* the season-lock rule, and it is the good version of teaching: the mechanic
 * made the student obey the truth before anybody explained it */
export function programmeAllowedIn(p: Programme, season: Season): boolean {
  const s = seasonOf(p)
  return s === undefined || s === season
}

/** N1: can this programme's loop actually run today */
export const isPlayable = (id: ProgrammeId | undefined): boolean =>
  !!programmeById(id)?.playable

/** the rank ladder this programme climbs, or null when it has none */
export const rankTrackOf = (id: ProgrammeId | undefined): string | null =>
  programmeById(id)?.rankTrack ?? null

/* AND BACK THE OTHER WAY, which is the lookup the diploma needed and did not
 * have. `save.ranks` is keyed by rank track and the cape printed
 * `activityById(track)?.name ?? track`, so Key Club's ladder, whose track is
 * spelled `keyclub` and whose programme id is spelled `key-club`, printed the
 * raw key on a graduating student's diploma. A track is its own key space and
 * resolving it is a lookup rather than a spelling. */
const trackIndex = new Map<string, Programme>()
for (const p of PROGRAMMES) if (p.rankTrack && !trackIndex.has(p.rankTrack)) trackIndex.set(p.rankTrack, p)

export const programmeOfRankTrack = (track: string | undefined): Programme | undefined =>
  track ? trackIndex.get(track) : undefined

/* ---- the refusal the boundary is worth ------------------------------------
 *
 * Publish-time rather than render-time, which is F9's argument applied to a key
 * rather than to an anchor. It runs in the roster's test and is exported so a
 * future manifest loader can run it over a member's entry before it ships.
 */
export type RosterFault = { key: string; why: string }

export function rosterFaults(places = PLACES, programmes = PROGRAMMES): RosterFault[] {
  const out: RosterFault[] = []
  const seenMap = new Map<MapId, PlaceId>()
  const seenDept = new Map<string, PlaceId>()
  for (const p of places) {
    /* A DEPARTMENT SITS IN ONE PLACE. Two places claiming one department is the
     * `HALL` table growing back in data: a class beat would resolve whichever
     * entry happened to be first and the answer would move when somebody
     * reordered the list. */
    for (const d of p.teaches ?? []) {
      const owner = seenDept.get(d)
      if (owner) out.push({ key: d, why: `department is taught at both "${owner}" and "${p.id}"` })
      else seenDept.set(d, p.id)
    }
    if (p.arrival && !p.maps.includes(p.arrival))
      out.push({ key: p.id, why: `arrival map "${p.arrival}" is not one of this place's maps` })
    if (!p.arrival && p.maps.length)
      out.push({ key: p.id, why: 'has maps but names none of them as the arrival' })
    if (p.maps.length > p.paintings)
      out.push({ key: p.id, why: `carries ${p.maps.length} maps against ${p.paintings} authorised paintings` })
    for (const m of p.maps) {
      const owner = seenMap.get(m)
      if (owner) out.push({ key: m, why: `map is claimed by both "${owner}" and "${p.id}"` })
      else seenMap.set(m, p.id)
    }
  }
  const placeIds = new Set(places.map((p) => p.id))
  for (const g of programmes) {
    if (!placeIds.has(g.place)) out.push({ key: g.id, why: `names place "${g.place}", which is not on the roster` })
    if (g.kind === 'sport' && seasonOf(g) === undefined)
      out.push({ key: g.id, why: 'is a sport with no season in the vocabulary' })
    /* THE KEY SPACES STAY DISJOINT. Nothing enforces this in a type, and a
     * programme that shares a string with the map it is played on is exactly how
     * the conflation grows back. */
    if (placeIds.has(g.id)) out.push({ key: g.id, why: 'is both a programme id and a place id' })
    if (seenMap.has(g.id)) out.push({ key: g.id, why: 'is both a programme id and a map id' })
  }
  return out
}
