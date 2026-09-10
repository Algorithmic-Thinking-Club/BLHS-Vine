/* four years played through, and what a student is actually holding at the end */
import { describe, it, expect, beforeEach, vi } from 'vitest'

/* ---- ASH, 2026-09-09 ------------------------------------------------------
 *
 * *"I also dont know if all the multi-year logic has been implemented yet, all
 * the different cords, achievements, etc. i dont know how that actually works as
 * of right now. but i dont have high hopes."*
 *
 * He was right not to. An audit played this road and found the GPA hard-capped
 * at 3.33 (so both honours cords were unreachable while the counselor draped one
 * at 95% every year), the diploma reporting "Islands completed: 0" after four
 * years of finished programmes, and the rank ladder never advancing.
 *
 * THIS IS THE ROAD, WALKED. It plays four years the way the game plays them and
 * then asks what the student is holding. It is deliberately end to end rather
 * than a unit test of `cordsOf`: every one of those defects was a seam between
 * two things that each worked.
 */

async function fresh() {
  vi.resetModules()
  const save = await import('../save')
  const progress = await import('../progress')
  const year = await import('./year')
  const pick = await import('./pick')
  const beats = await import('../beats/beats')
  const diploma = await import('./diploma')
  return { save, progress, year, pick, beats, diploma }
}

type M = Awaited<ReturnType<typeof fresh>>

/** one year, played: pick, stamp, ace Advisory, finish every pick, turn the page */
function playYear(m: M, y: number, classes: string[], club: string | null) {
  const { save } = m
  save.setFlag(`vignette:y${y}`)
  for (const c of classes) save.pickClass(y, c)
  if (club) save.assignSlot(y, 'Fall', club)
  save.stampPlan(y, club ? [club] : [])
  save.recordGrade({
    id: m.beats.coreBeatId(y), title: 'Advisory', kind: 'core',
    credit: 0.5, grade: 4, year: y, season: 'Fall',
  })
  /* every pick, through the one button the sheet actually offers */
  for (const p of m.pick.picksOf(save.loadSave(), y)) {
    if (!p.done) m.pick.countAsDone(p)
  }
  save.setFlag(`yearbook:y${y}`)
}

describe('four years, played', () => {
  beforeEach(() => localStorage.clear())

  it('reaches a GPA the honours cords can actually be earned at', async () => {
    const m = await fresh()
    m.save.beginAdventure()
    m.save.writeSave({ introDone: true })
    m.save.setFlag('maw:founding')

    playYear(m, 1, ['ap-human-geo', 'spanish-1'], 'football')
    m.save.endYear()
    playYear(m, 2, ['ap-seminar', 'spanish-2'], 'football')
    m.save.endYear()
    playYear(m, 3, ['ap-research', 'spanish-3'], 'football')
    m.save.endYear()
    playYear(m, 4, ['ap-lang', 'spanish-4'], 'football')

    const s = m.save.loadSave()!
    const gpa = m.progress.gpaOf(s)
    /* ---- THE ONE THAT WAS BROKEN ------------------------------------
     *
     * A placeholder pick used to carry half a credit at a flat B, so two a year
     * outweighed one perfect Advisory and the mean was pinned at 3.33. Highest
     * Honors wants 3.76. It carries no credit now, so a student who aces the
     * only graded thing in the game reads what he earned. */
    expect(gpa, 'a perfect Advisory every year is a perfect GPA').toBe(4)
    expect(gpa!).toBeGreaterThanOrEqual(3.76)
  })

  it('advances a rank ladder across the years it was picked in', async () => {
    const m = await fresh()
    m.save.beginAdventure()
    m.save.writeSave({ introDone: true })

    playYear(m, 1, ['ap-human-geo'], 'football')
    expect(m.progress.rankName(m.progress.ranksOf(m.save.loadSave()!).football ?? 0)).toBe('JV')
    m.save.endYear()

    playYear(m, 2, ['spanish-1'], 'football')
    expect(m.progress.rankName(m.progress.ranksOf(m.save.loadSave()!).football ?? 0)).toBe('Varsity')
    m.save.endYear()

    playYear(m, 3, ['spanish-2'], 'football')
    expect(m.progress.rankName(m.progress.ranksOf(m.save.loadSave()!).football ?? 0)).toBe('Captain')
  })

  /* one finish is one go, which `setIslandState` used to double by writing a
   * second completion behind the one the sheet had just written */
  it('counts one finish as one attempt', async () => {
    const m = await fresh()
    m.save.beginAdventure()
    m.save.writeSave({ introDone: true })
    playYear(m, 1, ['ap-human-geo'], 'football')
    const row = m.save.loadSave()!.completions!.find((c) => c.programme === 'football')!
    expect(row.attempts).toBe(1)
  })

  it('tells the diploma how many islands were finished', async () => {
    const m = await fresh()
    m.save.beginAdventure()
    m.save.writeSave({ introDone: true })
    playYear(m, 1, ['ap-human-geo'], 'football')

    const s = m.save.loadSave()!
    /* `setIslandState` is what the world and the diploma read, and only the
     * grape path ever called it: a student who finished every pick from the
     * sheet graduated to "Islands completed: 0" */
    expect(s.islands.football).toBe('completed')
  })

  /* an island that finishes without scoring says so rather than reading as an F */
  it('does not print an F for a programme that finished without a grade', async () => {
    const m = await fresh()
    m.save.beginAdventure()
    m.save.writeSave({ introDone: true })
    m.save.pickClass(1, 'ap-human-geo')
    m.save.assignSlot(1, 'Fall', 'football')
    m.save.stampPlan(1, ['football'])
    m.save.recordCompletion('football', null)

    const { wallOf } = await import('./wall')
    const seat = wallOf(m.save.loadSave())!.find((w) => w.id === 'programme:football')!
    expect(seat.earned).toBe(true)
    expect(seat.says).toBe('finished')
    expect(seat.says).not.toContain('F')
  })
})
