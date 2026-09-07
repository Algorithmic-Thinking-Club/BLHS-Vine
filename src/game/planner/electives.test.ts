/* THE ELECTIVE LIST A FRESHMAN IS HANDED, AND THAT EVERY ROW ON IT IS REAL.
 *
 * BRIEF-INTRO-FILM section 3: *"two electives PICKABLE and REQUIRED from the
 * real sourced elective list"*, and the standing law under it, CLAUDE.md's:
 * every school fact traces to `docs/blhs/sourced-facts.md`, nothing invented.
 *
 * The screen itself is proved with frames, because a panel is a picture. What
 * this file proves is the part a picture cannot: that the rows the panel draws
 * are the year-one rows of the catalog, that there are enough of them for a
 * student to have a choice, that not one of them is an "Example" placeholder
 * (which is the clubs' rule and never the courses'), and that the two-pick
 * ceiling the plank counts against is the one `refuseClass` enforces.
 */
import { describe, it, expect } from 'vitest'
import { CLASSES } from './catalog'
import { ELECTIVES_OWED, scheduleOwed } from './schedule'
import { refuseClass } from '../run/refusal'
import type { SaveGame } from '../save'

/** exactly what `PickYear` puts in the list for a given year */
const offered = (year: number) => CLASSES.filter((c) => c.years.includes(year) && !c.requires)

const save = (classes: string[]): SaveGame => ({
  v: 2, id: 't', handle: 'T', pronouns: 'they/them', boatName: 'K', year: 1, season: 'Fall',
  beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: { 1: { slots: {}, classes, stamped: false } },
  flags: [], tokens: ['Fall', 'Winter', 'Spring'], ledger: [], ranks: {}, islands: {},
  exposure: [], completions: [], stickers: [], facts: [], badges: [], savedAt: 1,
} as unknown as SaveGame)

describe('the year-one elective list', () => {
  it('offers a real choice rather than a token one', () => {
    /* thirteen today. The floor is what matters: a list of two is not a choice
     * and would make "pick two" a formality. */
    expect(offered(1).length).toBeGreaterThanOrEqual(8)
  })

  it('has no placeholder name anywhere in it', () => {
    /* Example A to E is the CLUBS' rule (`roster/placeholders.ts`). A course is a
     * true thing about Bonney Lake whether or not anybody has drawn an island for
     * it, so a course wearing a placeholder name would be the game hiding a fact
     * it actually has. */
    for (const c of offered(1)) expect(c.name).not.toMatch(/example/i)
  })

  it('offers nothing with a prerequisite, because a freshman has taken nothing', () => {
    for (const c of offered(1)) expect(c.requires).toBeUndefined()
  })

  it('is drawn from departments a student would recognise', () => {
    const depts = new Set(offered(1).map((c) => c.dept))
    /* the AP list, world languages, the CTE pathways and the performing arts, all
     * four sourced in `docs/blhs/sourced-facts.md` */
    expect(depts.size).toBeGreaterThanOrEqual(3)
  })
})

describe('the plank counts the same two the catalog lets him pick', () => {
  it('refuses a third pick at exactly the number the rule owes', () => {
    const two = offered(1).slice(0, ELECTIVES_OWED).map((c) => c.id)
    const third = offered(1)[ELECTIVES_OWED]
    expect(refuseClass(third.id, save(two), 1))
      .toBe('Two focus classes a year. Remove one before you add another.')
  })

  it('takes the first two without a word', () => {
    const list = offered(1)
    expect(refuseClass(list[0].id, save([]), 1)).toBeNull()
    expect(refuseClass(list[1].id, save([list[0].id]), 1)).toBeNull()
  })

  it('is quiet until both are in and live the moment they are', () => {
    const count = (picked: number) => scheduleOwed({
      electivesLeft: ELECTIVES_OWED - picked, chosen: 0, realClasses: 0, realActivities: 0,
    })
    expect(count(0).ready).toBe(false)
    expect(count(1).ready).toBe(false)
    expect(count(2).ready).toBe(true)
  })
})
