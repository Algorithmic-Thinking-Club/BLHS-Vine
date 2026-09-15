/* checks the reader for the routes MAPVIS publishes inside a map bundle */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readPaths, legsOf, lengthOf, pathNames, walkFaults, isPathName, type Pathway } from './paths'

/* copied out of the published hub, and with no `kind` it is also the silent-default case */
const THE_DOCK_WALK = {
  name: 'the_dock_walk',
  points: [[103, 471], [256, 430], [398, 389]],
  closed: false,
  twoWay: true,
}

/** the one path in a document, for the cases that only care about one */
const one = (p: unknown, id = 'hub'): Pathway | undefined => readPaths({ paths: [p] }, id)[0]

let warns: string[] = []
beforeEach(() => {
  warns = []
  vi.spyOn(console, 'warn').mockImplementation((...a) => { warns.push(a.map(String).join(' ')) })
})
afterEach(() => { vi.restoreAllMocks() })

describe('reading a route MAPVIS actually published', () => {
  it('reads the hub own dock walk off the bundle, points and all', () => {
    const p = one(THE_DOCK_WALK)!
    expect(p.name).toBe('the_dock_walk')
    expect(p.points).toEqual([{ x: 103, y: 471 }, { x: 256, y: 430 }, { x: 398, y: 389 }])
    expect(p.twoWay).toBe(true)
    expect(p.closed).toBe(false)
    expect(p.marks).toEqual([])
  })

  /* a route with no kind is a walk, quietly, which is MAPVIS's own default */
  it('reads a route with no kind at all as a walk, and says nothing about it', () => {
    expect(one(THE_DOCK_WALK)!.kind).toBe('walk')
    expect(warns).toEqual([])
  })

  it('takes a point written as an object as readily as one written as a pair', () => {
    /* MAPVIS writes pairs, while a hand edit and anything that round-trips through a typed structure writes {x,y}, and both are the same line */
    const p = one({ name: 'both_shapes', points: [{ x: 10, y: 20 }, [30, 40]] })!
    expect(p.points).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }])
  })

  it('rounds a fractional point, because a mask is indexed by whole pixels', () => {
    expect(one({ name: 'fractions', points: [[10.4, 20.6], [30, 40]] })!.points[0]).toEqual({ x: 10, y: 21 })
  })

  /* one point is not a line, and the count is in the refusal because "path refused" tells an author nothing about which half of it they got wrong */
  it('refuses a single waypoint and says how many it found', () => {
    expect(one({ name: 'a_dot', points: [[5, 5]] })).toBeUndefined()
    expect(warns.join()).toContain('has 1 usable point and needs two')
  })

  it('refuses the WHOLE route for one unreadable waypoint, at the index that broke it', () => {
    /* one bad waypoint refuses the whole route rather than renumber every mark after it */
    expect(one({ name: 'half_a_point', points: [[0, 0], { x: 5 }] })).toBeUndefined()
    expect(warns.join()).toContain('unreadable waypoint at index 1')
    warns.length = 0
    expect(one({ name: 'middle_gone', points: [[0, 0], [null, 9], [40, 40]] })).toBeUndefined()
    expect(warns.join()).toContain('unreadable waypoint at index 1')
  })

  it('does not read null, an empty string or false as the number zero', () => {
    /* `Number(null)` is 0 and `isFinite(0)` is true, so `[null, 471]` used to parse as a real waypoint on the left edge of the painting rather than the broken point it is, and the leg to it crossed the whole map */
    for (const bad of [null, '', false, []]) {
      warns.length = 0
      expect(one({ name: 'zeroish', points: [[10, 10], [bad, 471]] }), JSON.stringify(bad)).toBeUndefined()
      expect(warns.join(), JSON.stringify(bad)).toContain('unreadable waypoint at index 1')
    }
  })

  it('refuses a name the API could not expose, and prints the name it refused', () => {
    expect(one({ name: 'The Dock Walk', points: [[0, 0], [1, 1]] })).toBeUndefined()
    expect(warns.join()).toContain('The Dock Walk')
  })

  it('rejects the same names MAPVIS rejects where they are typed', () => {
    expect(isPathName('the_dock_walk')).toBe(true)
    expect(isPathName('The_Dock_Walk')).toBe(false)
    expect(isPathName('3rd_leg')).toBe(false)
    expect(isPathName('has space')).toBe(false)
    expect(isPathName('')).toBe(false)
    expect(isPathName('a'.repeat(48))).toBe(true)
    expect(isPathName('a'.repeat(49))).toBe(false)
  })

  it('keeps the first of a duplicated name, because a name must resolve to one line', () => {
    const ps = readPaths({ paths: [
      { name: 'to_the_quay', points: [[0, 0], [10, 10]] },
      { name: 'to_the_quay', points: [[90, 90], [99, 99]] },
    ] })
    expect(ps).toHaveLength(1)
    expect(ps[0].points[0]).toEqual({ x: 0, y: 0 })
    expect(warns.join()).toContain('duplicate path name "to_the_quay"')
  })

  /* a route that was dropped does not spend its own name: a malformed first attempt above a good one is what a hand edit looks like, and losing the good one to it would be two refusals for one mistake */
  it('lets a later good route take a name an unreadable one asked for', () => {
    const ps = readPaths({ paths: [
      { name: 'to_the_quay', points: [[0, 0]] },
      { name: 'to_the_quay', points: [[90, 90], [99, 99]] },
    ] })
    expect(ps).toHaveLength(1)
    expect(ps[0].points[0]).toEqual({ x: 90, y: 90 })
  })

  it('reads a kind it does not know as a walk, and says which word it did not know', () => {
    const p = one({ name: 'swimming', kind: 'swim', points: [[0, 0], [1, 1]] })!
    expect(p.kind).toBe('walk')
    expect(warns.join()).toContain('says kind "swim"')
    expect(warns.join()).toContain('reading it as a walk')
  })

  it('takes sail and camera at their word', () => {
    expect(one({ name: 'out_to_sea', kind: 'sail', points: [[0, 0], [1, 1]] })!.kind).toBe('sail')
    expect(one({ name: 'the_pan', kind: 'camera', points: [[0, 0], [1, 1]] })!.kind).toBe('camera')
    expect(warns).toEqual([])
  })

  /* one way is the honest default because a sail line into a berth is not a line out of one, and anything short of a literal true reads as false so a bundle writing "yes" or 1 does not quietly get a patrol */
  it('closes and reverses only when the bundle says so in so many words', () => {
    const p = one({ name: 'loose_words', points: [[0, 0], [1, 1]], closed: 'yes', twoWay: 1 })!
    expect(p.closed).toBe(false)
    expect(p.twoWay).toBe(false)
  })

  it('carries a facing and a meta bag through, and omits them when they are empty', () => {
    const withThem = one({ name: 'faced', points: [[0, 0], [1, 1]], facing: 'north', meta: { role: 'entrance' } })!
    expect(withThem.facing).toBe('north')
    expect(withThem.meta).toEqual({ role: 'entrance' })
    const without = one({ name: 'bare', points: [[0, 0], [1, 1]], facing: '' })!
    expect('facing' in without).toBe(false)
    expect('meta' in without).toBe(false)
  })

  it('lists what a map really carries, sorted, for a refusal that can name them', () => {
    const ps = readPaths({ paths: [
      { name: 'the_dock_walk', points: [[0, 0], [1, 1]] },
      { name: 'a_patrol', points: [[0, 0], [1, 1]] },
    ] })
    expect(pathNames(ps)).toEqual(['a_patrol', 'the_dock_walk'])
  })

  it('a bundle with no paths field at all loads as a map with no routes, not an error', () => {
    expect(readPaths({})).toEqual([])
    expect(readPaths({ paths: 'soon' })).toEqual([])
  })
})

