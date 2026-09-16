// the turn-in verification, with the canonical field order frozen by a locked-output tripwire
import { describe, it, expect } from 'vitest'
import { canonical, runCode, type Transcript } from './verify'
import { transcriptOf } from '../game/progress'
import type { LedgerEntry, SaveGame } from '../game/save'

const t = (over: Partial<Transcript> = {}): Transcript => ({
  participantId: 'p_abc', handle: 'BraveTide', gpa: 3.6, cords: ['high-honors'],
  ranks: { atc: 2 }, islandsCompleted: 3, placesSeen: 2, programmesCompleted: 1,
  factsLearned: 12, years: 4, ...over,
})

describe('runCode', () => {
  it('is deterministic and format-stable (ABCDE-FGHIJ)', () => {
    expect(runCode(t())).toBe(runCode(t()))
    expect(runCode(t())).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
  })
  it('locked output — a change here breaks every printed diploma', () => {
    expect(canonical(t())).toBe('p_abc|3.60|high-honors|atc:2|3|12|4')
    expect(runCode(t())).toBe(runCode(t({ cords: ['high-honors'] })))
  })
  it('the two new export numbers stay OUT of the code, so old diplomas still check', () => {
    const base = runCode(t())
    expect(runCode(t({ placesSeen: 9, programmesCompleted: 9 }))).toBe(base)
  })
  it('any transcript change changes the code', () => {
    const base = runCode(t())
    expect(runCode(t({ gpa: 3.61 }))).not.toBe(base)
    expect(runCode(t({ cords: [] }))).not.toBe(base)
    expect(runCode(t({ participantId: 'p_xyz' }))).not.toBe(base)
    expect(runCode(t({ factsLearned: 13 }))).not.toBe(base)
  })
  it('cord order never matters (sorted canonically)', () => {
    expect(runCode(t({ cords: ['a', 'b'] }))).toBe(runCode(t({ cords: ['b', 'a'] })))
  })
})

describe('client/server parity', () => {
  let n = 0
  const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
    id: `e${n++}`, title: 't', kind: 'class', credit: 0.5, grade: 4, year: 1, season: 'Fall', ...over,
  })
  it('transcriptOf -> runCode is one pipeline both sides share', () => {
    const save: SaveGame = {
      v: 2, id: 'r1', participantId: 'p_1', handle: 'BraveTide', pronouns: '', boatName: '',
      year: 4, season: 'Spring', beat: 'x', introDone: true, graduated: true, plans: {},
      flags: [], tokens: [], ledger: [entry({ tags: ['cte'] }), entry({ tags: ['cte'] })],
      ranks: { atc: 3 }, islands: { atc: 'completed' }, stickers: [], facts: ['f1', 'f2'], badges: [], savedAt: 1,
    }
    const client = runCode(transcriptOf(save))
    // the "server": the same functions over the synced JSON copy of the same save
    const serverCopy = JSON.parse(JSON.stringify(save)) as SaveGame
    const server = runCode(transcriptOf(serverCopy))
    expect(server).toBe(client)
    // and the transcript itself carries the earned cord
    expect(transcriptOf(save).cords).toContain('career-readiness')
    expect(transcriptOf(save).islandsCompleted).toBe(1)
  })
})
