/* THE WORLD'S ARITHMETIC, tested without a browser.
 *
 * Everything the ocean asks the composition and everything the hull asks the
 * water is a pure function, so a failure here names the rule rather than the
 * map. That is the same discipline `path.test.ts` is built on and the reason
 * these two modules were written as data plus functions instead of as scene
 * code with the answers inlined.
 */
import { describe, it, expect } from 'vitest'
import {
  FALLBACK, compositionFaults, distanceTo, discoveredSlots, residentSlots,
  regionAt, seaSlots, slotOfMap, slotOfPlace, residencyBytes, overBudget,
  slotBytes, maxResident, trimToBudget,
  TEXTURE_BUDGET_BYTES, PAINTING_PX_CEILING, SLOT_STATES,
  type WorldComposition, type WorldSlot,
} from './composition'
import {
  newHull, stepHull, berthHelm, headingOf, DEFAULT_SAIL, HELM_IDLE,
  type Berthing, type DepthAt,
} from './sail'
import { PLACES } from '../roster/roster'

/* ---- the composition ------------------------------------------------------ */

describe('the world composition', () => {
  it('places the two real bundles and one rumour, and nothing else', () => {
    expect(FALLBACK.slots.map((s) => s.map ?? '(none)')).toEqual(['hub-a2', 'panther-maw', '(none)'])
  })

  it('has no faults, and its places are all on the roster', () => {
    const known = new Set(PLACES.map((p) => p.id))
    expect(compositionFaults(FALLBACK, known)).toEqual([])
  })

  it('carries all seven states in the vocabulary', () => {
    expect(SLOT_STATES).toHaveLength(7)
    expect(SLOT_STATES).toContain('rumour')
    expect(SLOT_STATES).toContain('rising')
  })

  /* THE ROOM IS NOT A SECOND DOT ON THE CHART. One position per PLACE, not per
   * map, is what stops the hub and the Maw appearing as two islands a student
   * could sail between. */
  it('draws one dot per place, so the hub and the Maw are one island', () => {
    const drawn = seaSlots(FALLBACK)
    expect(drawn.map((s) => s.title)).toEqual(['the Central Island', 'a field somebody keeps mentioning'])
  })

  it('resolves a map to its slot and a place to the one that has the berth', () => {
    expect(slotOfMap(FALLBACK, 'panther-maw')?.title).toBe('the Panther’s Maw')
    expect(slotOfPlace(FALLBACK, 'home-island')?.map).toBe('hub-a2')
    expect(slotOfMap(FALLBACK, 'nothing-here')).toBeUndefined()
  })

  /* DISCOVERY IS MEASURED OFF THE PAINTED EXTENT, NOT OFF THE CANVAS. The hub's
   * canvas is 688x640 and only rows 194 to 570 hold an opaque pixel, so a
   * discovery radius read off `h` is 41 percent too generous on the one map the
   * game actually ships. This is that number, asserted. */
  it('measures discovery off the painted extent and not off the canvas', () => {
    const hub = slotOfMap(FALLBACK, 'hub-a2')!
    expect(hub.footprint.h).toBe(377)
    const canvasErr = (640 - 377) / 640
    expect(canvasErr).toBeGreaterThan(0.4)
    /* a point 300 px below the painting's centre is OFF a 377-tall painting and
     * INSIDE a 640-tall canvas, which is the whole of the defect in one point */
    expect(distanceTo(hub, { x: 0, y: 300 })).toBeGreaterThan(0)
    expect(Math.abs(300) < 640 / 2).toBe(true)
  })

  it('is inside the footprint when the point is inside the painting', () => {
    const hub = slotOfMap(FALLBACK, 'hub-a2')!
    expect(distanceTo(hub, { x: 0, y: 0 })).toBeLessThan(0)
  })

  it('discovers an island when the hull comes inside its radius and not before', () => {
    const hub = slotOfMap(FALLBACK, 'hub-a2')!
    const far = { x: 0, y: 4000 }
    const near = { x: 0, y: 400 }
    expect(discoveredSlots(FALLBACK, far).map((s) => s.map)).not.toContain('hub-a2')
    expect(discoveredSlots(FALLBACK, near).map((s) => s.map)).toContain('hub-a2')
    expect(distanceTo(hub, near)).toBeLessThan(hub.discover!)
  })

  /* HYSTERESIS, so a student sailing along the threshold does not thrash a
   * fetch. §80.2 asks for it by name and this is the band. */
  it('holds a map it already has further out than it would take a new one', () => {
    const far = { x: 0, y: 1600 }
    const cold = residentSlots(FALLBACK, far, new Set())
    const warm = residentSlots(FALLBACK, far, new Set(['hub-a2']))
    expect(cold.map((s) => s.map)).not.toContain('hub-a2')
    expect(warm.map((s) => s.map)).toContain('hub-a2')
  })

  it('never makes a slot with no map resident, because there is nothing to hold', () => {
    const at = { x: 1480, y: -260 }
    expect(residentSlots(FALLBACK, at).every((s) => !!s.map)).toBe(true)
  })

  it('names the water a point is on, and answers nothing over unnamed sea', () => {
    expect(regionAt(FALLBACK, { x: 0, y: 0 })?.name).toBe('home_water')
    expect(regionAt(FALLBACK, { x: 1500, y: 0 })?.name).toBe('the_reach')
    expect(regionAt(FALLBACK, { x: 9000, y: 9000 })).toBeUndefined()
  })

  /* THE CHROMEBOOK NUMBER, ARITHMETIC RATHER THAN A GUESS. A6 asks for a memory
   * budget computed rather than guessed and the harvest marks it `[nothing]`.
   * The per-map cost is measured off the bundles on disk, so island twelve is a
   * number here rather than a worry. */
  it('computes what a resident map costs from the measured bundle', () => {
    const hub = slotOfMap(FALLBACK, 'hub-a2')!
    /* four decoded full-canvas layers over a 688x377 painting, plus 94
     * placements at the proof bundle's measured 21,745 pixels each */
    const painted = 688 * 377
    expect(slotBytes(hub)).toBe((painted * 4 + 94 * 21_745) * 4)
    expect(slotBytes(hub) / 1048576).toBeGreaterThan(11)
    expect(slotBytes(hub) / 1048576).toBeLessThan(13)
    expect(overBudget([hub])).toBe(false)
  })

  it('says how many dressed maps fit at once, which island twelve never had', () => {
    const hub = slotOfMap(FALLBACK, 'hub-a2')!
    const n = maxResident(hub)
    expect(n).toBeGreaterThan(12)
    expect(n).toBeLessThan(40)
    expect(residencyBytes(Array(n).fill(hub))).toBeLessThanOrEqual(TEXTURE_BUDGET_BYTES)
    expect(residencyBytes(Array(n + 1).fill(hub))).toBeGreaterThan(TEXTURE_BUDGET_BYTES)
  })

  /* RESIDENCY IS HONOURED RATHER THAN HOPED FOR. A roster big enough to blow the
   * budget gets trimmed to the nearest maps, which is the difference between a
   * decision with a number on it and a tab running out of memory. */
  it('drops the furthest maps rather than going over the budget', () => {
    const many: WorldSlot[] = Array.from({ length: 60 }, (_, i) => ({
      map: `island-${i}`, title: `island ${i}`, at: { x: i * 40, y: 0 },
      footprint: { w: 688, h: 377 }, state: 'misty', release: 999_999,
    }))
    expect(overBudget(many)).toBe(true)
    const kept = trimToBudget(many, { x: 0, y: 0 })
    expect(overBudget(kept)).toBe(false)
    expect(kept.length).toBeLessThan(many.length)
    /* and what it kept is the near ones, not the first ones in the array */
    expect(kept[0].map).toBe('island-0')
    expect(kept.map((s) => s.map)).not.toContain('island-59')
  })

  it('keeps the map under the hull even when that one map is over budget alone', () => {
    const monster: WorldSlot = {
      map: 'monster', title: 'monster', at: { x: 0, y: 0 },
      footprint: { w: 688, h: 377 }, state: 'misty', release: 10, placements: 99_999,
    }
    expect(overBudget([monster])).toBe(true)
    expect(trimToBudget([monster], { x: 0, y: 0 })).toEqual([monster])
  })

  it('refuses a composition that lies about itself', () => {
    const bad: WorldComposition = {
      version: 1,
      slots: [
        { map: 'a', title: 'a', at: { x: 0, y: 0 }, footprint: { w: 100, h: 100 }, state: 'rumour', release: 100 },
        { map: 'a', title: 'again', at: { x: 9, y: 9 }, footprint: { w: 100, h: 100 }, state: 'misty', release: 100 },
        { title: 'empty', at: { x: 0, y: 0 }, footprint: { w: 100, h: 100 }, state: 'available', release: 100 },
        { map: 'huge', title: 'huge', at: { x: 0, y: 0 }, footprint: { w: 900, h: 900 }, state: 'misty', release: 10, discover: 900 },
      ],
      home: { slot: 'nowhere' },
    }
    const f = compositionFaults(bad)
    const why = f.map((x) => x.why).join(' | ')
    expect(why).toContain('placed twice')
    expect(why).toContain('still reads as a rumour')
    expect(why).toContain('only honest state is "rumour"')
    expect(why).toContain(String(PAINTING_PX_CEILING))
    expect(why).toContain('discovered as a blank')
    expect(f.some((x) => x.key === 'home')).toBe(true)
  })
})

