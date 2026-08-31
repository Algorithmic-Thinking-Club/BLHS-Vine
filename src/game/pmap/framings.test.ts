/* THE MAP OWNS THE SHOT, and the script's typed number is only a fallback.
 *
 * The defect these are written against is a real line that shipped: `maw-founding`
 * carried `zoom: 1.35`, guessed once at a keyboard for one painting, with nothing
 * to notice when that painting was re-cut. A framing is authored where the thing
 * is, so the close-up moves with the desk.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { framingOf, framingNames, shotOf, projectFramings, shotsOf } from './framings'
import { resolveScript, type AuthoredScript } from '../cutscene/scripts'

const DESK = {
  framing: { zoom: 1.5, dy: -14, name: 'default' },
  framings: { close: { zoom: 1.9, dy: -18 }, wide: { zoom: 1.05, dy: 0 } },
}

describe('a framing on an anchor', () => {
  it('reads the default shot off the meta bag that already survives export', () => {
    expect(framingOf(DESK)).toEqual({ zoom: 1.5, dx: 0, dy: -14, name: 'default' })
  })

  it('reads a named one, and keeps the name it was asked for', () => {
    expect(framingOf(DESK, 'close')).toEqual({ zoom: 1.9, dx: 0, dy: -18, name: 'close' })
  })

  /* A NAME THE MAP DOES NOT CARRY FALLS BACK TO ITS OWN DEFAULT rather than to
   * nothing, because a shot that half-happens is worse than the author's own
   * wide one. The caller is told, which is PmapScene's job and not this one's. */
  it('falls back to the anchor own default when the name is not there', () => {
    expect(framingOf(DESK, 'nope')?.name).toBe('default')
  })

  it('answers nothing at all for an anchor nobody framed', () => {
    expect(framingOf(undefined)).toBeNull()
    expect(framingOf({ why: 'a note somebody left' })).toBeNull()
  })

  /* AN EMPTY BAG IS NOT A FRAMING. It would otherwise override a script's zoom
   * with undefined and pull every shot back to the map's load scale, which is
   * worse than the hand-typed number it replaced. */
  it('refuses a framing that says nothing', () => {
    expect(framingOf({ framing: {} })).toBeNull()
    expect(framingOf({ framing: { name: 'empty' } })).toBeNull()
  })

  it('lists what an anchor really carries, for a refusal that can name them', () => {
    expect(framingNames(DESK)).toEqual(['(default)', 'close', 'wide'])
    expect(framingNames(undefined)).toEqual([])
  })

  it('applies the offset, which is the thing look_at could never express', () => {
    expect(shotOf({ x: 196, y: 322 }, framingOf(DESK, 'close'))).toEqual({ x: 196, y: 304, zoom: 1.9 })
    /* no framing at all is the anchor itself, at whatever the caller fell back to */
    expect(shotOf({ x: 10, y: 20 }, null, 1.35)).toEqual({ x: 10, y: 20, zoom: 1.35 })
  })
})

describe('resolving a script against a map that frames itself', () => {
  const spot = (n: string) => (n === 'desk' ? { x: 196, y: 322 } : null)
  const script: AuthoredScript = {
    id: 'test', steps: [{ t: 'cameraAt', anchor: 'desk', framing: 'close', zoom: 1.35, ms: 900 }],
  }

  it('uses the MAP number and not the script number', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { script: r, missing } = resolveScript(script, spot, (_n, name) => framingOf(DESK, name))
    expect(missing).toEqual([])
    expect(r.steps[0]).toEqual({ t: 'camera', to: { x: 196, y: 304 }, zoom: 1.9, ms: 900 })
    /* and it says so, once, rather than silently discarding what somebody typed */
    expect(info).toHaveBeenCalledWith(expect.stringContaining('is framed at 1.9 by the map'))
    info.mockRestore()
  })

  it('falls back to the script number on a map whose author has not framed it', () => {
    const { script: r } = resolveScript(script, spot, () => null)
    expect(r.steps[0]).toEqual({ t: 'camera', to: { x: 196, y: 322 }, zoom: 1.35, ms: 900 })
  })

  /* THE OLD BEHAVIOUR IS STILL THE BEHAVIOUR WITH NO READER PASSED, which is what
   * keeps every caller that has not been taught about framings working. */
  it('is unchanged when nobody hands it a framing reader at all', () => {
    const { script: r } = resolveScript(script, spot)
    expect(r.steps[0]).toEqual({ t: 'camera', to: { x: 196, y: 322 }, zoom: 1.35, ms: 900 })
  })

  it('still refuses a whole script for an anchor the map does not have', () => {
    const bad: AuthoredScript = { id: 'bad', steps: [{ t: 'cameraAt', anchor: 'nowhere', ms: 10 }] }
    expect(resolveScript(bad, spot, () => null).missing).toEqual(['nowhere'])
  })
})

