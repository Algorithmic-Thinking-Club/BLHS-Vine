/* tests that a year owes exactly one Advisory lesson and that sitting it makes the fire quiet */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CORE_Y1 } from './y1'
import { coreBeatFor, coreBeatId, hasCoreBeat } from './beats'

async function fresh() {
  vi.resetModules()
  const save = await import('../save')
  const { engine } = await import('../intent-engine')
  return { save, engine }
}

beforeEach(() => { localStorage.clear() })

describe("year one's Advisory is the lesson the brief names", () => {
  it('is y1, and its takeaways are POWER, the Monday rhythm and joining', async () => {
    const { save } = await fresh()
    save.beginAdventure()
    expect(coreBeatFor(1, save.loadSave()!)).toBe(CORE_Y1)
    expect(CORE_Y1.id).toBe('core:y1')
    expect(coreBeatId(1)).toBe('core:y1')
    /* the four sourced takeaways, which are what the study measures. Named here
     * so that renaming one is a deliberate edit rather than a silent drift. */
    expect(CORE_Y1.takeaways).toEqual(['f-power-full', 'f-monday', 'f-25th-credit', 'f-join-clubs'])
    expect(hasCoreBeat(1)).toBe(true)
  })
})

describe('the fire, once it has been sat', () => {
  it('offers the beat exactly once, and answers nothing after any grade', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    expect(engine.read('advisory')).toBe('core:y1')

    save.recordGrade({
      id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5,
      grade: 3.6, year: 1, season: 'Fall',
    })
    expect(engine.read('advisory'), 'the fire is still offering a lesson already sat').toBeNull()
  })

  it('is quiet after a FAIL too, because a failed sitting still happened', async () => {
    const { save, engine } = await fresh()
    save.beginAdventure()
    save.recordGrade({
      id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5,
      grade: 0.4, year: 1, season: 'Fall',
    })
    expect(engine.read('advisory')).toBeNull()
  })

  it('keeps one row for one lesson when it is retaken', async () => {
    /* the Universal Retake Policy is real and it is ONCE. What must never happen
     * is a second ledger row for the same lesson, which would put the credit on
     * the transcript twice and move the GPA twice. */
    const { save } = await fresh()
    save.beginAdventure()
    const row = {
      id: 'core:y1', title: 'Advisory', kind: 'core' as const, credit: 0.5,
      year: 1, season: 'Fall' as const,
    }
    save.recordGrade({ ...row, grade: 1.2 })
    save.recordGrade({ ...row, grade: 3.1, retaken: true })
    const ledger = save.loadSave()!.ledger.filter((e) => e.id === 'core:y1')
    expect(ledger).toHaveLength(1)
    expect(ledger[0].grade).toBe(3.1)
    expect(ledger[0].firstGrade).toBe(1.2)
    expect(ledger[0].attempts).toBe(2)
  })

  it('does not wake up for year two, because the session ends at year one', async () => {
    /* BRIEF-MAW-RAIL-3 C and D together: the year no longer advances at the page
     * turn, so `core:y2` is never owed inside a thirty minute session and there
     * is no road to a second lesson at all. */
    const { save, engine } = await fresh()
    save.beginAdventure()
    save.recordGrade({
      id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5,
      grade: 3.6, year: 1, season: 'Fall',
    })
    const { turnYearPage } = await import('../run/yearbook-page')
    turnYearPage(save.loadSave()!, 1)
    expect(save.loadSave()!.year).toBe(1)
    expect(engine.read('advisory')).toBeNull()
  })
})