describe('the marks along a route', () => {
  const marked = (marks: unknown[]) =>
    one({ name: 'the_dock_walk', points: THE_DOCK_WALK.points, marks })!

  it('keeps a mark that names a waypoint that is there', () => {
    const p = marked([{ at: 1, name: 'midway', label: 'the halfway bollard' }])
    expect(p.marks).toEqual([{ at: 1, name: 'midway', label: 'the halfway bollard' }])
  })

  /* a mark past the end cannot fire and is silent about it, so it is named at load with the index it asked for and the number of waypoints there are */
  it('drops a mark pointing past the end of the line and names it', () => {
    const p = marked([{ at: 3, name: 'off_the_end' }])
    expect(p.marks).toEqual([])
    expect(warns.join()).toContain('mark "off_the_end"')
    expect(warns.join()).toContain('waypoint 3 of 3')
  })

  it('drops a mark at a negative index the same way', () => {
    expect(marked([{ at: -1, name: 'before_the_start' }]).marks).toEqual([])
    expect(warns.join()).toContain('before_the_start')
  })

  it('keeps the good marks on a line that also carries a bad one', () => {
    const p = marked([{ at: 0, name: 'cast_off' }, { at: 9, name: 'nowhere' }, { at: 2, name: 'arrive' }])
    expect(p.marks.map((m) => m.name)).toEqual(['cast_off', 'arrive'])
  })

  it('says nothing about a mark with no name, because there is nothing to say it about', () => {
    expect(marked([{ at: 1 }]).marks).toEqual([])
    expect(warns).toEqual([])
  })

  it('omits a label nobody typed rather than carrying an empty one', () => {
    expect(marked([{ at: 1, name: 'midway', label: '' }]).marks[0]).toEqual({ at: 1, name: 'midway' })
  })
})

