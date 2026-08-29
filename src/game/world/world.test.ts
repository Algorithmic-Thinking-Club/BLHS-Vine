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
  slotBytes, maxResident, trimToBudget, paintedCentre,
  TEXTURE_BUDGET_BYTES, PAINTING_PX_CEILING, SLOT_STATES,
  type WorldComposition, type WorldSlot,
} from './composition'
import {
  newHull, stepHull, berthHelm, headingOf, DEFAULT_SAIL, HELM_IDLE, BERTH_GIVE_UP_MS,
  type Berthing, type DepthAt,
} from './sail'
import { PLACES } from '../roster/roster'

/* ---- the composition ------------------------------------------------------ */

describe('the world composition', () => {
  it('places the three real bundles and one rumour, and nothing else', () => {
    expect(FALLBACK.slots.map((s) => s.map ?? '(none)')).toEqual(['hub', 'hub-a2', 'panther-maw', '(none)'])
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
    expect(slotOfPlace(FALLBACK, 'home-island')?.map).toBe('hub')
    expect(slotOfMap(FALLBACK, 'nothing-here')).toBeUndefined()
  })

  /* DISCOVERY IS MEASURED OFF THE PAINTED EXTENT, NOT OFF THE CANVAS.
   *
   * Measured on the published hub's own scene.png, 2026-08-29: the canvas is
   * 688x640 and the opaque pixels run x 7..675, y 194..570. So the painting is
   * 669x377 and USING THE CANVAS OVERSTATES ITS AREA BY 75 PERCENT. The doc's
   * 41 percent is the same fact counted the other way, as the fraction of the
   * canvas that is empty; both are right and this is the one that matters,
   * because a radius is measured off an area. */
  it('measures discovery off the painted extent and not off the canvas', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    expect(hub.footprint).toEqual({ w: 669, h: 377 })
    expect((688 * 640) / (669 * 377) - 1).toBeGreaterThan(0.74)
    /* a point 250 px below the painting's centre is OFF a 377-tall painting and
     * INSIDE a 640-tall canvas, which is the whole of the defect in one point */
    expect(distanceTo(hub, { x: 0, y: 250 })).toBeGreaterThan(0)
    expect(250 < 640 / 2).toBe(true)
  })

  /* AND THE PAINTING IS NOT IN THE MIDDLE OF ITS OWN CANVAS. The hub's opaque
   * rows are 194 to 570 of 640, so its centre is 62 pixels below the canvas
   * centre and a slot placed by half the canvas puts the island 62 pixels north
   * of where the chart says it is. */
  it('places a painting by its own centre and not by half its canvas', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    expect(paintedCentre(hub, 688, 640)).toEqual({ x: 341.5, y: 382.5 })
    expect(paintedCentre(hub, 688, 640).y - 640 / 2).toBeCloseTo(62.5, 1)
    /* a slot with no origin authored is centred, which is true of a tight crop */
    const maw = slotOfMap(FALLBACK, 'panther-maw')!
    expect(paintedCentre(maw, 512, 512)).toEqual({ x: 256, y: 256 })
  })

  it('is inside the footprint when the point is inside the painting', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    expect(distanceTo(hub, { x: 0, y: 0 })).toBeLessThan(0)
  })

  it('discovers an island when the hull comes inside its radius and not before', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    const far = { x: 0, y: 4000 }
    const near = { x: 0, y: 400 }
    expect(discoveredSlots(FALLBACK, far).map((s) => s.map)).not.toContain('hub')
    expect(discoveredSlots(FALLBACK, near).map((s) => s.map)).toContain('hub')
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
    const hub = slotOfMap(FALLBACK, 'hub')!
    /* THREE decoded layers at the CANVAS size, which is what PmapScene really
     * loads and really pays for, plus the hub's own 94 placements at ITS OWN
     * measured 14,806 pixels each. Every term here was wrong in the first draft:
     * a fourth layer the engine never loads, at the painted extent rather than
     * the canvas, times a per-placement figure taken by dividing the proof
     * bundle's asset pixels by its FILE count instead of its two placements. The
     * two errors partly cancelled, which is the worst kind of luck: the total
     * looked plausible and not one term was true. */
    expect(slotBytes(hub)).toBe((688 * 640 * 3 + 94 * 14_806) * 4)
    expect(slotBytes(hub) / 1048576).toBeGreaterThan(10)
    expect(slotBytes(hub) / 1048576).toBeLessThan(11)
    expect(overBudget([hub])).toBe(false)
    /* WHAT A MAP COSTS IS MOSTLY ITS DRESSING, not its painting: the hub's 94
     * placements are twice as many pixels as all four of its full-canvas layers
     * put together. That is why the placement count is a field on a slot rather
     * than one constant for every map, and it is the number a member adding
     * their fiftieth villager is spending. */
    expect(94 * 14_806).toBeGreaterThan(669 * 377)
    const maw = slotOfMap(FALLBACK, 'panther-maw')!
    expect(slotBytes(maw)).toBeLessThan(slotBytes(hub))
  })

  /* THE SENTENCE ISLAND TWELVE NEVER HAD. Twenty-four dressed maps is the whole
   * of what a 256 MB texture budget holds, which means the roster can double
   * from the current four places before residency starts dropping anything, and
   * the day it does the drop is a decision with a number rather than a tab
   * running out of memory. */
  it('says how many dressed maps fit at once, which island twelve never had', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    const n = maxResident(hub)
    expect(n).toBe(24)
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

  /* A HULL ORBITS A WAYPOINT IT CANNOT TURN TIGHTLY ENOUGH TO HIT. At cruise her
   * turn radius is about 92 pixels and the capture circle is 36, so steering at
   * a point and waiting to be inside it is a manoeuvre that never finishes. This
   * is that failure, driven, and it is the one the proof run found. */
  it('passes a waypoint rather than orbiting one it cannot turn tightly enough to hit', () => {
    let h = newHull(1780, -212, 0)
    let b: Berthing = {
      target: { x: 228, y: 177 }, facing: Math.PI / 2,
      approach: { x: 300, y: 258 }, stage: 'approach',
    }
    let sawAlongside = false
    for (let i = 0; i < 6000 && b.stage !== 'done'; i++) {
      const r = berthHelm(h, b)
      b = r.next
      if (b.stage === 'alongside') sawAlongside = true
      h = stepHull(h, r.helm, 1 / 60, deep)
    }
    expect(sawAlongside).toBe(true)
    expect(b.stage).toBe('done')
    expect(Math.hypot(h.x - 228, h.y - 177)).toBeLessThan(20)
  })

  it('treats a waypoint that is behind the bow as passed, and does not turn back for it', () => {
    /* heading east, with the approach point just astern: a helmsman carries on */
    const h = { ...newHull(500, 0, 0), speed: 120 }
    const r = berthHelm(h, {
      target: { x: 900, y: 0 }, approach: { x: 470, y: 0 }, stage: 'approach',
    })
    expect(r.next.stage).toBe('alongside')
  })

  it('asks for nothing once she is done', () => {
    const h = newHull(300, 210, 0)
    const r = berthHelm(h, { target: { x: 300, y: 210 }, stage: 'done' })
    expect(r.helm).toEqual(HELM_IDLE)
  })

  /* ---- THE TWO WAYS A MANOEUVRE USED TO FREEZE THE GAME -------------------
   *
   * Both found by driving the shipped code against the published hub's own
   * distance field: 47 of 392 in-water starts inside the dock prompt's radius
   * never finished, and every approach from the north or the west hung. While a
   * manoeuvre runs the player's helm is ignored, the dock prompt is suppressed
   * and stepping ashore is unreachable, so a manoeuvre that cannot finish is a
   * reload. These two tests are that failure, standing still. */

  /** a coast running east-west at y = 0: deep to the south, land to the north */
  const shelf = (_x: number, y: number) => y

  it('slides along a coast instead of stopping dead on it', () => {
    /* she is on the 20-deep contour, inside the 26px probe, pointed along it.
     * The old rule asked for STRICTLY deeper and a slide is the same depth, so
     * this was an absorbing fixed point: identical numbers at 5s and at 30s. */
    let h = { ...newHull(0, 20, 0), speed: DEFAULT_SAIL.cruise }
    const x0 = h.x
    for (let i = 0; i < 120; i++) h = stepHull(h, { throttle: 1, turn: 0, fullSail: false }, 1 / 60, shelf)
    expect(h.aground).toBe(true)
    expect(h.x).toBeGreaterThan(x0 + 40)
  })

  it('gives the helm back rather than steering at a berth it cannot reach', () => {
    /* a berth ON the land side of the coast: unreachable by construction, which
     * is what a doorway-shaped inlet is to a hull that cannot turn tightly. */
    let h = { ...newHull(0, 300, -Math.PI / 2), speed: 60 }
    let b: Berthing = { target: { x: 0, y: -400 }, stage: 'alongside' }
    let ticks = 0
    for (; ticks < 3000 && b.stage !== 'given_up' && b.stage !== 'done'; ticks++) {
      const r = berthHelm(h, b, DEFAULT_SAIL, 1 / 60)
      b = r.next
      h = stepHull(h, r.helm, 1 / 60, shelf)
    }
    expect(b.stage).toBe('given_up')
    /* and it gives up on a clock rather than after an arbitrary number of ticks:
     * four seconds without getting closer, not four seconds flat */
    expect(ticks / 60).toBeGreaterThan(BERTH_GIVE_UP_MS / 1000)
    expect(ticks / 60).toBeLessThan(20)
    expect(berthHelm(h, b, DEFAULT_SAIL, 1 / 60).helm).toEqual(HELM_IDLE)
  })

  it('does not give up on a manoeuvre that is still closing', () => {
    let h = newHull(900, 900, 0)
    let b: Berthing = {
      target: { x: 300, y: 210 }, facing: Math.PI, approach: { x: 470, y: 300 }, stage: 'approach',
    }
    for (let i = 0; i < 4000 && b.stage !== 'done' && b.stage !== 'given_up'; i++) {
      const r = berthHelm(h, b, DEFAULT_SAIL, 1 / 60)
      b = r.next
      h = stepHull(h, r.helm, 1 / 60, deep)
    }
    expect(b.stage).toBe('done')
  })
})
