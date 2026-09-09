// the roster: the places, programmes and maps that exist in the world, and how each is addressed
import type { Season } from '../save'
import { MEMBER_ISLANDS } from './member-islands'
import { EXAMPLE_BLURB, EXAMPLE_SOURCE, exampleLabel, examplePlace } from './example'

export type MapId = string
export type PlaceId = string
export type ProgrammeId = string

/** which season each school sport runs in, the one source every screen asks */
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
  // the paintings this place is made of, one to four; empty means nobody has painted it yet
  maps: MapId[]
  /** which of its maps a voyage arrives at. Absent while the place has no maps. */
  arrival?: MapId

  // a place has no position here: the roster says what exists, the world composition says where

  // how many paintings this place is allowed, which is not how many it has
  paintings: number
  /* P16's recognition brief: which real place this is and what a student's eye
   * is holding. Absent when nobody has written one; never guessed. */
  recognise?: string
  /** where it really is in the building, when a source says. Never invented. */
  room?: string

  // which class departments are taught here, so a class beat can name a real room
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
  // whether this programme has a playable island behind it
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

/** the real place names, under the placeholder mask below. Screens read PLACES, not this. */
export const SOURCED_PLACES: Place[] = [
  {
    // the home base, one place made of two paintings with a door between them
    id: 'home-island',
    // this place is the school itself, so it carries the school's name
    name: 'Bonney Lake High School',
    maps: ['hub', 'panther-maw'],
    arrival: 'hub',
    paintings: 2,
    recognise: 'You land at the harbor. The school is inside the mountain.',
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

/* THE PROGRAMMES THE VINE ITSELF KNOWS ABOUT: sourced, hand written, Ash's.
 * What ATC ships is appended below, out of a data file, because a member adding
 * a programme by editing this array would be a member editing the engine. */
const OURS: Programme[] = [
  {
    id: 'atc', name: 'Algorithmic Thinking Club', place: 'atc-room', kind: 'club',
    tags: [], rankTrack: 'atc', playable: false,
    blurb: 'BLHS’s first CS club. Members build real software, including this game.',
    host: 'Ashwath Polali', source: 'student-founded Sep 2025',
  },
  {
    id: 'football', name: 'Football', place: 'stadium', kind: 'sport',
    tags: [], rankTrack: 'football', playable: false,
    // the blurb names the season, because the card a student reads shows no season of its own
    blurb: 'Varsity, JV and Freshmen. Coach Bruce. No tryouts, it runs in fall, and Fridays get loud.',
    host: 'Ashton Bruce', source: SPORTS_SRC,
  },
  {
    id: 'girls-flag-football', name: 'Girls Flag Football', place: 'stadium', kind: 'sport',
    tags: [], rankTrack: 'girls-flag-football', playable: false,
    blurb: 'Varsity, JV and C. Coach Jarvis. No-cut, and it runs in winter.',
    host: 'Eric Jarvis', source: SPORTS_SRC,
  },
  {
    id: 'track-field', name: 'Track and Field', place: 'stadium', kind: 'sport',
    tags: [], rankTrack: 'track-field', playable: false,
    blurb: 'Varsity and JV, co-ed. Coach Wilson. No-cut, and it runs in spring.',
    host: 'Brooke Wilson', source: SPORTS_SRC,
  },
  {
    id: 'key-club', name: 'Key Club', place: 'flex-200', kind: 'club',
    tags: ['key-club'], rankTrack: 'keyclub', playable: false,
    blurb: 'Student-led service. Tuesdays 2:10, 200 Flex, with Ms. Berwick.',
    host: 'Ellen Berwick', source: CLUBS_SRC,
  },
]

// what members shipped is appended from a data file, so a row can never redefine a sourced one
/** the authored truth, under the mask. See `SOURCED_PLACES`. */
export const SOURCED_PROGRAMMES: Programme[] = [
  ...OURS,
  ...MEMBER_ISLANDS.map((i): Programme => ({
    id: i.programme,
    name: i.name,
    place: i.place,
    kind: i.kind,
    ...(i.season ? { season: i.season } : {}),
    tags: i.tags,
    ...(i.rankTrack ? { rankTrack: i.rankTrack } : {}),
    playable: i.playable,
    blurb: i.blurb,
    ...(i.host ? { host: i.host } : {}),
    source: i.source,
  })),
]

/** the programmes as a student reads them: anything not playable wears an Example A name */
export const PROGRAMMES: Programme[] = (() => {
  let n = 0
  return SOURCED_PROGRAMMES.map((p) => p.playable ? p : {
    ...p,
    name: exampleLabel(n++),
    blurb: EXAMPLE_BLURB,
    host: undefined,
    source: EXAMPLE_SOURCE,
  })
})()

/** the places as a student reads them: one with no painting and nothing playable gets a letter */
export const PLACES: Place[] = (() => {
  const real = new Set(PROGRAMMES.filter((p) => p.playable).map((p) => p.place))
  let n = 0
  return SOURCED_PLACES.map((p) => (p.maps.length || real.has(p.id)) ? p : {
    ...p,
    name: examplePlace(n++),
    recognise: undefined,
    room: undefined,
    source: EXAMPLE_SOURCE,
  })
})()

// the lookups, built once at module scope because the objective arrow asks them every frame

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

// which place teaches a department, and undefined is a real answer every caller must handle
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
/* WHERE A CLASS IS SAT, AND IT IS ONE QUESTION WITH ONE ANSWER.
 *
 * ASH, 2026-09-08: *"My Year's 'Go to class' plays that class's beat… when a
 * class has an island, the same button sails there instead, decided by the
 * roster, no second button."*
 *
 * ONE BUTTON IS THE WHOLE POINT. A sheet that grew a second control the day
 * somebody shipped an island would be a sheet whose two classes look different
 * from each other for a reason a student cannot see. The button means "go to this
 * class"; whether that is a quiz on the sheet or a voyage is the roster's
 * business, and this is the roster answering.
 *
 * A CLASS AND A PROGRAMME SHARE AN ID WHEN THEY ARE THE SAME THING. The four key
 * spaces at the top of this file stay separate; this is the one deliberate
 * crossing and it is opt-in. A course only has an island if somebody put a
 * programme carrying the course's own id on the roster, made it playable, and
 * gave its place a painting. Nothing in the catalog does today, so every class is
 * a beat and the button says so. */
export function islandForClass(classId: string): { programme: Programme; map: string } | null {
  return islandForProgramme(classId)
}

/* ---- AND THE SAME QUESTION FOR A CLUB OR A SPORT -------------------------
 *
 * ASH, 2026-09-08 item 4: *"one button per pick, the roster decides"*. A club
 * and a class are the same question with the same answer, and asking it twice in
 * two places is how they came to have two different controls. `islandForClass`
 * is now this with the course id passed in, kept because a dozen callers say it
 * and it is the sentence they mean. */
export function islandForProgramme(id: string | undefined): { programme: Programme; map: string } | null {
  const g = PROGRAMMES.find((p) => p.id === id)
  if (!g?.playable) return null
  const place = PLACES.find((pl) => pl.id === g.place)
  const map = place?.arrival ?? place?.maps[0]
  return map ? { programme: g, map } : null
}

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

// back the other way: a rank track is its own key space, so resolve it rather than spell it
const trackIndex = new Map<string, Programme>()
for (const p of PROGRAMMES) if (p.rankTrack && !trackIndex.has(p.rankTrack)) trackIndex.set(p.rankTrack, p)

export const programmeOfRankTrack = (track: string | undefined): Programme | undefined =>
  track ? trackIndex.get(track) : undefined

// what a broken roster entry looks like, checked at publish time rather than while drawing
export type RosterFault = { key: string; why: string }

export function rosterFaults(places = PLACES, programmes = PROGRAMMES): RosterFault[] {
  const out: RosterFault[] = []
  const seenMap = new Map<MapId, PlaceId>()
  const seenDept = new Map<string, PlaceId>()
  for (const p of places) {
    // a department sits in exactly one place, so two places claiming it is a fault
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
