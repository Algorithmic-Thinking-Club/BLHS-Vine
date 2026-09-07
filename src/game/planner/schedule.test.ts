/* THE PLANK RULE, BUILT AND TESTED THE DAY IT WAS RULED.
 *
 * BRIEF-MAW-RAIL-3 F: *"'That is my schedule' works with nothing picked ONLY
 * while nothing real exists. The moment a real island is linked to a slot, that
 * slot is required and the plank stays quiet until it is filled, with the
 * counter saying what is missing. Build the rule and the test now."*
 *
 * The half that needs a test is the SECOND sentence, because the first one is
 * what a student sees today and the second one is a promise about a day nobody
 * has lived through yet. So the last two cases here drive the rule off the same
 * table a member's pull request writes into, exactly as `placeholders.test.ts`
 * does, and watch the schedule start asking for a pick on its own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleOwed } from './schedule'

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('../roster/member-islands')
})

describe('the plank, while nothing on the sheet is real', () => {
  it('is live with nothing picked at all', () => {
    const o = scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses: 0, realActivities: 0 })
    expect(o.ready).toBe(true)
    expect(o.stage).toBe('go')
    expect(o.notYet).toBeNull()
  })
})

describe('the plank, the moment something real exists', () => {
  it('waits for both elective periods and says which', () => {
    const both = scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses: 1, realActivities: 0 })
    expect(both.ready).toBe(false)
    expect(both.stage).toBe('schedule')
    expect(both.notYet).toBe('Not yet: fill both Elective periods.')

    const one = scheduleOwed({ electivesLeft: 1, chosen: 0, realClasses: 1, realActivities: 0 })
    expect(one.notYet).toBe('Not yet: fill the last Elective period.')
  })

  it('waits for one club or sport and says so', () => {
    const o = scheduleOwed({ electivesLeft: 0, chosen: 0, realClasses: 0, realActivities: 1 })
    expect(o.ready).toBe(false)
    expect(o.stage).toBe('after')
    expect(o.notYet).toBe('Not yet: press one club or sport below.')
  })

  it('lights the schedule before the after-school box, never both', () => {
    /* one thing is lit (BRIEF-SELF-EVIDENT law 1), and it is the one nearer the
     * top of the page, because a lit box further down points away from what the
     * student is reading */
    const o = scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses: 1, realActivities: 1 })
    expect(o.stage).toBe('schedule')
    expect(o.owesClass && o.owesActivity).toBe(true)
  })

  it('goes live again once the real ones are filled', () => {
    const o = scheduleOwed({ electivesLeft: 0, chosen: 1, realClasses: 3, realActivities: 5 })
    expect(o.ready).toBe(true)
    expect(o.notYet).toBeNull()
  })
})

/* ---- AND THE ROSTER IS WHERE "REAL" COMES FROM ------------------------- */

const fakeRow = {
  programme: 'example-island',
  name: 'The Example Island',
  place: 'home-island',
  kind: 'club' as const,
  season: 'Fall' as const,
  tags: [],
  playable: true,
  blurb: 'A member built this one.',
  source: 'a test',
}

describe('one row in member-islands.json starts the schedule asking', () => {
  it('asks for nothing while the table is empty', async () => {
    const { PROGRAMMES } = await import('../roster/roster')
    const { classIsReal } = await import('../roster/placeholders')
    const { CLASSES } = await import('./catalog')
    const real = PROGRAMMES.filter((p) => p.playable).length
    const realClasses = CLASSES.filter((c) => classIsReal(c.id)).length
    expect(real + realClasses).toBe(0)
    expect(scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses, realActivities: real }).ready).toBe(true)
  })

  it('asks for the after-school slot the moment a club is playable', async () => {
    vi.doMock('../roster/member-islands', () => ({ MEMBER_ISLANDS: [fakeRow] }))
    const { PROGRAMMES } = await import('../roster/roster')
    const real = PROGRAMMES.filter((p) => p.playable).length
    expect(real).toBe(1)
    const o = scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses: 0, realActivities: real })
    expect(o.ready, 'a real club exists and the plank still ends the beat').toBe(false)
    expect(o.notYet).toBe('Not yet: press one club or sport below.')
  })

  it('asks for the elective periods the moment a class is playable', async () => {
    vi.doMock('../roster/member-islands', () => ({
      MEMBER_ISLANDS: [{ ...fakeRow, programme: 'spanish-1', name: 'Spanish I' }],
    }))
    const { classIsReal } = await import('../roster/placeholders')
    const { CLASSES } = await import('./catalog')
    const realClasses = CLASSES.filter((c) => classIsReal(c.id)).length
    expect(realClasses).toBe(1)
    expect(scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses, realActivities: 0 }).ready).toBe(false)
  })
})
