// The woven-check chassis + core beat Y1. The content tests are fact tripwires: if one
// fails, someone changed a REAL BLHS truth (a POWER value, the Monday bell, a meeting room).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checksOf, pointsOf } from './frames'
import { emptyScore, gradeOf, RETAKE_BELOW } from './score'
import { CORE_Y1 } from './y1'
import { CORE_BEATS, beatDone } from './beats'
import { FACTS } from '../../app/transitions'

async function freshSave() {
  vi.resetModules()
  return await import('../save')
}
beforeEach(() => { localStorage.clear() })

describe('the frame math', () => {
  it('counts points: choice = 1, sort = 1 per item', () => {
    const checks = checksOf(CORE_Y1)
    expect(checks).toHaveLength(3)
    expect(checks.map(pointsOf)).toEqual([5, 1, 1])   // POWER sort + monday + joining
    expect(emptyScore(CORE_Y1).total).toBe(7)
  })
  it('grades on the real 0-4.0 scale', () => {
    expect(gradeOf({ earned: 7, total: 7 })).toBe(4)
    expect(gradeOf({ earned: 0, total: 7 })).toBe(0)
    expect(gradeOf({ earned: 5, total: 7 })).toBe(2.86)   // a B, honestly computed
  })
})

describe('core beat Y1 content (real BLHS facts)', () => {
  it('the POWER sort carries the five real values, verbatim words', () => {
    const sort = checksOf(CORE_Y1).find((c) => c.kind === 'sort')
    expect(sort?.kind).toBe('sort')
    if (sort?.kind !== 'sort') return
    const pairs = Object.fromEntries(sort.items.map((i) => [i.bucket, i.label]))
    expect(pairs).toEqual({
      P: 'Perseverance', O: 'Ownership', W: 'Work Ethic', E: 'Engagement', R: 'Respect',
    })
  })
  it('the Monday answer is 8:30 (the real late start)', () => {
    const c = checksOf(CORE_Y1).find((x) => x.kind === 'choice' && x.id === 'y1-monday')
    if (c?.kind !== 'choice') throw new Error('missing')
    expect(c.options.find((o) => o.correct)?.text).toContain('8:30')
  })
  it('joining = walk into the meeting (Wiseman’s three-facts minimum)', () => {
    const c = checksOf(CORE_Y1).find((x) => x.kind === 'choice' && x.id === 'y1-joining')
    if (c?.kind !== 'choice') throw new Error('missing')
    expect(c.options.find((o) => o.correct)?.text).toMatch(/walk in/i)
  })
  it('every takeaway resolves to a Handbook fact', () => {
    for (const id of CORE_Y1.takeaways) {
      expect(FACTS.some((f) => f.id === id), `fact ${id}`).toBe(true)
    }
  })
  it('no em-dashes in player copy (law §2.8)', () => {
    for (const s of CORE_Y1.steps) {
      if (s.kind === 'say') expect(s.line.text).not.toMatch(/—/)
    }
  })
})

describe('the ledger + retake policy (§8.1)', () => {
  it('completion writes a core entry; a bad grade may retake once; the retake keeps best', async () => {
    const save = await freshSave()
    const { retakeAvailable } = await import('./score')
    save.beginAdventure()
    // a rough first run: 3 of 7 -> 1.71, under the B- line
    save.recordGrade({ id: 'core:y1', title: CORE_Y1.title, kind: 'core', credit: 0.5, grade: 1.71, year: 1, season: 'Fall' })
    expect(retakeAvailable(save.loadSave()!, 'core:y1')).toBe(true)
    // the retake improves; recordGrade keeps best and marks it spent
    save.recordGrade({ id: 'core:y1', title: CORE_Y1.title, kind: 'core', credit: 0.5, grade: 3.43, year: 1, season: 'Fall', retaken: true })
    const e = save.loadSave()!.ledger.find((x) => x.id === 'core:y1')!
    expect(e.grade).toBe(3.43)
    expect(e.retaken).toBe(true)
    expect(retakeAvailable(save.loadSave()!, 'core:y1')).toBe(false)
  })
  /* THE HOLE THE SKEPTIC PASS FOUND. `retaken` only ever went on the improving
   * branch, so a retake that did the same or worse left the row under the B-
   * line with no flag on it, and the policy that says ONCE offered it again
   * every time. Unlimited, and only for the student who keeps failing. */
  it('a retake that does NOT improve is still spent', async () => {
    const save = await freshSave()
    const { retakeAvailable } = await import('./score')
    save.beginAdventure()
    save.recordGrade({ id: 'core:y1', title: CORE_Y1.title, kind: 'core', credit: 0.5, grade: 1.71, year: 1, season: 'Fall' })
    expect(retakeAvailable(save.loadSave()!, 'core:y1')).toBe(true)
    // ran it back and did worse: the kept grade is still the better one...
    save.recordGrade({ id: 'core:y1', title: CORE_Y1.title, kind: 'core', credit: 0.5, grade: 1.14, year: 1, season: 'Fall', retaken: true })
    const e = save.loadSave()!.ledger.find((x) => x.id === 'core:y1')!
    expect(e.grade).toBe(1.71)
    expect(e.attempts).toBe(2)
    // ...and the second chance is gone, because it was taken
    expect(e.retaken).toBe(true)
    expect(retakeAvailable(save.loadSave()!, 'core:y1')).toBe(false)
  })
  it('a passing grade never offers the retake', async () => {
    const save = await freshSave()
    const { retakeAvailable } = await import('./score')
    save.beginAdventure()
    save.recordGrade({ id: 'core:y1', title: 't', kind: 'core', credit: 0.5, grade: RETAKE_BELOW, year: 1, season: 'Fall' })
    expect(retakeAvailable(save.loadSave()!, 'core:y1')).toBe(false)
  })
  it('beatDone reads the ledger', async () => {
    const save = await freshSave()
    save.beginAdventure()
    expect(beatDone(save.loadSave()!.ledger, 1)).toBe(false)
    save.recordGrade({ id: CORE_BEATS[1].id, title: 't', kind: 'core', credit: 0.5, grade: 4, year: 1, season: 'Fall' })
    expect(beatDone(save.loadSave()!.ledger, 1)).toBe(true)
    expect(beatDone(save.loadSave()!.ledger, 2)).toBe(false)   // Y2 has no beat yet
  })
})