/* ---- THE OTHER SHAPE THE SAME SHOTS ARRIVE IN -------------------------------
 *
 * MAPVIS writes shots into the anchor meta bag now, and the handoff says in so
 * many words not to "fix" that by moving it to a top-level array. But the hub
 * that is live on the platform was published BEFORE that move, so its one shot
 * is a top-level entry hanging off an anchor whose meta holds nothing but
 * `{docId, derived}`. Nobody is going to republish it, so the reader takes both.
 */
const HUB_SHOTS = [{ name: 'the_maw_mouth', anchor: 'panthers_maw', dx: 0, dy: 0, zoom: 1, entry: true }]

/** the hub's door, verbatim off v13, fresh each time because folding writes to it */
const mawDoor = (meta: Record<string, unknown> = { docId: 2, derived: true }) =>
  ({ name: 'panthers_maw', x: 343, y: 378, meta })

let warns: string[] = []
const listen = () => {
  warns = []
  vi.spyOn(console, 'warn').mockImplementation((...a) => { warns.push(a.map(String).join(' ')) })
}
afterEach(() => { vi.restoreAllMocks() })

describe('folding the live hub top-level shots onto its anchors', () => {
  it('lands the one shot the platform is serving today on the door it belongs to', () => {
    const door = mawDoor()
    expect(projectFramings([door], HUB_SHOTS, 'hub')).toBe(1)
    /* zoom 1 is what saves this shot. It is a MULTIPLE OF THE OPENING VIEW and
     * not a scale, so 1 is a real instruction, and it is also the only field
     * with a value: dx and dy are both 0, and a shot carrying neither a zoom nor
     * an offset reads as nothing at all and vanishes here. */
    expect(framingOf(door.meta, 'the_maw_mouth')).toEqual({ zoom: 1, dx: 0, dy: 0, name: 'the_maw_mouth' })
  })

  it('makes an entry shot the unnamed default that look_at reads', () => {
    const door = mawDoor()
    projectFramings([door], HUB_SHOTS, 'hub')
    expect(framingOf(door.meta)?.name).toBe('the_maw_mouth')
    expect(shotOf({ x: 343, y: 378 }, framingOf(door.meta))).toEqual({ x: 343, y: 378, zoom: 1 })
  })

  it('leaves an unnamed default that is already authored alone', () => {
    /* the anchor's own default is the newer shape and the author's later word,
     * so an entry flag on the old list must not pull the map back to it */
    const door = mawDoor({ framing: { zoom: 2.2, dy: -30 } })
    projectFramings([door], HUB_SHOTS, 'hub')
    expect(framingOf(door.meta)?.zoom).toBe(2.2)
  })

  /* THE MIGRATION RULE, AND GETTING IT BACKWARDS REVERTS AN AUTHOR'S EDIT. A
   * bundle carrying both shapes is a bundle mid-migration: the meta bag is what
   * MAPVIS writes now and the array is what it wrote last month. */
  it('lets the meta bag win over the projection, name for name', () => {
    const door = mawDoor({ docId: 2, framings: { the_maw_mouth: { zoom: 1.9, dy: -18 } } })
    expect(projectFramings([door], HUB_SHOTS, 'hub')).toBe(0)
    expect(framingOf(door.meta, 'the_maw_mouth')?.zoom).toBe(1.9)
  })

  it('opens on the shot that won, and not on the copy the projection lost with', () => {
    /* the same map otherwise opens at zoom 1 while answering `the_maw_mouth`
     * with 1.9: one name, two numbers, and nothing says which one you got */
    const door = mawDoor({ docId: 2, framings: { the_maw_mouth: { zoom: 1.9, dy: -18 } } })
    projectFramings([door], HUB_SHOTS, 'hub')
    expect(framingOf(door.meta)?.zoom).toBe(1.9)
  })

  it('drops a shot hung off an anchor this map does not have, and names both', () => {
    listen()
    const door = mawDoor()
    const orphans = [{ name: 'the_stage', anchor: 'the_podium', dx: 0, dy: -40, zoom: 1.4 }]
    expect(projectFramings([door], orphans, 'hub')).toBe(0)
    /* a shot survives the anchor it hangs off being renamed or cut, and it is
     * otherwise discovered as a close-up that quietly never happens */
    expect(warns.join()).toContain('the_stage')
    expect(warns.join()).toContain('the_podium')
    expect(warns.join()).toContain('hub')
  })

  it('never lets a shot that says nothing reach an anchor', () => {
    const door = mawDoor()
    const flat = [{ name: 'says_nothing', anchor: 'panthers_maw', dx: 0, dy: 0 }]
    expect(projectFramings([door], flat, 'hub')).toBe(0)
    /* it does not even open a framings bag on the way past, so an anchor nobody
     * framed still reads as an anchor nobody framed */
    expect(framingNames(door.meta)).toEqual([])
  })

  it('costs a loop and nothing else on a bundle that carries no list', () => {
    const door = mawDoor()
    expect(projectFramings([door], undefined, 'hub')).toBe(0)
    expect(projectFramings([door], [], 'hub')).toBe(0)
    expect(door.meta).toEqual({ docId: 2, derived: true })
  })
})