/* ---- the hull ------------------------------------------------------------- */

/** open water everywhere: the depth oracle a test drives a hull across */
const deep: DepthAt = () => 9999
/** a coast running down x = 0: water to the east, land to the west */
const coastAtZero: DepthAt = (x) => x

describe('the hull', () => {
  it('accelerates toward the cruising ceiling and never past it without full sail', () => {
    let h = newHull(0, 0, 0)
    for (let i = 0; i < 400; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, deep)
    expect(h.speed).toBeCloseTo(DEFAULT_SAIL.cruise, 1)
    expect(h.x).toBeGreaterThan(100)
  })

  /* FULL SAIL RAISES THE CEILING AND NOT THE ACCELERATION. Measured rather than
   * asserted: the same number of ticks from rest reaches the same speed under
   * both, right up until the cruising ceiling is the thing in the way. */
  it('raises the ceiling and not the acceleration when full sail is held', () => {
    const ticks = (full: boolean, n: number) => {
      let h = newHull(0, 0, 0)
      for (let i = 0; i < n; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: full }, 1 / 60, deep)
      return h.speed
    }
    /* before the cruise ceiling bites, the two are the same curve */
    expect(ticks(true, 40)).toBeCloseTo(ticks(false, 40), 4)
    /* and after it, only one of them keeps climbing */
    expect(ticks(true, 400)).toBeGreaterThan(ticks(false, 400))
    expect(ticks(true, 400)).toBeCloseTo(DEFAULT_SAIL.fullSail, 1)
  })

  it('sheds speed with the throttle off and stops rather than reversing', () => {
    let h = newHull(0, 0, 0)
    for (let i = 0; i < 200; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, deep)
    for (let i = 0; i < 400; i++) h = stepHull(h, HELM_IDLE, 1 / 60, deep)
    expect(h.speed).toBe(0)
  })

  it('turns slower the faster she goes', () => {
    const swing = (spin: number) => {
      let h = newHull(0, 0, 0)
      h = { ...h, speed: spin }
      const a = h.heading
      for (let i = 0; i < 30; i++) h = stepHull(h, { throttle: 1, turn: 1, fullSail: false }, 1 / 60, deep)
      return h.heading - a
    }
    expect(swing(0)).toBeGreaterThan(swing(DEFAULT_SAIL.fullSail))
  })

  /* AGROUND IS READ OFF THE FIELD AND ESCAPED BY STRICT IMPROVEMENT. Driving
   * west into the coast stops her; turning round and driving east frees her. */
  it('runs aground on the coast and comes off only by going somewhere deeper', () => {
    let h = newHull(60, 0, Math.PI)                    // pointed west, at the coast
    for (let i = 0; i < 300; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, coastAtZero)
    expect(h.aground).toBe(true)
    expect(h.x).toBeGreaterThanOrEqual(0)
    expect(h.x).toBeLessThan(DEFAULT_SAIL.probe + 1)
    const stuck = h.x
    h = { ...h, heading: 0 }                           // about turn
    for (let i = 0; i < 120; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, coastAtZero)
    expect(h.x).toBeGreaterThan(stuck)
    expect(h.aground).toBe(false)
  })

  it('lays two diverging trails behind her and only while she is moving', () => {
    let h = newHull(0, 0, 0)
    for (let i = 0; i < 120; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, deep)
    expect(h.wake.length).toBeGreaterThan(4)
    expect(new Set(h.wake.map((p) => p.side))).toEqual(new Set([-1, 1]))
    /* the trails are BEHIND her and on both sides of the centreline */
    expect(Math.max(...h.wake.map((p) => p.x))).toBeLessThan(h.x)
    expect(Math.min(...h.wake.map((p) => p.y))).toBeLessThan(0)
    expect(Math.max(...h.wake.map((p) => p.y))).toBeGreaterThan(0)

    /* A MOORED BOAT DOES NOT DRAW A PUDDLE. Let her run right down to a stop and
     * the trail stops growing and then ages out entirely, rather than a stopped
     * hull dropping a point every frame in one place. */
    let idle = h
    for (let i = 0; i < 400; i++) idle = stepHull(idle, HELM_IDLE, 1 / 60, deep)
    expect(idle.speed).toBe(0)
    expect(idle.wake).toHaveLength(0)
  })

  /* THE HARD POOL CAP. A crossing is unbounded and a 4 GB Chromebook is not. */
  it('caps the wake no matter how long the crossing is', () => {
    let h = newHull(0, 0, 0)
    for (let i = 0; i < 6000; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: true }, 1 / 60, deep)
    expect(h.wake.length).toBeLessThanOrEqual(DEFAULT_SAIL.wakeCap)
  })

  it('ages a wake point out rather than fading the whole trail at once', () => {
    let h = newHull(0, 0, 0)
    for (let i = 0; i < 120; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, deep)
    const ages = h.wake.map((p) => p.age)
    expect(Math.max(...ages)).toBeGreaterThan(Math.min(...ages))
    expect(Math.max(...ages)).toBeLessThan(DEFAULT_SAIL.wakeLife)
  })

  it('reads a heading back out in the same eight-way vocabulary the walk uses', () => {
    expect(headingOf(1, 0)).toBe('east')
    expect(headingOf(0, 1)).toBe('south')
    expect(headingOf(-1, 0)).toBe('west')
    expect(headingOf(0, -1)).toBe('north')
    expect(headingOf(1, 1)).toBe('south-east')
  })
})

