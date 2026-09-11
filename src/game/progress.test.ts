/* tests for the GPA math and the honor cord table, which mirrors the school's own awards list */
import { describe, it, expect } from 'vitest'
import { gpaOf, letterOf, rankName, cordsOf, newlyCloseCords, NO_ATHLETIC_CORD } from './progress'
import type { LedgerEntry, SaveGame } from './save'

let n = 0
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: `e${n++}`, title: 't', kind: 'island', credit: 1, grade: 4, year: 1, season: 'Fall', ...over,
})

const mkSave = (ledger: LedgerEntry[], over: Partial<SaveGame> = {}): SaveGame => ({
  v: 2, id: 'r1', handle: 'T', pronouns: '', boatName: '', year: 1, season: 'Fall',
  beat: 'x', introDone: true, plans: {}, flags: [], tokens: [], ledger, ranks: {}, islands: {},
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

  it('AP Honors: five passed AP courses, and a D passes because the district says so', () => {
    const passes = Array.from({ length: 5 }, () => entry({ tags: ['ap'], grade: 2 }))
    expect(cord(mkSave(passes), 'ap-honors').earned).toBe(true)
    // SBLSD policy 2410: A through D earn the credit, F alone earns nothing, and there is
    // no second higher bar for an AP course. The old C threshold was invented.
    const withD = Array.from({ length: 5 }, () => entry({ tags: ['ap'], grade: 1 }))
    expect(cord(mkSave(withD), 'ap-honors').earned).toBe(true)
    const oneF = [...passes.slice(0, 4), entry({ tags: ['ap'], grade: 0 })]
    expect(cord(mkSave(oneF), 'ap-honors').earned).toBe(false)
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

  it('Seal of Biliteracy: four credits of ONE world language (RCW 28A.300.575)', () => {
    const spanish = (n: number) => entry({ id: `class:spanish-${n}`, tags: ['lang'], grade: 3 })
    expect(cord(mkSave([spanish(1), spanish(2), spanish(3)]), 'seal-biliteracy').earned).toBe(false)
    expect(cord(mkSave([spanish(1), spanish(2), spanish(3), spanish(4)]), 'seal-biliteracy').earned).toBe(true)
  })

  it('Seal of Biliteracy: two languages of two years each is proficiency in NEITHER', () => {
    const mixed = mkSave([
      entry({ id: 'class:spanish-1', tags: ['lang'], grade: 3 }),
      entry({ id: 'class:spanish-2', tags: ['lang'], grade: 3 }),
      entry({ id: 'class:french-1', tags: ['lang'], grade: 3 }),
      entry({ id: 'class:french-2', tags: ['lang'], grade: 3 }),
    ])
    expect(cord(mixed, 'seal-biliteracy').earned).toBe(false)
    expect(cord(mixed, 'seal-biliteracy').detail).toContain('2 of 4')
  })

  it('Key Club: two invested years incl. senior year with a 3.0', () => {
    const s = mkSave([entry({ grade: 3.5 })], { year: 4, ranks: { keyclub: 2 } })
    expect(cord(s, 'key-club').earned).toBe(true)
    const lowGpa = mkSave([entry({ grade: 2.5 })], { year: 4, ranks: { keyclub: 2 } })
    expect(cord(lowGpa, 'key-club').earned).toBe(false)
  })

  it('names Valedictorian and Salutatorian, and invents no criteria for either', () => {
    const all = cordsOf(mkSave([entry({ grade: 4 })], { year: 4 }))
    const gaps = all.filter((c) => /valedictorian|salutatorian/i.test(c.name))
    expect(gaps).toHaveLength(2)
    for (const g of gaps) {
      expect(g.published).toBe(false)
      expect(g.rule).toBe('Bonney Lake High School has not published criteria for this award.')
      expect(g.earned).toBe(false)          // a single run has no class rank to compare against
      // the game's own stand-in is stated as the game's, beside the rule, never as the school's
      /* the sentence has to mark itself as the GAME's guess rather than the
       * school's rule, whatever words carry that. It used to say "the game's own
       * model" and started with "In this game", which the Handbook prefixes on
       * its own, so a student read it twice (Ash, 2026-09-09). */
      expect(g.model).toContain("this game's guess")
      expect(g.model, 'the Handbook already prefixes this').not.toMatch(/^In this game/)
    }
  })

  it('every other cord is published, sourced, and quotes the school verbatim', () => {
    const RULES: Record<string, string> = {
      'highest-honors': 'GPA 3.76-4.0',
      'high-honors': 'GPA 3.5-3.759',
      'career-readiness': 'Must have completed at least two CTE credits',
      'ap-honors': 'Pass 5 or more AP courses',
      'ap-capstone': 'AP Seminar & Research plus 4 additional AP classes',
      'seal-biliteracy': 'Awarded to students who show proficiency in English and at least one other language before high school graduation',
    }
    for (const [id, rule] of Object.entries(RULES)) {
      const c = cord(mkSave([]), id)
      expect(c.published, id).toBe(true)
      expect(c.rule, id).toBe(rule)         // verbatim from docs/blhs/awards.md
      /* the SCHOOL's document, which a student can go and find, and never the
       * repo file it was typed into. See the guard at the end of this file. */
      expect(c.source, id).toContain('BLHS awards list')
    }
    // Key Club's criteria are long, so the tripwire is that the game does not shorten them
    const key = cord(mkSave([]), 'key-club')
    expect(key.rule).toContain('40+ volunteer hours each year over 4 years')
    expect(key.rule).toContain('attend 15 meetings each year and 5+ service events')
    expect(key.model).toContain('does not count hours, meetings or events')
  })

  it('says plainly that no athletic cord exists rather than inventing one', () => {
    expect(NO_ATHLETIC_CORD).toContain('awards no cord for reaching Captain')
    expect(NO_ATHLETIC_CORD).toContain('BLHS awards list')
    expect(cordsOf(mkSave([])).some((c) => /captain|varsity|athletic/i.test(c.name))).toBe(false)
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

/* a source a student reads must name a school document, never a file in this repo */

describe('what a student is shown as a source', () => {
  it('never prints a path into this repository, on any cord', () => {
    for (const c of cordsOf(mkSave([]))) {
      expect(c.source, c.id).not.toMatch(/docs\/|\.md\b|\.ts\b|src\//)
      expect(c.source.length, c.id).toBeGreaterThan(8)
    }
    expect(NO_ATHLETIC_CORD).not.toMatch(/docs\/|\.md\b/)
  })
})
