// The year loop (§7.5/§7.6): status derivation, the nudge, the class-beat generator, and
// the full year-close sequence. The generator sweep is a tripwire across the WHOLE real
// catalog: every generated check must have exactly one correct answer.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { classBeat } from '../beats/classes'
import { CLASSES, classById } from '../planner/catalog'
import { checksOf } from '../beats/frames'
import { programmeById } from '../roster/roster'

async function freshSave() {
  vi.resetModules()
  return await import('../save')
}
async function freshYear() {
  const save = await import('../save')
  const year = await import('./year')
  return { save, year }
}
beforeEach(() => { localStorage.clear() })

describe('classBeat generation (real catalog, zero invented content)', () => {
  it('every class in the catalog generates a valid beat: one correct option per check', () => {
    for (const c of CLASSES) {
      const b = classBeat(c, 1)
      expect(b.id).toBe(`class:${c.id}`)
      expect(b.kind).toBe('class')
      expect(b.tags).toEqual(c.tags)
      const checks = checksOf(b)
      expect(checks.length).toBeGreaterThanOrEqual(1)
      for (const ch of checks) {
        if (ch.kind !== 'choice') throw new Error('class checks are choices')
        expect(ch.options.filter((o) => o.correct).length, `${c.id}:${ch.id}`).toBe(1)
      }
    }
  })
  it('the cord answer matches the class truth', () => {
    const correctText = (id: string) => {
      const b = classBeat(classById(id)!, 1)
      const ch = checksOf(b)[0]
      if (ch.kind !== 'choice') throw new Error()
      return ch.options.find((o) => o.correct)!.text
    }
    expect(correctText('ap-human-geo')).toContain('AP Honors')
    expect(correctText('culinary-1')).toContain('Career Readiness')
    expect(correctText('spanish-4')).toContain('Seal')
    expect(correctText('ap-cs-java')).toContain('Two at once')
    expect(correctText('band')).toContain('No cord')
  })
  it('chained classes get the ladder check; open ones do not', () => {
    expect(checksOf(classBeat(classById('spanish-2')!, 2))).toHaveLength(2)
    expect(checksOf(classBeat(classById('ap-human-geo')!, 1))).toHaveLength(1)
  })
})

describe('yearStatus (§7.5 derived, resumable anywhere)', () => {
  it('walks a whole Year 1 to the yearbook and closes it', async () => {
    const save = await freshSave()
    const { yearStatus, nudgeLine } = await import('./year')
    save.beginAdventure()
    save.writeSave({ introDone: true })

    let st = yearStatus(save.loadSave()!)
    expect(st.planStamped).toBe(false)
    expect(st.readyForYearbook).toBe(false)

    // plan the year: football (Fall), atc (Winter), two classes, stamp
    save.assignSlot(1, 'Fall', 'football')
    save.assignSlot(1, 'Winter', 'atc')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.stampPlan(1, ['football', 'atc'])

    st = yearStatus(save.loadSave()!)
    expect(st.planStamped).toBe(true)
    expect(st.readyForYearbook).toBe(false)            // advisory + classes still owed
    /* a voyage is named off the programme it points at, in the order the seasons run */
    expect(st.voyages.map((v) => v.name))
      .toEqual([programmeById('football')!.name, programmeById('atc')!.name])
    expect(st.voyages.every((v) => !v.playable)).toBe(true)   // islands still rising

    // advisory + both classes
    save.recordGrade({ id: 'core:y1', title: 't', kind: 'core', credit: 0.5, grade: 4, year: 1, season: 'Fall' })
    save.recordGrade({ id: 'class:ap-human-geo', title: 't', kind: 'class', credit: 0.5, grade: 4, year: 1, season: 'Fall', tags: ['ap'] })
    st = yearStatus(save.loadSave()!)
    expect(st.classesPending).toEqual(['spanish-1'])
    save.recordGrade({ id: 'class:spanish-1', title: 't', kind: 'class', credit: 0.5, grade: 3.43, year: 1, season: 'Winter', tags: ['lang'] })

    /* ---- EVERY PICK HOLDS THE YEAR (Ash, 2026-09-08 items 4 and 6) --------
     *
     * The two clubs used to be exempt, because nothing could finish a club whose
     * island nobody had built and the year would have hung on them for ever.
     * There is one button per pick now and it always finishes the pick, so the
     * exemption is gone and the gate means what it says. */
    st = yearStatus(save.loadSave()!)
    expect(st.readyForYearbook).toBe(false)            // the two clubs are still owed
    expect(nudgeLine(st)).toContain('not open yet')

    /* pressing each club's one button counts it (`run/pick.ts`, `countAsDone`) */
    save.recordCompletion('football', 3)
    save.recordCompletion('atc', 3)
    st = yearStatus(save.loadSave()!)
    expect(st.readyForYearbook).toBe(true)

    // the page turns
    save.setFlag('yearbook:y1')
    save.endYear()
    const s2 = save.loadSave()!
    expect(s2.year).toBe(2)
    expect(s2.tokens).toEqual(['Fall', 'Winter', 'Spring'])
    const st2 = yearStatus(s2)
    expect(st2.planStamped).toBe(false)                // a fresh sheet for year 2
    expect(st2.vignetteSeen).toBe(false)               // the year-2 vignette waits
  })

  /* the yearbook never nudges a student about a season he left empty */
  it('never nudges about a season, because no student was ever shown one', async () => {
    const { save, year } = await freshYear()
    vi.resetModules()
    const s = await import('../save')
    const y = await import('./year')
    s.beginAdventure()
    s.assignSlot(1, 'Fall', 'atc')
    s.pickClass(1, 'ap-human-geo'); s.pickClass(1, 'band')
    s.stampPlan(1, ['atc'])
    s.setIslandState('atc', 'completed')
    const st = y.yearStatus(s.loadSave()!)
    const line = y.nudgeLine(st).toLowerCase()
    expect(line).not.toMatch(/fall|winter|spring|season token/)
    /* and it still says something true: two classes on the sheet, neither sat */
    expect(line).toContain('classes')
    void save; void year
  })

  it('flags are one-shot and idempotent', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.setFlag('vignette:y1'); save.setFlag('vignette:y1')
    expect(save.loadSave()!.flags).toEqual(['vignette:y1'])
    expect(save.hasFlag('vignette:y1')).toBe(true)
    expect(save.hasFlag('vignette:y2')).toBe(false)
  })
})
