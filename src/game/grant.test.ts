/* the tests for grant: what a student earns has to reach the screen and the world */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SaveGame } from './save'
import { GRANT_EVENT, grant } from './grant'
import { bookwormThreshold } from './badges'

const run = (over: Partial<SaveGame> = {}): SaveGame => ({
  v: 2, id: 'r_t', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: 0,
  ...over,
} as unknown as SaveGame)

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

/** every card currently on the feedback layer, in the order it was shown */
const cards = () => [...document.querySelectorAll('#kit-feedback *')]
  .map((el) => el.textContent ?? '')
  .filter(Boolean)

describe('a grant says so', () => {
  it('puts what was earned on the screen', () => {
    const s = run()
    grant(s, s, { what: 'Football is done.', detail: 'It goes on your transcript.' })
    expect(cards().join(' ')).toContain('Football is done.')
  })

  it('tells the world, so a wall can dress itself at the moment it fills', () => {
    /* an island only re-dresses its own placements on arrival and on a press, so
     * a trophy earned while the student is standing in the room would otherwise
     * not appear until they left and came back */
    const heard = vi.fn()
    window.addEventListener(GRANT_EVENT, heard)
    const s = run()
    grant(s, s, { what: 'That counted.' })
    window.removeEventListener(GRANT_EVENT, heard)
    expect(heard).toHaveBeenCalledOnce()
  })

  it('says a badge the run has just crossed the line for, which nothing writes down', () => {
    /* Bookworm is a count of facts against the whole pool, so nothing writes it down */
    const facts = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`)
    const before = run({ facts: facts(bookwormThreshold - 1) })
    const after = run({ facts: facts(bookwormThreshold) })
    grant(before, after, { what: 'That went in the Handbook.' })

    // the thing they did is first and alone; the badge follows it
    expect(cards().join(' ')).toContain('That went in the Handbook.')
    expect(cards().join(' ')).not.toContain('Bookworm')
    vi.advanceTimersByTime(2700)
    expect(cards().join(' ')).toContain('Bookworm')
  })

  it('says nothing extra when nothing extra was crossed', () => {
    const before = run({ facts: ['a'] })
    const after = run({ facts: ['a', 'b'] })
    grant(before, after, { what: 'That went in the Handbook.' })
    expect(cards().join(' ')).toContain('That went in the Handbook.')
    /* past the first card's own hold and past the queue: the corner is empty
     * rather than carrying a second announcement nobody earned */
    vi.advanceTimersByTime(2700)
    expect(cards()).toEqual([])
  })

  it('is a no-op with no run rather than a crash inside a member’s own line', () => {
    expect(() => grant(null, null, { what: 'nothing' })).not.toThrow()
    expect(cards()).toEqual([])
  })

  it('never throws into the caller, because the grant itself already happened', () => {
    /* `award()` writes first and answers second. If counting a badge row ever
     * throws, the student keeps the grade and loses only the card. */
    const broken = { get facts(): string[] { throw new Error('bad row') } } as unknown as SaveGame
    expect(() => grant(broken, run(), { what: 'Track is done.' })).not.toThrow()
  })
})
