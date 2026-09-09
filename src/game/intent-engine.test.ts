/* what award writes into the ledger: a real title, an island's credit, tags and a stable id */
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
    /* the row is titled off the roster rather than off the id */
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

/* ---- what the closing film reads: where the year is, and what the student picked ---- */
describe('phase, which is where the year is', () => {
  it('is the sequencer\'s own answer and not a second copy of the rule', async () => {
    const { save, engine } = await fresh()
    vi.resetModules()
    const objective = await import('./run/objective')
    save.beginAdventure()
    save.writeSave({ introDone: true })
    expect(engine.read('phase')).toBe(objective.nextObjective(save.loadSave())!.phase)
  })

  it('reaches "yearbook" only when the whole year is done, not when Advisory is', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    save.writeSave({ introDone: true })
    save.setFlag('maw:founding')
    save.setFlag('vignette:y1')
    /* Advisory sat with NO stamped sheet: the fire is over and the year is not,
     * which is precisely the state an ending written as "advisory is None" would
     * have played in. */
    save.recordGrade({
      id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    expect(engine.read('phase')).not.toBe('yearbook')
    save.pickClass(1, 'ap-human-geo')
    save.stampPlan(1)
    /* AND STILL NOT, BECAUSE A PICKED CLASS IS PART OF THE YEAR. Ash, 2026-09-08:
     * *"The year is done only when every picked thing with play behind it is
     * done: both classes today."* The sheet is stamped and Advisory is sat, and
     * the one thing he chose is still unsat, so the arrow sends him to it. */
    expect(engine.read('phase')).toBe('class')
    save.recordGrade({
      id: 'class:ap-human-geo', title: 'AP Human Geography', kind: 'class',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    expect(engine.read('phase')).toBe('yearbook')
  })

  it('answers for a run that has not started rather than throwing', async () => {
    const { engine } = await fresh()
    expect(engine.read('phase')).toBe(null)
  })
})

describe('picks, which is what he is congratulated on', () => {
  it('names the classes he chose and the grade he earned', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    save.pickClass(1, 'ap-human-geo')
    save.recordGrade({
      id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    const p = engine.read('picks') as {
      classes: { id: string; name: string }[]
      graded: { title: string; grade: string; kind: string }[]
      gpa: number | null
    }
    expect(p.classes.map((c) => c.id)).toEqual(['ap-human-geo'])
    expect(p.classes[0].name).toBe('AP Human Geography')
    expect(p.graded[0].kind).toBe('core')
    /* THE LETTER COMES FROM progress.ts, which is where the wall and the
     * yearbook read it, so one afternoon cannot be described three ways. */
    expect(p.graded[0].grade).toBe('A')
  })

  it('masks a season programme nobody has built, the way every other surface does', async () => {
    const { save, engine, roster } = await fresh()
    save.beginAdventure()
    save.assignSlot(1, 'Fall', 'football')
    const p = engine.read('picks') as { seasons: { id: string; name: string }[] }
    expect(p.seasons[0].id).toBe('football')
    expect(p.seasons[0].name).toBe(roster.programmeById('football')!.name)
    expect(p.seasons[0].name).not.toBe('Football')
  })

  it('is empty and not broken with no run at all', async () => {
    const { engine } = await fresh()
    expect(engine.read('picks')).toEqual({ classes: [], seasons: [], graded: [], gpa: null })
  })
})
