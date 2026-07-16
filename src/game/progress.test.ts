// The progression engine (GAME-DESIGN §8) — GPA math and the cord table, which mirrors
// docs/research/blhs-awards-authoritative.md EXACTLY. These tests ARE that table: if a
// refactor changes who earns a cord, a test names the real award it broke.
import { describe, it, expect } from 'vitest'
import { gpaOf, letterOf, rankName, cordsOf, newlyCloseCords } from './progress'
import type { LedgerEntry, SaveGame } from './save'

let n = 0
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: `e${n++}`, title: 't', kind: 'island', credit: 1, grade: 4, year: 1, season: 'Fall', ...over,
})

const mkSave = (ledger: LedgerEntry[], over: Partial<SaveGame> = {}): SaveGame => ({
  v: 2, id: 'r1', handle: 'T', pronouns: '', boatName: '', year: 1, season: 'Fall',
  beat: 'x', introDone: true, tokens: [], ledger, ranks: {}, islands: {},
  stickers: [], facts: [], badges: [], savedAt: 1, ...over,
})

describe('GPA (§8.1: credit-weighted, real 4.0 scale)', () => {
  it('is null with an empty ledger (never a fake 0.0)', () => {
    expect(gpaOf(mkSave([]))).toBeNull()
  })
  it('weights by credit: islands 1.0 outweigh classes 0.5', () => {
    const s = mkSave([
      entry({ kind: 'island', credit: 1, grade: 4 }),
      entry({ kind: 'class', credit: 0.5, grade: 2 }),
    ])
    expect(gpaOf(s)).toBe(3.33)   // (4*1 + 2*0.5) / 1.5
  })
  it('letter boundaries match the scale', () => {
    expect(letterOf(4)).toBe('A')
    expect(letterOf(3.5)).toBe('A-')
    expect(letterOf(3.15)).toBe('B+')
    expect(letterOf(1.0)).toBe('D')
    expect(letterOf(0.9)).toBe('F')
  })
})

describe('ranks (§8.2: years invested)', () => {
  it('climbs JV -> Varsity -> Captain', () => {
    expect(rankName(0)).toBeNull()
    expect(rankName(1)).toBe('JV')
    expect(rankName(2)).toBe('Varsity')
    expect(rankName(3)).toBe('Captain')
    expect(rankName(5)).toBe('Captain')
  })
})

describe('cords & seals (§8.4 — the authoritative table)', () => {
  const cord = (s: SaveGame, id: string) => cordsOf(s).find((c) => c.id === id)!

  it('Career Readiness: two CTE credits earn it', () => {
    const one = mkSave([entry({ tags: ['cte'], grade: 2 })])
    expect(cord(one, 'career-readiness').earned).toBe(false)
    expect(cord(one, 'career-readiness').progress).toBe(0.5)
    const two = mkSave([entry({ tags: ['cte'], grade: 2 }), entry({ tags: ['cte'], grade: 1 })])
    expect(cord(two, 'career-readiness').earned).toBe(true)
  })

  it('AP Honors: five PASSED AP classes (a C or better; a D does not pass)', () => {
    const passes = Array.from({ length: 5 }, () => entry({ tags: ['ap'], grade: 2 }))
    expect(cord(mkSave(passes), 'ap-honors').earned).toBe(true)
    const oneFail = [...passes.slice(0, 4), entry({ tags: ['ap'], grade: 1.5 })]
    expect(cord(mkSave(oneFail), 'ap-honors').earned).toBe(false)
  })

  it('AP Capstone: Seminar + Research + four more APs (all six carry the ap tag)', () => {
    const led = [
      entry({ id: 'class:ap-seminar', tags: ['ap'], grade: 3 }),
      entry({ id: 'class:ap-research', tags: ['ap'], grade: 3 }),
      ...Array.from({ length: 4 }, () => entry({ tags: ['ap'], grade: 2.5 })),
    ]
    expect(cord(mkSave(led), 'ap-capstone').earned).toBe(true)
    expect(cord(mkSave(led.slice(0, 5)), 'ap-capstone').earned).toBe(false)
  })

  it('Honors GPA cords settle only at graduation (year 4), and the bands are exclusive', () => {
    const perfect = [entry({ grade: 4 })]
    const early = mkSave(perfect, { year: 2 })
    expect(cord(early, 'highest-honors').earned).toBe(false)   // not finished yet
    const done = mkSave(perfect, { year: 4 })
    expect(cord(done, 'highest-honors').earned).toBe(true)
    expect(cord(done, 'high-honors').earned).toBe(false)       // 4.0 is Highest, not High
    const high = mkSave([entry({ grade: 3.6 })], { year: 4 })
    expect(cord(high, 'high-honors').earned).toBe(true)
  })

  it('Seal of Biliteracy: three language years through a passed capstone', () => {
    const lang = Array.from({ length: 3 }, () => entry({ tags: ['lang'], grade: 3 }))
    expect(cord(mkSave(lang), 'seal-biliteracy').earned).toBe(false)
    const withCap = [...lang, entry({ tags: ['lang-capstone'], grade: 3 })]
    expect(cord(mkSave(withCap), 'seal-biliteracy').earned).toBe(true)
  })

  it('Key Club: two invested years incl. senior year with a 3.0', () => {
    const s = mkSave([entry({ grade: 3.5 })], { year: 4, ranks: { keyclub: 2 } })
    expect(cord(s, 'key-club').earned).toBe(true)
    const lowGpa = mkSave([entry({ grade: 2.5 })], { year: 4, ranks: { keyclub: 2 } })
    expect(cord(lowGpa, 'key-club').earned).toBe(false)
  })

  it('never invents Valedictorian (criteria unknown — the [GAP])', () => {
    expect(cordsOf(mkSave([])).some((c) => /valedictorian|salutatorian/i.test(c.name))).toBe(false)
  })
})

describe('honor-reveal moments (§8.4)', () => {
  it('fires exactly when a cord first crosses half-way', () => {
    const before = mkSave([entry({ tags: ['cte'], grade: 2 })])       // 1 of 2 = 0.5... already there
    const wayBefore = mkSave([])
    const after = mkSave([entry({ tags: ['cte'], grade: 2 })])
    const fired = newlyCloseCords(wayBefore, after)
    expect(fired.some((c) => c.id === 'career-readiness')).toBe(true)
    expect(newlyCloseCords(before, after)).toHaveLength(0)            // no re-fire
  })
})