describe('the shape of the line', () => {
  const open = one({ name: 'a_run', points: [[0, 0], [10, 0], [10, 10]] })!
  const loop = one({ name: 'a_patrol', points: [[0, 0], [10, 0], [10, 10]], closed: true })!
  const shuttle = one({ name: 'a_shuttle', points: [[0, 0], [10, 0]], closed: true })!

  it('hands back the waypoints in travel order', () => {
    expect(legsOf(open)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
  })

  it('reverses a route run backwards', () => {
    expect(legsOf(open, true)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }])
  })

  it('closes a patrol back onto its own first point', () => {
    const pts = legsOf(loop)
    expect(pts).toHaveLength(4)
    expect(pts[3]).toEqual(pts[0])
    /* a copy, not the same object, because handing the caller the live first point lets anything that nudges the last one move the start of the patrol */
    expect(pts[3]).not.toBe(pts[0])
  })

  it('closes a patrol run backwards onto the point travel started from', () => {
    const pts = legsOf(loop, true)
    expect(pts[0]).toEqual({ x: 10, y: 10 })
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 10 })
  })

  /* a closed two point line is there and back, not a loop: re-appending its first point would make a body walk the same leg twice for one cycle */
  it('does not close a two point line onto itself', () => {
    expect(legsOf(shuttle)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })

  it('reading the legs twice does not grow the line', () => {
    expect(legsOf(loop)).toHaveLength(4)
    expect(legsOf(loop)).toHaveLength(4)
    expect(loop.points).toHaveLength(3)
  })

  /* length is what sizes a timeout, so it is measured off the route rather than off a constant that is right on one map */
  it('measures the hub own dock walk, and measures it the same in both directions', () => {
    const p = one(THE_DOCK_WALK)!
    expect(lengthOf(p)).toBeCloseTo(Math.hypot(153, 41) + Math.hypot(142, 41), 6)
    expect(lengthOf(p)).toBeCloseTo(306.2, 1)
    expect(lengthOf(p, true)).toBeCloseTo(lengthOf(p), 6)
  })

  it('counts the closing leg of a patrol', () => {
    expect(lengthOf(loop) - lengthOf(open)).toBeCloseTo(Math.hypot(10, 10), 6)
  })
})

describe('the ground under a walk route', () => {
  /** the quay is everything except a channel of water crossing it */
  const notInTheChannel = (x: number) => !(x > 280 && x < 340)

  it('reads nothing for a sail line or a camera move, and does not even ask the floor', () => {
    const probe = vi.fn(() => false)
    for (const kind of ['sail', 'camera']) {
      const p = one({ name: 'over_water', kind, points: [[0, 0], [100, 0]] })!
      expect(walkFaults(p, probe)).toEqual([])
    }
    /* a hull is not held to the floor, and asking at all is how a sail route ends up refused by a probe that was never about it */
    expect(probe).not.toHaveBeenCalled()
  })

  /* the case the whole function exists for: a route is drawn by clicking two bits of walkable ground and the wall between them is at neither click, so a corners check passes the route and the body walks into rock */
  it('catches a wall in the middle of a leg whose two ends are both standable', () => {
    const p = one({ name: 'across_the_channel', points: [[256, 430], [398, 389]] })!
    expect(notInTheChannel(256)).toBe(true)
    expect(notInTheChannel(398)).toBe(true)
    const bad = walkFaults(p, (x) => notInTheChannel(x))
    expect(bad).toHaveLength(1)
    expect(bad[0].at.x).toBeGreaterThan(280)
    expect(bad[0].at.x).toBeLessThan(340)
  })

  it('catches the same wall on the hub own dock walk, and says which leg', () => {
    const p = one(THE_DOCK_WALK)!
    const bad = walkFaults(p, (x) => notInTheChannel(x))
    /* legs are numbered by the waypoint they arrive at, so the first leg is 1 and the channel sits in the second */
    expect(bad.map((b) => b.leg)).toEqual([2])
  })

  /* the sampling step is the whole guarantee, so with a step longer than the leg the function degrades to the corners-only check that sampling was written to replace */
  it('misses that wall when the step is longer than the leg itself', () => {
    const p = one({ name: 'across_the_channel', points: [[256, 430], [398, 389]] })!
    expect(walkFaults(p, (x) => notInTheChannel(x), 1000)).toEqual([])
  })

  it('reports one fault per bad leg rather than one per sample', () => {
    /* two long legs, both entirely over water, which is thirty-odd samples each */
    const p = one({ name: 'all_wet', points: [[0, 0], [100, 0], [200, 0]] })!
    const bad = walkFaults(p, () => false)
    expect(bad).toHaveLength(2)
    expect(bad.map((b) => b.leg)).toEqual([1, 2])
  })

  it('checks the closing leg of a patrol too', () => {
    /* the way home from the last waypoint is a leg a body actually walks, and nothing else in the route describes it */
    const loop = one({ name: 'a_patrol', points: [[0, 0], [100, 0], [100, 100]], closed: true })!
    const bad = walkFaults(loop, (x, y) => !(x < 60 && y > 40))
    expect(bad.map((b) => b.leg)).toEqual([3])
  })

  it('says nothing about a route that is walkable end to end', () => {
    const p = one(THE_DOCK_WALK)!
    expect(walkFaults(p, () => true)).toEqual([])
  })
})
