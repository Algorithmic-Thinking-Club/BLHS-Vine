/* THE PLANK RULE.
 *
 * BRIEF-INTRO-FILM section 3 rewrote half of it and left the other half alone,
 * so this file now proves two different rules on one sheet:
 *
 *   THE ELECTIVES ARE OWED ALWAYS. *"Electives are PICKABLE and REQUIRED: two...
 *   The plank stays quiet until both periods are filled."* Nothing about the
 *   roster can change that, which is what the first block asserts by driving the
 *   rule with `realClasses: 0`.
 *
 *   THE AFTER-SCHOOL SLOT IS OWED ONLY WHERE SOMETHING REAL EXISTS, which is
 *   BRIEF-MAW-RAIL-3 F's rule, kept: *"the moment a real island is linked to a
 *   slot, that slot is required and the plank stays quiet until it is filled,
 *   with the counter saying what is missing."* That half is a promise about a
 *   day nobody has lived through yet, so the last block drives it off the same
 *   `member-islands.json` a member's pull request writes into.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleOwed } from './schedule'

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('../roster/member-islands')
})

describe('the two electives are owed whatever the roster says', () => {
  it('is QUIET with nothing picked at all, which reverses rail-3', () => {
    const o = scheduleOwed({ electivesLeft: 2, chosen: 0, realClasses: 0, realActivities: 0 })
    expect(o.ready).toBe(false)
    expect(o.stage).toBe('schedule')
    expect(o.notYet).toBe('Not yet: fill both Elective periods.')
  })

  it('says which one is missing when one is in', () => {
    const o = scheduleOwed({ electivesLeft: 1, chosen: 0, realClasses: 0, realActivities: 0 })
    expect(o.ready).toBe(false)
    expect(o.notYet).toBe('Not yet: fill the last Elective period.')
  })

  it('goes live on the second elective, with no club picked and none real', () => {
    const o = scheduleOwed({ electivesLeft: 0, chosen: 0, realClasses: 0, realActivities: 0 })
    expect(o.ready).toBe(true)
    expect(o.stage).toBe('go')
    expect(o.notYet).toBeNull()
  })
})

describe('the plank, the moment something real exists', () => {
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
  it('asks for nothing AFTER SCHOOL while the table is empty', async () => {
    const { PROGRAMMES } = await import('../roster/roster')
    const { classIsReal } = await import('../roster/placeholders')
    const { CLASSES } = await import('./catalog')
    const real = PROGRAMMES.filter((p) => p.playable).length
    const realClasses = CLASSES.filter((c) => classIsReal(c.id)).length
    expect(real + realClasses).toBe(0)
    /* the electives are filled here on purpose: this case is about the OTHER
       half of the sheet, and with a blank period the plank is quiet for a reason
       that has nothing to do with the roster */
    const o = scheduleOwed({ electivesLeft: 0, chosen: 0, realClasses, realActivities: real })
    expect(o.owesActivity).toBe(false)
    expect(o.ready).toBe(true)
  })

  it('asks for the after-school slot the moment a club is playable', async () => {
    vi.doMock('../roster/member-islands', () => ({ MEMBER_ISLANDS: [fakeRow] }))
    const { PROGRAMMES } = await import('../roster/roster')
    const real = PROGRAMMES.filter((p) => p.playable).length
    expect(real).toBe(1)
    const o = scheduleOwed({ electivesLeft: 0, chosen: 0, realClasses: 0, realActivities: real })
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
