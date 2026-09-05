/* WHAT IS ON THE WALL IS WHAT THE RUN DID, AND NOTHING ELSE.
 *
 * BRIEF-YEAR-ONE hangs four of its eight beats on this: the empty outline in
 * beat 4 that makes a freshman want the year, the thing that goes up in beats 5,
 * 6 and 7, and beat 8's "the wall has three things on it". A wall that can show
 * a trophy nobody earned, or miss one somebody did, breaks the payoff of the
 * whole thirty minutes and it breaks it silently.
 *
 * So this is the guard on the derivation rather than on the drawing.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { beginAdventure, loadSave, type SaveGame } from '../save'
import { wallOf, onTheWall } from './wall'

const withPlan = (over: Partial<SaveGame> = {}): SaveGame => ({
  ...loadSave()!,
  year: 1,
  plans: { 1: { slots: { Fall: 'football', Winter: 'atc' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
  ...over,
})

beforeEach(() => { beginAdventure() })

describe('the seats', () => {
  it('is one seat per thing chosen, plus Advisory, which everybody is in', () => {
    const seats = wallOf(withPlan())
    expect(seats.map((w) => w.name)).toEqual([
      'Advisory', 'Football', 'Algorithmic Thinking Club', 'AP Human Geography', 'Spanish I',
    ])
    /* Advisory first because it is beat 5, then the seasons, then the classes:
     * the order a student meets them is the order the thirty minutes happens in */
    expect(seats.map((w) => w.kind)).toEqual(['advisory', 'activity', 'activity', 'class', 'class'])
  })

  it('starts as five outlines, each saying what would fill it', () => {
    const seats = wallOf(withPlan())
    expect(seats.every((w) => !w.earned)).toBe(true)
    expect(seats.every((w) => w.says === null)).toBe(true)
    /* an empty frame that does not say what goes in it is decoration. The
     * self-evident law's whole point is that the next thing to do is visible. */
    expect(seats.every((w) => w.wants.trim().length > 0)).toBe(true)
    expect(onTheWall(withPlan())).toBe(0)
  })

  it('a wall with no plan on it is Advisory alone, not an error', () => {
    /* the state beat 4 opens in: the principal has spoken, nothing is picked. */
    const seats = wallOf({ ...loadSave()!, year: 1, plans: {} })
    expect(seats.map((w) => w.name)).toEqual(['Advisory'])
  })
})

describe('what fills a seat', () => {
  it('finishing Advisory fills its frame and says the grade', () => {
    const s = withPlan({
      ledger: [{ id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' }],
    })
    const advisory = wallOf(s)[0]
    expect(advisory.earned).toBe(true)
    expect(advisory.says).toContain('A-')
    expect(onTheWall(s)).toBe(1)
  })

  it('finishing a sport fills its frame with the grade AND the rank', () => {
    const s = withPlan({ completions: [{ programme: 'football', year: 1, grade: 3.2, rank: 'JV', at: 1 }] })
    const football = wallOf(s).find((w) => w.name === 'Football')!
    expect(football.earned).toBe(true)
    expect(football.says).toBe('B+, JV')
  })

  it('a completion from another year does not fill this year\'s frame', () => {
    /* the trap this catches: `completions` is keyed by programme AND year, and a
     * wall that forgot the year would show year two's football on year one's
     * wall the moment a student played the same sport twice. */
    const s = withPlan({ completions: [{ programme: 'football', year: 2, grade: 4, rank: 'Varsity', at: 1 }] })
    expect(wallOf(s).find((w) => w.name === 'Football')!.earned).toBe(false)
  })

  it('reads the letter from progress.ts rather than rounding on its own', () => {
    /* 3.5 is the A-/B+ boundary and the one place two tables would disagree. The
     * yearbook and the wall have to say the same thing about one grade. */
    const s = withPlan({
      ledger: [{ id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.5, year: 1, season: 'Fall' }],
    })
    expect(wallOf(s)[0].says).toContain('A-')
  })
})