/* ---- berthing -------------------------------------------------------------- */

describe('coming alongside', () => {
  it('decelerates onto the berth and ends stopped on the authored heading', () => {
    let h = newHull(600, 300, Math.PI)
    let b: Berthing = {
      target: { x: 300, y: 210 }, facing: Math.PI,
      approach: { x: 470, y: 300 }, stage: 'approach',
    }
    for (let i = 0; i < 2000 && b.stage !== 'done'; i++) {
      const r = berthHelm(h, b)
      b = r.next
      h = stepHull(h, r.helm, 1 / 60, deep)
    }
    expect(b.stage).toBe('done')
    expect(Math.hypot(h.x - 300, h.y - 210)).toBeLessThan(20)
    expect(h.speed).toBeLessThan(DEFAULT_SAIL.cruise * 0.15)
    /* she ends parallel to the dock rather than nosed into it */
    expect(Math.abs(Math.atan2(Math.sin(h.heading - Math.PI), Math.cos(h.heading - Math.PI)))).toBeLessThan(0.5)
  })

  it('makes for the approach point before the berth, so she does not cut the corner', () => {
    const h = newHull(900, 900, 0)
    const b: Berthing = {
      target: { x: 300, y: 210 }, approach: { x: 470, y: 300 }, stage: 'approach',
    }
    const r = berthHelm(h, b)
    expect(r.next.stage).toBe('approach')
    expect(r.helm.throttle).toBe(1)
  })

  it('asks for nothing once she is done', () => {
    const h = newHull(300, 210, 0)
    const r = berthHelm(h, { target: { x: 300, y: 210 }, stage: 'done' })
    expect(r.helm).toEqual(HELM_IDLE)
  })
})
