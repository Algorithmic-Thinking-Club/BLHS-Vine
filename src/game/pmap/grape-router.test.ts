/* who owns an anchor, and in what order the router asks */
import { describe, it, expect } from 'vitest'
import { isReady, labelFor, ownerOf } from './grape-router'
import { STATIONS } from '../maw/stations'

/* a real station name off the Maw's own table, so this breaks if the table is emptied rather than passing against a name nobody uses */
const STATION = STATIONS[0].name

describe('who answers to an anchor', () => {
  it('gives it to the station when no island claims it', () => {
    const owner = ownerOf(STATION, [])
    expect(owner?.by).toBe('station')
  })

  it('gives it to the island when the island claims it', () => {
    const owner = ownerOf('coach', ['talk:coach'])
    expect(owner).toEqual({ by: 'grape', handler: 'talk:coach' })
  })

  it('ASKS THE ISLAND FIRST, so the vine queues behind a member like anyone else', () => {
    /* an author on their own map has to be able to take over an anchor the vine already answers to, without asking anybody and without the engine growing a special case */
    const owner = ownerOf(STATION, [`talk:${STATION}`])
    expect(owner).toEqual({ by: 'grape', handler: `talk:${STATION}` })
  })

  it('answers nobody for an anchor nobody claims', () => {
    // W13. Silence is what a member cannot tell apart from their own typo.
    expect(ownerOf('a_name_nobody_wrote', ['talk:coach'])).toBeNull()
  })

  it('does not match a handler that is not a talk handler', () => {
    /* `start` is called by the engine when the island loads and is not an anchor, so an island registering only on_start owns no anchors at all */
    expect(ownerOf('start', ['start'])).toBeNull()
  })

  it('matches the anchor name exactly, prefix and all', () => {
    expect(ownerOf('coach', ['talk:coach_two'])).toBeNull()
    expect(ownerOf('coach_two', ['talk:coach'])).toBeNull()
  })
})

describe('what the player reads', () => {
  it('falls back to the station s own written label', () => {
    const owner = ownerOf(STATION, [])
    expect(labelFor(owner, STATION)).toBe(STATIONS[0].fallbackLabel)
  })

  it('falls back to the anchor s own name for an island', () => {
    /* a member names the handler after the anchor and never writes a label, so the name is the honest last resort rather than something assembled out of the handler key */
    expect(labelFor(ownerOf('coach', ['talk:coach']), 'coach')).toBe('coach')
  })

  it('says nothing for an anchor nobody claims', () => {
    expect(labelFor(null, 'coach')).toBe('coach')
  })
})

describe('whether pressing E would do anything', () => {
  /* this and fire() have to agree, because the prompt decides whether E is ever offered, so a grape-owned anchor the prompt did not know about can never be reached by a key or by a tap */
  const save = { year: 1 }

  it('is ready when an island claims it, with or without a run', () => {
    const owner = ownerOf('coach', ['talk:coach'])
    expect(isReady(owner, save)).toBe(true)
    /* a grape does not need a save to say a line, and requiring one would mean an island cannot speak to somebody who has not joined a class */
    expect(isReady(owner, null)).toBe(true)
  })

  it('is never ready when nobody claims it', () => {
    expect(isReady(null, save)).toBe(false)
  })

  it('needs a run before a station body, which is handed one', () => {
    expect(isReady(ownerOf(STATION, []), null)).toBe(false)
  })

  it('honours a station that says it is closed', () => {
    const closed = ownerOf(STATION, [])
    const always = { by: 'station' as const, station: { ...STATIONS[0], available: () => false } }
    expect(isReady(closed, save)).toBe(!STATIONS[0].available || STATIONS[0].available(save as never))
    expect(isReady(always, save)).toBe(false)
  })
})
