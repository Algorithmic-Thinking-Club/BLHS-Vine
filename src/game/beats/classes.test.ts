/* WHERE A CLASS SITS, AND THE FOUR INVENTED HALLS THAT USED TO ANSWER IT.
 *
 * `classes.ts` carried `HALL: Record<Dept, string>` reading 'the AP Academy',
 * 'the international hall', 'the Trades Harbor' and 'the arts wing'. Four names,
 * none of them a real BLHS place, none of them on the roster, none of them on a
 * map. A class beat's `place` was therefore a sentence nobody could navigate to,
 * and the objective arrow, which resolves an anchor on a map, could never point
 * at a class.
 *
 * This is a tripwire in both directions: the invented names may not come back,
 * and the resolver has to really resolve when a place is finally sourced.
 */
import { describe, it, expect } from 'vitest'
import { classBeat, classPlacement } from './classes'
import { CLASSES, classById, type ClassDef } from '../planner/catalog'
import { PLACES, type Place } from '../roster/roster'

const INVENTED = ['AP Academy', 'international hall', 'Trades Harbor', 'arts wing']

describe('a class names a roster place or says it has none', () => {
  it('never prints one of the four invented halls again', () => {
    for (const c of CLASSES) {
      const line = classBeat(c, 1).place
      for (const bad of INVENTED) expect(line, `${c.id} -> ${line}`).not.toContain(bad)
    }
  })

  it('reads as an honest absence today, because no department is sourced anywhere', () => {
    /* `docs/blhs/sourced-facts.md` carries a room for a club and none for a
     * department: the course catalog says what is taught and never where. So the
     * roster teaches nothing, every class resolves to nothing, and the beat says
     * so instead of guessing. When somebody sources a room this test is the one
     * that fails, and that is the correct failure. */
    expect(PLACES.every((p) => !p.teaches?.length)).toBe(true)
    for (const dept of ['ap', 'lang', 'cte', 'arts'] as const) {
      const c = CLASSES.find((x) => x.dept === dept)!
      const at = classPlacement(c)
      expect(at.place).toBeUndefined()
      expect(at.map).toBeUndefined()
      /* the line is in the player's register: it names the school and claims no
         room, because none is sourced. The absence a test guards is `place` and
         `map` being undefined, above, not the sentence. */
      expect(at.line).toBe('a classroom at Bonney Lake High School')
    }
  })

  it('resolves a place AND its arrival map the moment the roster carries one', () => {
    /* the override is the roster's own `rosterFaults` pattern: nothing shipped
     * teaches a department, so without it this branch could never be exercised
     * and the resolver would be a comment. */
    const sourced: Place[] = [{
      id: 'test-wing', name: 'the sourced wing', maps: ['wing-a'], arrival: 'wing-a',
      paintings: 1, room: 'Rm 100', teaches: ['ap'], source: 'a test, and not a claim about BLHS',
    }]
    const at = classPlacement(classById('ap-human-geo')!, sourced)
    expect(at.place?.id).toBe('test-wing')
    expect(at.map).toBe('wing-a')
    expect(at.line).toBe('the sourced wing, Rm 100')
  })

  it('names the place and no map while the place has no painting', () => {
    const unpainted: Place[] = [{
      id: 'test-flex', name: '200 Flex', maps: [], paintings: 0,
      teaches: ['cte'], source: 'a test, and not a claim about BLHS',
    }]
    const at = classPlacement(classById('culinary-1')!, unpainted)
    expect(at.place?.id).toBe('test-flex')
    expect(at.map).toBeUndefined()          // nothing to point an arrow at yet
    expect(at.line).toBe('200 Flex')
  })

  it('refuses two places claiming one department, which is HALL growing back in data', async () => {
    const { rosterFaults } = await import('../roster/roster')
    const twice: Place[] = [
      { id: 'a', name: 'a', maps: [], paintings: 0, teaches: ['ap'], source: 't' },
      { id: 'b', name: 'b', maps: [], paintings: 0, teaches: ['ap'], source: 't' },
    ]
    expect(rosterFaults(twice, [])).toContainEqual({
      key: 'ap', why: 'department is taught at both "a" and "b"',
    })
  })

  it('leaves the rest of the beat exactly as it was', () => {
    const c: ClassDef = classById('ap-human-geo')!
    const b = classBeat(c, 2)
    expect(b.id).toBe('class:ap-human-geo')
    expect(b.kind).toBe('class')
    expect(b.year).toBe(2)
    expect(b.credit).toBe(0.5)
  })
})
