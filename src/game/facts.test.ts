/* checks every fact the game states about the school carries a real source and a date */
import { describe, it, expect } from 'vitest'
import { FACTS, factById } from './facts'
import { CORE_Y2 } from './beats/y2'
import { checksOf } from './beats/frames'

describe('every fact says where it came from', () => {
  it('has a source and a checked date on every entry', () => {
    for (const f of FACTS) {
      expect(f.source.length, f.id).toBeGreaterThan(8)
      expect(f.checked, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(f.text.length, f.id).toBeGreaterThan(20)
    }
  })

  it('cites a document that exists, never docs/research/', () => {
    // two research paths were cited by eight files and neither has ever been in this repository
    for (const f of FACTS) expect(f.source, f.id).not.toContain('docs/research')
  })

  it('has one entry per id, so no fact can be stated twice', () => {
    expect(new Set(FACTS.map((f) => f.id)).size).toBe(FACTS.length)
  })
})

describe('the three sentences that were invented', () => {
  it('AP Capstone no longer ends "with the exams passed"', () => {
    const f = factById('f-capstone')!
    expect(f.text).not.toContain('exam')
    // docs/blhs/awards.md: "AP Seminar & Research plus 4 additional AP classes"
    expect(f.text).toContain('AP Seminar')
    expect(f.text).toContain('four more AP classes')
    expect(f.source).toContain('BLHS awards list')
  })

  it('the Seal of Biliteracy is the state rule, not three years and a capstone', () => {
    const f = factById('f-seal')!
    expect(f.text).toContain('proficiency in English')
    expect(f.text).toContain('four credits of one world language')
    expect(f.text).not.toMatch(/three (or more )?years/i)
    expect(f.source).toContain('RCW 28A.300.575')
  })

  it('the honors bands are the school\'s two exclusive bands', () => {
    const f = factById('f-honor-gpa')!
    expect(f.text).toContain('3.76 to 4.0')
    expect(f.text).toContain('3.5 to 3.759')
  })
})

describe('the year-2 beat teaches the same table', () => {
  it('cites awards.md and states the passing rule the district actually has', () => {
    const said = CORE_Y2.steps.filter((s) => s.kind === 'say').map((s) => (s as { line: { text: string } }).line.text)
    const all = said.join(' ')
    expect(all).toContain('a D or better')
    expect(all).toContain('four credits of one')
  })

  it('does not ask a student to sort a criterion nobody published', () => {
    const sort = checksOf(CORE_Y2).find((c) => c.kind === 'sort')
    if (!sort || sort.kind !== 'sort') throw new Error('the cord sort is gone')
    const seal = sort.items.find((i) => i.bucket === 'Seal of Biliteracy')!
    expect(seal.label).toBe('Four credits of one world language')
  })

  it('names every takeaway against a real fact in the table', () => {
    for (const id of CORE_Y2.takeaways) expect(factById(id), id).toBeTruthy()
  })
})

/* and no string a student reads names a file in this repository */

describe('what a student is shown as a source', () => {
  it('never prints a path into this repository, on any fact', () => {
    for (const f of FACTS) {
      expect(f.source, f.id).not.toMatch(/docs\/|\.md\b|\.ts\b|src\//)
      expect(f.source.length, f.id).toBeGreaterThan(8)
    }
  })
})
