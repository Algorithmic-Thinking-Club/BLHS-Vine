// core beats y2 to y4: fact tripwires against the sources, and the y4 generator's audit math
import { describe, it, expect } from 'vitest'
import { checksOf } from './frames'
import { CORE_Y2 } from './y2'
import { CORE_Y3 } from './y3'
import { coreY4 } from './y4'
import { coreBeatFor, beatDone, hasCoreBeat, coreBeatId } from './beats'
import { FACTS } from '../../app/transitions'
import type { LedgerEntry, SaveGame } from '../save'

let n = 0
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: `e${n++}`, title: 't', kind: 'island', credit: 1, grade: 4, year: 1, season: 'Fall', ...over,
})
const mkSave = (ledger: LedgerEntry[], over: Partial<SaveGame> = {}): SaveGame => ({
  v: 2, id: 'r1', handle: 'T', pronouns: '', boatName: '', year: 4, season: 'Fall',
  beat: 'x', introDone: true, plans: {}, flags: [], tokens: [], ledger, ranks: {},
  islands: {}, stickers: [], facts: [], badges: [], savedAt: 1, ...over,
})

const sayTexts = (b: { steps: { kind: string; line?: { text: string } }[] }) =>
  b.steps.filter((s) => s.kind === 'say').map((s) => (s as { line: { text: string } }).line.text).join(' ')

describe('Y2 — the hidden ladder (Ms. Pinzon’s real criteria)', () => {
  it('the cord sort matches the authoritative table exactly', () => {
    const sort = checksOf(CORE_Y2).find((c) => c.kind === 'sort')
    if (sort?.kind !== 'sort') throw new Error('missing sort')
    const pairs = Object.fromEntries(sort.items.map((i) => [i.bucket, i.label]))
    /* the bucket is the honor's name rather than the cord's colour */
    expect(pairs['Highest Honors']).toContain('3.76')
    expect(pairs['Career Readiness']).toContain('Two CTE credits')
    expect(pairs['AP Honors']).toContain('Five passed AP')
    /* the seal is four credits of one world language, not two different ones */
    expect(pairs['Seal of Biliteracy']).toContain('one world language')
  })
  it('the retake answer carries the real 79% threshold', () => {
    const c = checksOf(CORE_Y2).find((x) => x.kind === 'choice' && x.id === 'y2-retake')
    if (c?.kind !== 'choice') throw new Error('missing')
    expect(c.options.find((o) => o.correct)?.text).toContain('79%')
  })
  it('speaks the real GPA bands in dialogue', () => {
    const t = sayTexts(CORE_Y2)
    expect(t).toContain('3.76')
    expect(t).toContain('3.5')
  })
})

describe('Y3 — the long game (catalog truths)', () => {
  it('24 credits is the correct answer, not a distractor', () => {
    const c = checksOf(CORE_Y3).find((x) => x.kind === 'choice' && x.id === 'y3-credits')
    if (c?.kind !== 'choice') throw new Error('missing')
    expect(c.options.find((o) => o.correct)?.text).toContain('Twenty-four')
  })
  it('the Capstone recipe is Seminar + Research + four more', () => {
    const c = checksOf(CORE_Y3).find((x) => x.kind === 'choice' && x.id === 'y3-capstone')
    if (c?.kind !== 'choice') throw new Error('missing')
    const t = c.options.find((o) => o.correct)?.text ?? ''
    expect(t).toContain('Seminar')
    expect(t).toContain('Research')
    expect(t).toContain('four more')
  })
  it('the credit stack in dialogue matches the catalog breakdown', () => {
    const t = sayTexts(CORE_Y3)
    for (const piece of ['four of English', 'Three each of math', 'Two of arts', 'One CTE', 'Four electives']) {
      expect(t).toContain(piece)
    }
  })
})

describe('Y4 — the generated audit (the student’s own numbers)', () => {
  const correctText = (s: SaveGame) => {
    const c = checksOf(coreY4(s)).find((x) => x.kind === 'choice' && x.id === 'y4-gpa-audit')
    if (c?.kind !== 'choice') throw new Error('missing')
    const winners = c.options.filter((o) => o.correct)
    expect(winners).toHaveLength(1)
    return winners[0].text
  }
  it('a 3.8 GPA audits to Highest Honors', () => {
    expect(correctText(mkSave([entry({ grade: 3.8 })]))).toContain('Highest Honors')
  })
  it('a 3.6 GPA audits to High Honors', () => {
    expect(correctText(mkSave([entry({ grade: 3.6 })]))).toContain('High Honors')
  })
  it('a 2.0 GPA audits honestly to neither', () => {
    expect(correctText(mkSave([entry({ grade: 2.0 })]))).toContain('Neither')
  })
  it('an empty transcript audits to neither, with the GPA read as blank', () => {
    const b = coreY4(mkSave([]))
    expect(correctText(mkSave([]))).toContain('Neither')
    const c = checksOf(b)[0]
    if (c.kind !== 'choice') throw new Error()
    /* 'unwritten' made the prompt read "Your GPA stands at unwritten." */
    expect(c.prompt).toContain('blank')
  })
  it('reads earned cords onto the cape line', () => {
    // 2 CTE credits -> Career Readiness earned
    const s = mkSave([entry({ tags: ['cte'], grade: 3 }), entry({ tags: ['cte'], grade: 3 })])
    expect(sayTexts(coreY4(s))).toContain('Career Readiness')
  })
})

describe('the registry resolves all four years', () => {
  it('coreBeatFor returns the right beat per year, generated for Y4', () => {
    const s = mkSave([])
    expect(coreBeatFor(1, s)?.id).toBe('core:y1')
    expect(coreBeatFor(2, s)?.id).toBe('core:y2')
    expect(coreBeatFor(3, s)?.id).toBe('core:y3')
    expect(coreBeatFor(4, s)?.id).toBe('core:y4')
    expect(coreBeatFor(5, s)).toBeNull()
    for (let y = 1; y <= 4; y++) expect(hasCoreBeat(y)).toBe(true)
    expect(beatDone([{ id: coreBeatId(2) }], 2)).toBe(true)
  })
  it('every takeaway across Y2-Y4 resolves to a Handbook fact', () => {
    for (const b of [CORE_Y2, CORE_Y3, coreY4(mkSave([]))]) {
      for (const id of b.takeaways) expect(FACTS.some((f) => f.id === id), `${b.id}:${id}`).toBe(true)
    }
  })
  it('no em-dashes in any year’s player copy (law §2.8)', () => {
    for (const b of [CORE_Y2, CORE_Y3, coreY4(mkSave([entry({ grade: 3.8 })]))]) {
      for (const s of b.steps) if (s.kind === 'say') expect(s.line.text).not.toMatch(/—/)
    }
  })
})
