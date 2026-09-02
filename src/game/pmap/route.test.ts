import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP, HOME_TARGET, PMAP_SCENE, SEA_ARRIVAL, searchFor, targetFromUrl,
} from './route'
import { HUB_MAP, MAW_MAP } from '../run/objective'

/* THE ADDRESS OF THE PAINTED WORLD, which is now the road itself.
 *
 * Two scenes write this and one reads it, and the three of them agreeing is the
 * whole of "Set Sail lands on the ocean" and "Continue lands in the Maw". Before
 * these there was no test anywhere that a target survives being spelled as a
 * query and read back, and the parameters were spelled by hand in three places.
 */

const q = (s: string) => new URLSearchParams(s)

describe('the pmap address', () => {
  it('reads a bare url as the default map with nothing else asked for', () => {
    expect(targetFromUrl('')).toEqual({ map: DEFAULT_MAP, at: undefined, aboard: false })
  })

  it('reads a map, an arrival anchor and an at-sea arrival', () => {
    expect(targetFromUrl('?scene=pmap&map=hub&at=quay&aboard=1'))
      .toEqual({ map: 'hub', at: 'quay', aboard: true })
  })

  it('round-trips every target through the query', () => {
    for (const t of [
      { map: 'hub' },
      { map: 'hub', aboard: true },
      { map: MAW_MAP, at: 'arrive_maw' },
      { map: 'x', at: 'y', aboard: true },
    ]) {
      const back = targetFromUrl(`?${searchFor(t, '')}`)
      expect(back.map).toBe(t.map)
      expect(back.at).toBe(t.at)
      expect(back.aboard).toBe(!!t.aboard)
    }
  })

  /* THE TWO DELETIONS ARE THE POINT. A target with no anchor has to REMOVE the
   * one already on the address, or walking out of the Maw keeps saying you came
   * in at the bridge and the resume guard never runs again; and stepping ashore
   * has to remove `aboard`, or a refresh puts the student back out at sea with
   * the walk they just did undone. */
  it('deletes an anchor the new target does not carry', () => {
    expect(q(searchFor({ map: 'hub' }, '?scene=pmap&map=hub&at=quay')).has('at')).toBe(false)
  })

  it('deletes aboard when the new target is not at sea', () => {
    expect(q(searchFor({ map: 'hub' }, '?scene=pmap&map=hub&aboard=1')).has('aboard')).toBe(false)
  })

  it('keeps every other parameter, so dbg, src, kit and a member gh ref survive a door', () => {
    const s = q(searchFor({ map: 'b' }, '?scene=pmap&map=a&dbg=1&src=local&kit=1&gh=o/r@main:i/x'))
    expect(s.get('map')).toBe('b')
    expect(s.get('dbg')).toBe('1')
    expect(s.get('src')).toBe('local')
    expect(s.get('kit')).toBe('1')
    expect(s.get('gh')).toBe('o/r@main:i/x')
  })

  it('always names the pmap scene, so a refresh does not land on boot', () => {
    expect(q(searchFor({ map: 'hub' }, '')).get('scene')).toBe(PMAP_SCENE)
  })
})

describe('the road', () => {
  /* Ash's two rulings, asserted rather than described. If either of these ever
   * fails, the game is sending students somewhere he did not ask for. */
  it('sends Set Sail to the hub, on the water', () => {
    expect(SEA_ARRIVAL.map).toBe(HUB_MAP)
    expect(SEA_ARRIVAL.aboard).toBe(true)
    expect(SEA_ARRIVAL.at).toBeUndefined()
  })

  it('sends Continue to the Maw, at the bridge', () => {
    expect(HOME_TARGET.map).toBe(MAW_MAP)
    expect(HOME_TARGET.at).toBe('arrive_maw')
    expect(HOME_TARGET.aboard).toBeFalsy()
  })

  /* THE STAND-IN BUNDLE HAS TO CARRY THE ANCHOR CONTINUE AIMS AT, because the Maw
   * is not published and the fallback folder is what a student really opens. A
   * name that is not in it would drop them on the map's own spawn silently. */
  it('names an anchor the committed panther-maw bundle actually has', async () => {
    const maw = await import('../../../public/maps-painted/panther-maw/map.json')
    const names = (maw.default.anchors as { name: string }[]).map((a) => a.name)
    expect(names).toContain(HOME_TARGET.at)
  })
})
