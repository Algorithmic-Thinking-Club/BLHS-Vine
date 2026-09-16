import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP, HOME_TARGET, PMAP_SCENE, SEA_ARRIVAL, searchFor, targetFromUrl,
} from './route'
import { HUB_MAP, MAW_MAP } from '../run/objective'

/* the painted world's address in the url, written by two scenes and read by one */

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

  /* a new target deletes the parts of the address it does not carry */
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
  /* where continue and the title send a student, asserted rather than described */
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

  /* the stand-in bundle carries the anchor continue aims at, since it is the folder a student really opens */
  it('names an anchor the committed panther-maw bundle actually has', async () => {
    const maw = await import('../../../public/maps-painted/panther-maw/map.json')
    const names = (maw.default.anchors as { name: string }[]).map((a) => a.name)
    expect(names).toContain(HOME_TARGET.at)
  })
})
