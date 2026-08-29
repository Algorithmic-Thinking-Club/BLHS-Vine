/* THE FOUR KEYS, and the break that made them four.
 *
 * The stadium holds Football in fall, Girls Flag Football in winter and Track and
 * Field in spring, on one field, painted once. Under one `islandId` the first of
 * them to finish marked the other two finished, and the student spent a winter
 * token on a voyage the year model already believed was over. Nothing in any file
 * an author could see said so, which is why it is a test rather than a comment.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PLACES, PROGRAMMES, placeById, placeOfMap, placeOfProgramme, programmeById,
  programmeOfRankTrack, programmesAt, programmeAllowedIn, isPlayable, rankTrackOf,
  rosterFaults, seasonOf, SPORT_SEASONS,
} from './roster'

beforeEach(() => { localStorage.clear() })

describe('the roster refuses a key that holds two things', () => {
  it('has no faults at all', () => {
    expect(rosterFaults()).toEqual([])
  })

  it('names every fault kind rather than only the ones the shipped data has', () => {
    // a place whose arrival is not one of its maps
    expect(rosterFaults(
      [{ id: 'p', name: 'p', maps: ['m'], arrival: 'other', paintings: 1, source: 't' }], [],
    )).toEqual([{ key: 'p', why: 'arrival map "other" is not one of this place\'s maps' }])

    // two places claiming one painting
    expect(rosterFaults([
      { id: 'a', name: 'a', maps: ['m'], arrival: 'm', paintings: 1, source: 't' },
      { id: 'b', name: 'b', maps: ['m'], arrival: 'm', paintings: 1, source: 't' },
    ], [])).toContainEqual({ key: 'm', why: 'map is claimed by both "a" and "b"' })

    // more maps than paintings anybody authorised (W14)
    expect(rosterFaults(
      [{ id: 'a', name: 'a', maps: ['m', 'n'], arrival: 'm', paintings: 1, source: 't' }], [],
    )).toContainEqual({ key: 'a', why: 'carries 2 maps against 1 authorised paintings' })

    // a programme naming a place nobody put on the roster
    expect(rosterFaults([], [
      { id: 'g', name: 'g', place: 'nowhere', kind: 'club', tags: [], playable: false, blurb: '', source: 't' },
    ])).toContainEqual({ key: 'g', why: 'names place "nowhere", which is not on the roster' })

    // and the conflation itself: one string doing two jobs
    expect(rosterFaults(
      [{ id: 'stadium', name: 's', maps: ['stadium'], arrival: 'stadium', paintings: 1, source: 't' }],
      [{ id: 'stadium', name: 's', place: 'stadium', kind: 'club', tags: [], playable: false, blurb: '', source: 't' }],
    ).map((f) => f.why)).toEqual(expect.arrayContaining([
      'is both a programme id and a place id',
      'is both a programme id and a map id',
    ]))
  })
})

describe('a place holds more than one programme (W1, the stadium)', () => {
  it('derives the stadium\'s three programmes from their own place field', () => {
    expect(programmesAt('stadium').map((p) => p.id).sort())
      .toEqual(['football', 'girls-flag-football', 'track-field'])
  })

  it('gives them three different seasons out of one vocabulary', () => {
    expect(seasonOf(programmeById('football')!)).toBe('Fall')
    expect(seasonOf(programmeById('girls-flag-football')!)).toBe('Winter')
    expect(seasonOf(programmeById('track-field')!)).toBe('Spring')
    // and the vocabulary is the school's own table, in one place
    expect(SPORT_SEASONS['girls-flag-football']).toBe('Winter')
  })

  it('gives them three different rank tracks, so one ladder is not three', () => {
    const tracks = programmesAt('stadium').map((p) => rankTrackOf(p.id))
    expect(new Set(tracks).size).toBe(3)
  })

  it('resolves all three to the same place and the place to no map yet', () => {
    for (const id of ['football', 'girls-flag-football', 'track-field'])
      expect(placeOfProgramme(id)?.id).toBe('stadium')
    // nobody has painted it, and a place with no painting says so rather than
    // pretending to a map id
    expect(placeById('stadium')!.maps).toEqual([])
    expect(placeById('stadium')!.paintings).toBe(0)
  })
})

describe('a place made of more than one painting (W2, the home island)', () => {
  it('is one place holding both the hub and the Maw', () => {
    expect(placeOfMap('hub')?.id).toBe('home-island')
    expect(placeOfMap('panther-maw')?.id).toBe('home-island')
    expect(placeById('home-island')!.arrival).toBe('hub')
  })
  it('answers nothing for a map nobody has put on a place', () => {
    expect(placeOfMap('quayprop')).toBeUndefined()
  })
})

describe('playability is a field, not a hardcoded Set (N1)', () => {
  it('is read off the programme and is false for everything today', () => {
    expect(PROGRAMMES.every((p) => !p.playable)).toBe(true)
    expect(isPlayable('football')).toBe(false)
    expect(isPlayable('nothing-by-that-name')).toBe(false)
  })
})

describe('the rank track is its own key space', () => {
  it('resolves keyclub back to Key Club, which a programme lookup could not', () => {
    expect(programmeOfRankTrack('keyclub')?.name).toBe('Key Club')
    expect(programmeById('keyclub')).toBeUndefined()
  })
})

describe('the year model keys completion on the programme (the fatal break)', () => {
  it('finishing football does NOT finish the other two programmes at the stadium', async () => {
    vi.resetModules()
    const save = await import('../save')
    const { yearStatus } = await import('../run/year')

    save.beginAdventure()
    save.writeSave({ introDone: true })
    save.assignSlot(1, 'Fall', 'football')
    save.assignSlot(1, 'Winter', 'girls-flag-football')
    save.assignSlot(1, 'Spring', 'track-field')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.stampPlan(1, ['football', 'girls-flag-football', 'track-field'])

    save.setIslandState('football', 'completed')

    const st = yearStatus(save.loadSave()!)
    const done = Object.fromEntries(st.voyages.map((v) => [v.programmeId, v.done]))
    expect(done).toEqual({ football: true, 'girls-flag-football': false, 'track-field': false })
    // all three are the same place, and the place is not what completion counts
    expect(new Set(st.voyages.map((v) => v.placeId))).toEqual(new Set(['stadium']))
  })

  it('refuses a fall sport a winter token, out of the one season vocabulary', () => {
    const football = programmeById('football')!
    expect(programmeAllowedIn(football, 'Winter')).toBe(false)
    expect(programmeAllowedIn(programmeById('girls-flag-football')!, 'Winter')).toBe(true)
  })
})

describe('a place says WHAT it is and never WHERE it is', () => {
  it('carries no position, because the composition owns that and only one of them is authored', () => {
    /* `Place.at?: {x, y}` was declared here, set by nobody and read by nobody,
     * while src/game/world/composition.ts holds the real one on a slot. MAPVIS W2
     * writes the composition and nothing writes a roster, so a second copy could
     * only ever go stale and put an island in the wrong water without an error. */
    for (const p of PLACES) expect(p).not.toHaveProperty('at')
    const fields = new Set(PLACES.flatMap((p) => Object.keys(p)))
    for (const banned of ['at', 'x', 'y', 'position', 'footprint', 'berth'])
      expect(fields.has(banned)).toBe(false)
  })
})

describe('every entry says where it came from', () => {
  it('carries a source on every place and every programme', () => {
    for (const p of PLACES) expect(p.source.length).toBeGreaterThan(0)
    for (const g of PROGRAMMES) expect(g.source.length).toBeGreaterThan(0)
  })
  it('leaves a room number absent rather than inventing one for ATC', () => {
    expect(placeById('atc-room')!.room).toBeUndefined()
    expect(placeById('flex-200')!.room).toBe('200 Flex')
  })
})
