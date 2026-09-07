/* WHAT `award` WRITES, which used to be one number and a lie about it.
 *
 * Every island's grade landed as `kind: 'core'`, `credit: 0.5`, no tags, and an id
 * made of a base-36 timestamp. So an island moved the GPA the same amount as
 * every other island, could never move a cord no matter what it was about,
 * appeared on the transcript titled "Awarded", and weighted the GPA twice if the
 * island was played twice. Four separate consequences of four missing fields.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function fresh() {
  vi.resetModules()
  const save = await import('./save')
  const { engine } = await import('./intent-engine')
  const progress = await import('./progress')
  const roster = await import('./roster/roster')
  return { save, engine, progress, roster }
}

beforeEach(() => { localStorage.clear() })

describe('award, named at a programme', () => {
  it('writes the island\'s real title, an island\'s credit, and the programme\'s tags', async () => {
    const { save, engine, roster } = await fresh()
    save.beginAdventure()
    engine.award({ programme: 'key-club', grade: 3.5 })
    const row = save.loadSave()!.ledger[0]
    /* THE NAME THE ROSTER IS CURRENTLY PRINTING, which today is the placeholder
       (BRIEF-MAW-RAIL-3 B) and the day Key Club has an island is "Key Club". The
       thing under test is that the row is titled off the ROSTER rather than off
       the id, and asking it this way survives either. */
    expect(row.title).toBe(roster.programmeById('key-club')!.name)
    expect(row.kind).toBe('island')
    expect(row.credit).toBe(1)
    expect(row.tags).toContain('key-club')
    expect(row.rank).toBe('keyclub')
  })

  it('has a STABLE id, so playing the island twice in a year does not weigh the GPA twice', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    engine.award({ programme: 'football', grade: 2 })
    engine.award({ programme: 'football', grade: 3 })
    const led = save.loadSave()!.ledger
    expect(led).toHaveLength(1)
    expect(led[0].id).toBe('island:football:y1')
    expect(led[0].grade).toBe(3)
    expect(led[0].attempts).toBe(2)
    expect(led[0].firstGrade).toBe(2)
  })

  it('marks the programme complete in THIS year and no other', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    engine.award({ programme: 'football', grade: 3 })
    const s = save.loadSave()!
    expect(save.completedIn(s, 'football', 1)).toBe(true)
    expect(save.completedIn(s, 'football', 2)).toBe(false)
    // and its three-programme place does not come along with it
    expect(save.completedIn(s, 'girls-flag-football', 1)).toBe(false)
    expect(save.completedIn(s, 'track-field', 1)).toBe(false)
  })

  it('climbs the rank ladder off the record rather than off a field nobody writes', async () => {
    const { save, engine, progress } = await fresh()
    save.beginAdventure()
    engine.award({ programme: 'football', grade: 3 })
    expect(progress.rankName(progress.ranksOf(save.loadSave()!).football ?? 0)).toBe('JV')
    save.endYear()
    engine.award({ programme: 'football', grade: 3 })
    expect(progress.rankName(progress.ranksOf(save.loadSave()!).football ?? 0)).toBe('Varsity')
    save.endYear()
    engine.award({ programme: 'football', grade: 3 })
    expect(progress.rankName(progress.ranksOf(save.loadSave()!).football ?? 0)).toBe('Captain')
    // three years on one ladder, and the record still holds all three
    expect(save.yearsCompleted(save.loadSave()!, 'football')).toEqual([1, 2, 3])
  })

  it('a replay inside one year is one year on the ladder, not two', async () => {
    const { save, engine, progress } = await fresh()
    save.beginAdventure()
    engine.award({ programme: 'football', grade: 3 })
    engine.award({ programme: 'football', grade: 4 })
    expect(progress.ranksOf(save.loadSave()!).football).toBe(1)
  })
})

describe('award with no programme behind it', () => {
  it('still lands somewhere the GPA maths can see, and still has a stable id', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    engine.award({ grade: 3, sticker: 'first-sail' })
    engine.award({ grade: 3, sticker: 'first-sail' })
    const led = save.loadSave()!.ledger
    expect(led).toHaveLength(1)
    expect(led[0].id).toBe('award:y1:first-sail')
    expect(led[0].kind).toBe('core')
    expect(save.loadSave()!.stickers).toEqual(['first-sail'])
  })

  it('does not lose a grade to a typo in the programme name', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    engine.award({ programme: 'foottball', grade: 3 })
    const row = save.loadSave()!.ledger[0]
    expect(row.grade).toBe(3)
    // and it says what it was asked for, so the author can see the typo
    expect(row.title).toContain('foottball')
    expect(save.loadSave()!.completions).toEqual([])
  })
})
