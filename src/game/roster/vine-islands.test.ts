/* tests that the Maw finds its own python, stays off the roster, and can be asked its questions */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VINE_ISLANDS, vineIslandOfMap } from './vine-islands'
import { islandOfMap } from './member-islands'
import { PROGRAMMES } from './roster'

async function fresh() {
  vi.resetModules()
  const save = await import('../save')
  const { engine } = await import('../intent-engine')
  return { save, engine }
}

beforeEach(() => { localStorage.clear() })

describe('the vine owns some maps and a member owns the rest', () => {
  it('binds panther-maw to a folder', () => {
    expect(vineIslandOfMap('panther-maw')?.folder).toBe('panther-maw')
  })

  it('and does it WITHOUT putting the room on the roster', () => {
    /* a roster row for the Maw would make it a season token a student could spend */
    expect(islandOfMap('panther-maw')).toBeUndefined()
    expect(PROGRAMMES.some((p) => p.id === 'the-maw' || p.id === 'panther-maw')).toBe(false)
  })

  it('claims no map a member island already claims', () => {
    for (const v of VINE_ISLANDS) expect(islandOfMap(v.map)).toBeUndefined()
  })

  it('names each map once', () => {
    const maps = VINE_ISLANDS.map((v) => v.map)
    expect(new Set(maps).size).toBe(maps.length)
  })
})

describe('the questions a station has to be able to ask', () => {
  it('cord_board hands over the whole live row, not just what is earned', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    const board = engine.read('cord_board') as { name: string; detail: string; progress: number }[]
    expect(board.length).toBeGreaterThan(0)
    /* `detail` is the tracker board's own status line, so the counselor says the same words */
    for (const c of board) {
      expect(typeof c.name).toBe('string')
      expect(typeof c.detail).toBe('string')
      expect(typeof c.progress).toBe('number')
    }
  })

  it('and cords is left exactly as it was, the earned ids', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    expect(engine.read('cords')).toEqual([])
  })

  it('trophies answers what is on the wall, which award could write and nothing could read', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    expect(engine.read('trophies')).toEqual({ stickers: [], badges: [] })
    engine.award({ sticker: 'first-voyage' })
    engine.award({ badge: 'resident' })
    expect(engine.read('trophies')).toEqual({ stickers: ['first-voyage'], badges: ['resident'] })
  })

  it('advisory names the beat this year still owes', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    expect(engine.read('advisory')).toBe('core:y1')
  })

  it('and goes quiet once it is sat, so the fire cannot grade the same year twice', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    save.recordGrade({
      id: 'core:y1', title: 'This is the place', kind: 'core', credit: 0.5,
      grade: 3.4, year: 1, season: 'Fall',
    })
    expect(engine.read('advisory')).toBeNull()
  })

  /* the rail asks whether the student stamped the pick screen or closed it */
  it('planned is false until the sheet is really stamped', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    expect(engine.read('planned')).toBe(false)
    save.assignSlot(1, 'Fall', 'atc')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'band')
    // picked, and the wax is not on it
    expect(engine.read('planned')).toBe(false)
    save.stampPlan(1, ['atc'])
    expect(engine.read('planned')).toBe(true)
  })

  it('every new path answers with no run at all, like the nine before them', async () => {
    const { engine } = await fresh()
    expect(engine.read('cord_board')).toEqual([])
    expect(engine.read('trophies')).toEqual({ stickers: [], badges: [] })
    expect(engine.read('advisory')).toBeNull()
    expect(engine.read('planned')).toBe(false)
  })
})