describe('every named shot on a map, indexed by the name a person typed', () => {
  const anchorsOf = () => [
    { name: 'chart_table', x: 180, y: 300, meta: { framings: { the_chart: { zoom: 1.6, dy: -10 } } } },
    { name: 'hearth', x: 320, y: 300, meta: { framings: { the_fire: { zoom: 2, dy: -4 } } } },
  ]

  it('finds a shot without being told which anchor carries it', () => {
    /* nobody writing a scene thinks "the second framing on the door"; they think
     * "the maw mouth", which is why this index is flat */
    const shots = shotsOf(anchorsOf())
    expect([...shots.keys()].sort()).toEqual(['the_chart', 'the_fire'])
    expect(shots.get('the_fire')?.anchor.name).toBe('hearth')
    expect(shots.get('the_fire')?.framing.zoom).toBe(2)
  })

  it('hands back the caller own anchor record and not the two fields this file needs', () => {
    const anchors = anchorsOf()
    /* the x is what a shot is resolved against, so an index that dropped it
     * would force a cast at every call site to get the anchor back */
    expect(shotsOf(anchors).get('the_chart')?.anchor).toBe(anchors[0])
    expect(shotsOf(anchors).get('the_chart')?.anchor.x).toBe(180)
  })

  it('keeps the first of a collision and says which two anchors argued', () => {
    listen()
    const shots = shotsOf([
      { name: 'chart_table', x: 1, y: 1, meta: { framings: { the_shot: { zoom: 1.6 } } } },
      { name: 'hearth', x: 2, y: 2, meta: { framings: { the_shot: { zoom: 9 } } } },
    ])
    expect(shots.get('the_shot')?.anchor.name).toBe('chart_table')
    expect(warns.join()).toContain('chart_table')
    expect(warns.join()).toContain('hearth')
  })

  it('never indexes a framing that says nothing, and does not let one hold the name', () => {
    const shots = shotsOf([
      { name: 'ghost_post', x: 1, y: 1, meta: { framings: { the_shot: {} } } },
      { name: 'hearth', x: 2, y: 2, meta: { framings: { the_shot: { zoom: 1.4 } } } },
    ])
    /* an empty bag is not a shot, so it is not a claim on the name either: the
     * real one behind it is what the scene asked for */
    expect(shots.get('the_shot')?.anchor.name).toBe('hearth')
    expect(shots.size).toBe(1)
  })

  it('skips an anchor with no bag and one whose bag is not a set', () => {
    const shots = shotsOf([
      { name: 'plain', x: 1, y: 1 },
      { name: 'odd', x: 2, y: 2, meta: { framings: 'soon' } },
      { name: 'hearth', x: 3, y: 3, meta: { framings: { the_fire: { zoom: 2 } } } },
    ])
    expect([...shots.keys()]).toEqual(['the_fire'])
  })

  it('finds the live hub shot after the fold, which is the whole round trip', () => {
    const door = mawDoor()
    projectFramings([door], HUB_SHOTS, 'hub')
    const shot = shotsOf([door]).get('the_maw_mouth')
    expect(shot?.anchor.name).toBe('panthers_maw')
    expect(shotOf({ x: shot!.anchor.x, y: shot!.anchor.y }, shot!.framing)).toEqual({ x: 343, y: 378, zoom: 1 })
  })
})
