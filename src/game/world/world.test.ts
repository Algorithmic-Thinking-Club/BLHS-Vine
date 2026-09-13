/* the world's arithmetic, tested as pure functions without a browser */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  FALLBACK, compositionFaults, distanceTo, discoveredSlots, residentSlots,
  regionAt, seaSlots, slotOfMap, slotOfPlace, residencyBytes, overBudget,
  slotBytes, maxResident, trimToBudget, paintedCentre,
  marksOf, markByName, markNames, berthOf, approachTo, approachNames, berthOfRoute, farStart, LOCAL_WORLD,
  TEXTURE_BUDGET_BYTES, PAINTING_PX_CEILING, SLOT_STATES,
  type WorldComposition, type WorldSlot,
} from './composition'
import {
  newHull, stepHull, berthHelm, headingOf, DEFAULT_SAIL, HELM_IDLE, BERTH_GIVE_UP_MS,
  ALONGSIDE_PX, ALONGSIDE_RAD,
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

  /* the composition.json this repo ships has to pass the same rules as the constant */
  it('the shipped public/world/composition.json passes the same rules', async () => {
    const { readFileSync } = await import('node:fs')
    const doc = JSON.parse(readFileSync('public/world/composition.json', 'utf8')) as WorldComposition
    const known = new Set(PLACES.map((p) => p.id))
    expect(compositionFaults(doc, known)).toEqual([])
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
    expect(drawn.map((s) => s.title)).toEqual(['Bonney Lake High School', 'the stadium'])
  })

  it('resolves a map to its slot and a place to the one that has the berth', () => {
    expect(slotOfMap(FALLBACK, 'panther-maw')?.title).toBe('the Panther’s Maw, inside the mountain')
    expect(slotOfPlace(FALLBACK, 'home-island')?.map).toBe('hub')
    expect(slotOfMap(FALLBACK, 'nothing-here')).toBeUndefined()
  })

  /* discovery is measured off the painted extent rather than off the whole canvas */
  it('measures discovery off the painted extent and not off the canvas', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    expect(hub.footprint).toEqual({ w: 669, h: 377 })
    expect((688 * 640) / (669 * 377) - 1).toBeGreaterThan(0.74)
    /* a point 250 px below the painting's centre is OFF a 377-tall painting and
     * INSIDE a 640-tall canvas, which is the whole of the defect in one point */
    expect(distanceTo(hub, { x: 0, y: 250 })).toBeGreaterThan(0)
    expect(250 < 640 / 2).toBe(true)
  })

  /* a painting is placed by its own centre, because it is not in the middle of its canvas */
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

  /* what a resident map costs in memory, computed off the bundles on disk */
  it('computes what a resident map costs from the measured bundle', () => {
    const hub = slotOfMap(FALLBACK, 'hub')!
    /* three decoded layers at the canvas size, plus the hub's own placements */
    expect(slotBytes(hub)).toBe((688 * 640 * 3 + 94 * 14_806) * 4)
    expect(slotBytes(hub) / 1048576).toBeGreaterThan(10)
    expect(slotBytes(hub) / 1048576).toBeLessThan(11)
    expect(overBudget([hub])).toBe(false)
    /* a map costs mostly its placements rather than its painting */
    expect(94 * 14_806).toBeGreaterThan(669 * 377)
    const maw = slotOfMap(FALLBACK, 'panther-maw')!
    expect(slotBytes(maw)).toBeLessThan(slotBytes(hub))
  })

  /* how many dressed maps fit in the texture budget at once */
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

  /* a fault names the slot it is about, or names none when it is about the document */
  it('says which slot is at fault, and says nothing of the kind about the document', () => {
    const doc: WorldComposition = {
      version: 2,
      slots: [
        { map: 'a', title: 'a', at: { x: 0, y: 0 }, footprint: { w: 100, h: 100 }, state: 'available', release: 100 },
        { title: 'empty but claiming to be open', at: { x: 0, y: 0 }, footprint: { w: 100, h: 100 }, state: 'available', release: 100 },
        { map: 'c', title: 'c', at: { x: 0, y: 0 }, footprint: { w: 100, h: 100 }, state: 'available', release: 100 },
      ],
      home: { slot: 'nowhere' },
    }
    const f = compositionFaults(doc)
    expect(f.filter((x) => x.slot !== undefined).map((x) => x.slot)).toEqual([1])
    /* the home fault carries no index at all, not an index of nothing, because a
     * reader drops slots by that field */
    const home = f.find((x) => x.key === 'home')!
    expect('slot' in home).toBe(false)
  })
})

/* the document the platform is really serving, copied verbatim off the live api */
const LIVE: WorldComposition = {
  version: 395,
  home: { slot: 'home-island' },
  slots: [{
    map: 'hub', place: 'home-island', title: 'The Hub',
    at: { x: 2051.5, y: 1975.5 },
    footprint: { w: 669, h: 377 }, origin: { x: 7, y: 194 }, canvas: { w: 688, h: 640 },
    placements: 94, state: 'available', release: 1400, discover: 520,
    berth: { name: 'the_hub_berth', x: 2238, y: 2123, facing: 'north' },
  }],
  regions: [],
  marks: [{
    x: 2238, y: 2123, kind: 'berth', name: 'the_hub_berth',
    label: 'The Hub Berth', facing: 'north', island: 'the_hub',
  }],
  source: 'mapvis',
}

describe('the world the platform is serving', () => {
  it('passes the same checker the game refuses a document on', () => {
    const known = new Set(PLACES.map((p) => p.id))
    expect(compositionFaults(LIVE)).toEqual([])
    expect(compositionFaults(LIVE, known)).toEqual([])
  })

  /* the live footprint is the painting rather than the canvas, and home names a place id */
  it('carries a footprint under the ceiling and a home that names a place id', () => {
    const hub = LIVE.slots[0]
    expect(hub.footprint.w * hub.footprint.h).toBeLessThan(PAINTING_PX_CEILING)
    expect(hub.canvas!.w * hub.canvas!.h).toBeGreaterThan(PAINTING_PX_CEILING * 1.02)
    expect(LIVE.home!.slot).toBe(hub.place)
  })
})

/* a berth sits off every painting, so it is looked up by name on the world instead */
describe('the marks a route can end at', () => {
  it('indexes a berth by its name and by the island it belongs to', () => {
    expect(markNames(LIVE)).toEqual(['the_hub', 'the_hub_berth'])
    expect(markByName(LIVE, 'the_hub_berth')?.label).toBe('The Hub Berth')
    /* "sail to the hub" is a line a member will write, so the island key is an
     * alias for its own berth rather than a second mark */
    expect(markByName(LIVE, 'the_hub')?.name).toBe('the_hub_berth')
    expect(markByName(LIVE, 'nowhere_at_all')).toBeUndefined()
  })

  it('skips a mark with no name or no position rather than putting one at the origin', () => {
    const doc = {
      version: 1, slots: [],
      marks: [
        { name: '', kind: 'berth', x: 10, y: 10 },
        { name: 'no_x', kind: 'berth', y: 10 },
        { name: 'not_a_number', kind: 'berth', x: 'by the rocks', y: 10 },
        { name: 'the_good_one', kind: 'berth', x: 10, y: 10 },
      ],
    } as unknown as WorldComposition
    expect(markNames(doc)).toEqual(['the_good_one'])
  })

  it('folds in a slot own berth, so a world written before marks existed still answers', () => {
    const older: WorldComposition = {
      version: 1,
      slots: [{
        map: 'quay', title: 'the quay', at: { x: 0, y: 0 },
        footprint: { w: 100, h: 100 }, state: 'available', release: 100,
        berth: { name: 'the_quay_berth', x: 40, y: 60, facing: 'east', approach: { x: 90, y: 90 } },
      }],
    }
    const m = marksOf(older).get('the_quay_berth')!
    expect(m.x).toBe(40)
    expect(m.kind).toBe('berth')
    /* the fold names the map it hangs off, which is a THIRD spelling of the same
     * island beside the marks array's own `island` field and the roster's place
     * id, and it is the key a member gets if only the slot carries the berth */
    expect(m.island).toBe('quay')
  })

  it('lets the marks array own a name the slot berth also claims', () => {
    /* the free-placed mark is the newer authoring surface, so it wins the name
     * and the slot copy does not shadow it with older coordinates */
    const moved: WorldComposition = {
      ...LIVE,
      marks: [{ ...LIVE.marks![0], x: 2400, y: 2200 }],
    }
    expect(marksOf(moved).get('the_hub_berth')?.x).toBe(2400)
  })

  /* the slot's copy of a berth is the one carrying the approach point */
  it('prefers the slot berth over a bare mark of the same name', () => {
    const withApproach: WorldComposition = {
      ...LIVE,
      slots: [{ ...LIVE.slots[0], berth: { ...LIVE.slots[0].berth!, approach: { x: 2300, y: 2210 } } }],
    }
    expect(berthOf(withApproach, 'the_hub_berth')?.approach).toEqual({ x: 2300, y: 2210 })
    expect(markByName(withApproach, 'the_hub_berth')).toEqual(LIVE.marks![0])
  })

  it('answers with a free-placed berth no slot claims, and with nothing for a mark that is not one', () => {
    const doc: WorldComposition = {
      version: 1, slots: [],
      marks: [
        { name: 'the_far_berth', kind: 'berth', x: 900, y: 20, facing: 'west', at: 'arrive_here' },
        { name: 'the_bell', kind: 'beacon', x: 12, y: 12 },
      ],
    }
    expect(berthOf(doc, 'the_far_berth')).toEqual({ x: 900, y: 20, name: 'the_far_berth', facing: 'west', at: 'arrive_here' })
    /* a beacon is a thing on the water and not somewhere to tie up */
    expect(berthOf(doc, 'the_bell')).toBeUndefined()
    expect(berthOf(doc, 'never_authored')).toBeUndefined()
  })
})

/* where the composition is loaded from, and what happens when a slot in it is faulty */
describe('loading the composition', () => {
  const PLATFORM = 'https://mapvis-atc.vercel.app/api/v1/world'

  /** a module with its own cache, because the real one holds the first answer */
  const freshWorld = async () => {
    vi.resetModules()
    return await import('./composition')
  }

  const served = (body: unknown) => ({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  } as unknown as Response)

  const notThere = () => ({
    ok: false, status: 404,
    headers: { get: () => 'text/html' },
    json: async () => ({}),
  } as unknown as Response)

  /** one document per url and a 404 for anything else */
  const serving = (by: Record<string, unknown>) =>
    vi.fn(async (u: string) => (u in by ? served(by[u]) : notThere()))

  const slot = (map: string): WorldSlot => ({
    map, title: map, at: { x: 0, y: 0 },
    footprint: { w: 669, h: 377 }, state: 'available', release: 1400,
  })

  const quiet = () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    return vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('uses the platform document when the platform answers', async () => {
    const { loadComposition, compositionReport } = await freshWorld()
    const f = serving({ [PLATFORM]: LIVE })
    vi.stubGlobal('fetch', f)
    const c = await loadComposition(PLATFORM)
    expect(c.version).toBe(395)
    expect(c.source).toBe('mapvis')
    expect(compositionReport()).toEqual({ origin: PLATFORM, faults: [] })
    /* and it stops there. Asking for the local copy as well is a second request
     * a classroom Chromebook pays for and never reads. */
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('falls back to the copy in this repo when the platform cannot be reached', async () => {
    const { loadComposition, compositionReport } = await freshWorld()
    const local = { version: 9, slots: [slot('hub')] }
    vi.stubGlobal('fetch', serving({ [LOCAL_WORLD]: local }))
    const c = await loadComposition(PLATFORM)
    expect(c.version).toBe(9)
    expect(compositionReport().origin).toBe(LOCAL_WORLD)
  })

  it('runs on the built-in composition when nothing answers at all', async () => {
    const { loadComposition, compositionReport, FALLBACK: BUILT_IN } = await freshWorld()
    quiet()
    vi.stubGlobal('fetch', serving({}))
    expect(await loadComposition(PLATFORM)).toBe(BUILT_IN)
    /* the origin is the sentence a teacher needs, because "the world looks
     * wrong" is not something anybody can act on */
    expect(compositionReport().origin).toBe('built in')
  })

  it('does not go looking for a platform a session has not got one of', async () => {
    /* a member with nothing but this repo checked out reads the committed copy
     * and makes exactly one request */
    const { loadComposition } = await freshWorld()
    const f = serving({ [LOCAL_WORLD]: { version: 9, slots: [slot('hub')] } })
    vi.stubGlobal('fetch', f)
    await loadComposition(LOCAL_WORLD)
    expect(f).toHaveBeenCalledTimes(1)
  })

  /* THE WHOLE POINT OF THE CHANGE. The old reader binned all four slots and fell
   * back to a hardcoded default over one footprint, and nothing on screen said
   * so. One bad slot must never again cost the other three. */
  it('keeps the good slots and drops only the bad one', async () => {
    const { loadComposition, compositionReport } = await freshWorld()
    const err = quiet()
    const doc: WorldComposition = {
      version: 400,
      slots: [slot('hub'), slot('the_quay'), { ...slot('the_deep'), footprint: { w: 900, h: 900 } }, slot('atc')],
    }
    vi.stubGlobal('fetch', serving({ [PLATFORM]: doc }))
    const c = await loadComposition(PLATFORM)
    expect(c.version).toBe(400)
    expect(c.slots.map((s) => s.map)).toEqual(['hub', 'the_quay', 'atc'])
    const { origin, faults } = compositionReport()
    expect(origin).toBe(PLATFORM)
    expect(faults.map((f) => f.slot)).toEqual([2])
    /* and it is an error, not a warn. A warn is what a browser prints for a
     * deprecated css property and it is what this printed while the world was
     * being deleted. */
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0][0])).toContain('1 of 4 slots dropped')
  })

  it('refuses a document whole only when nothing in it survives', async () => {
    const { loadComposition, FALLBACK: BUILT_IN } = await freshWorld()
    const err = quiet()
    const doc: WorldComposition = {
      version: 401,
      slots: [{ ...slot('a'), footprint: { w: 900, h: 900 } }, { ...slot('b'), footprint: { w: 0, h: 0 } }],
    }
    vi.stubGlobal('fetch', serving({ [PLATFORM]: doc }))
    /* nothing survives the platform and there is no local copy in this stub, so
     * the step down goes all the way rather than to an empty ocean */
    expect(await loadComposition(PLATFORM)).toBe(BUILT_IN)
    expect(err.mock.calls.map((c) => String(c[0])).join()).toContain('refused whole')
  })

  it('drops nothing for a fault that is about the document rather than a slot', async () => {
    const { loadComposition, compositionReport } = await freshWorld()
    quiet()
    const doc: WorldComposition = {
      version: 402,
      slots: [slot('hub'), slot('the_quay')],
      home: { slot: 'The Hub' },
    }
    vi.stubGlobal('fetch', serving({ [PLATFORM]: doc }))
    const c = await loadComposition(PLATFORM)
    /* a world with a mistyped home is still a world, and refusing it leaves a
     * student staring at nothing. This is the exact string that used to delete
     * every island in the published document. */
    expect(c.slots.map((s) => s.map)).toEqual(['hub', 'the_quay'])
    expect(compositionReport().faults.map((f) => f.key)).toEqual(['home'])
  })

  it('answers the same document to a second caller rather than fetching twice', async () => {
    const { loadComposition } = await freshWorld()
    const f = serving({ [PLATFORM]: LIVE })
    vi.stubGlobal('fetch', f)
    const [a, b] = await Promise.all([loadComposition(PLATFORM), loadComposition(PLATFORM)])
    expect(a).toBe(b)
    expect(f).toHaveBeenCalledTimes(1)
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


  /* ---- SHE ARRIVES FACING THE WAY THE BERTH WAS DRAWN --------------------
   *
   * Ash, watching the intro sail into the hub: "it does not dock in the
   * orientation shown in the berth in MAPVIS, and it also does weird spin like
   * its confused on which way to dock." Measured on that crossing, she came in
   * 121 degrees off the authored heading, stopped dead and turned on the spot.
   *
   * These hold the fix from every direction rather than from one, because the
   * old manoeuvre was correct from directly astern of the berth and wrong from
   * everywhere else, and one lucky start is how it survived.
   */
  it('arrives lying along the berth from any direction, not nosed in at a random angle', () => {
    const target = { x: 300, y: 210 }
    const facing = -0.698                 // the hub berth's own heading, off the live ocean
    const worst: { from: number; off: number; spun: number }[] = []
    for (let deg = 0; deg < 360; deg += 30) {
      const a = (deg * Math.PI) / 180
      let h = { ...newHull(target.x + Math.cos(a) * 700, target.y + Math.sin(a) * 700, a + Math.PI), speed: 150 }
      let b: Berthing = { target, facing, stage: 'approach' }
      /* how much of the turn happens standing still, which is the spin he saw */
      let spun = 0
      for (let i = 0; i < 4000 && b.stage !== 'done' && b.stage !== 'given_up'; i++) {
        const r = berthHelm(h, b)
        b = r.next
        const was = h.heading
        h = stepHull(h, r.helm, 1 / 60, deep)
        if (h.speed < 1) spun += Math.abs(Math.atan2(Math.sin(h.heading - was), Math.cos(h.heading - was)))
      }
      const off = Math.abs(Math.atan2(Math.sin(h.heading - facing), Math.cos(h.heading - facing)))
      worst.push({ from: deg, off: +off.toFixed(3), spun: +spun.toFixed(3) })
      expect(b.stage).toBe('done')
      expect(Math.hypot(h.x - target.x, h.y - target.y)).toBeLessThan(ALONGSIDE_PX + 2)
    }
    /* within the tolerance the manoeuvre itself declares, from every bearing */
    expect(worst.filter((w) => w.off > ALONGSIDE_RAD)).toEqual([])
    /* AND SHE DID THE TURNING UNDER WAY. A tenth of a radian is settling; the
     * measured pirouette was 1.75, and the old code fails this by ten times. */
    expect(worst.filter((w) => w.spun > 0.35)).toEqual([])
  })

  it('needs no approach point drawn to do it, which is what a member gets for free', () => {
    /* the same arrival with nothing authored but the heading */
    let h = { ...newHull(900, 900, 0), speed: 150 }
    let b: Berthing = { target: { x: 300, y: 210 }, facing: Math.PI, stage: 'approach' }
    expect(b.approach).toBeUndefined()
    for (let i = 0; i < 4000 && b.stage !== 'done'; i++) {
      const r = berthHelm(h, b)
      b = r.next
      h = stepHull(h, r.helm, 1 / 60, deep)
    }
    expect(b.stage).toBe('done')
    const off = Math.abs(Math.atan2(Math.sin(h.heading - Math.PI), Math.cos(h.heading - Math.PI)))
    expect(off).toBeLessThan(ALONGSIDE_RAD)
  })

  it('still drives straight at a berth nobody gave a heading to', () => {
    /* no line to pick up, so the run-in must not invent one */
    let h = { ...newHull(900, 900, 0), speed: 150 }
    let b: Berthing = { target: { x: 300, y: 210 }, stage: 'approach' }
    for (let i = 0; i < 4000 && b.stage !== 'done'; i++) {
      const r = berthHelm(h, b)
      b = r.next
      h = stepHull(h, r.helm, 1 / 60, deep)
    }
    expect(b.stage).toBe('done')
    expect(Math.hypot(h.x - 300, h.y - 210)).toBeLessThan(ALONGSIDE_PX + 2)
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

  /* a waypoint the hull cannot turn tightly enough to hit counts as passed, not orbited */
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

  /* the two ways a berthing manoeuvre can fail to finish while it holds the helm */

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

/* the crossing a berth already carries on the world, read off its waypoint marks */
describe('the approach a berth already has on the world', () => {
  /* the live document as it stands on the platform at v397, which is the shape
   * the rule has to be right about before it is right about anything invented */
  const OCEAN: WorldComposition = {
    version: 397,
    slots: [{
      map: 'hub', place: 'home-island', title: 'The Hub',
      at: { x: 2077.5, y: 1973.5 }, footprint: { w: 669, h: 377 },
      state: 'available', release: 1400,
      berth: { name: 'the_hub_berth', x: 2264, y: 2145, facing: 'north' },
    }],
    marks: [
      { name: 'the_hub_berth', kind: 'berth', x: 2264, y: 2145, facing: 'north', island: 'the_hub' },
      { name: 'the_far_start', kind: 'waypoint', x: 2199, y: 2504 },
      { name: 'slow_down_ic', kind: 'waypoint', x: 2229, y: 2162, island: 'the_hub' },
    ],
  } as unknown as WorldComposition

  it('reads the three marks Ash drew, farthest out first, ending at the berth', () => {
    expect(approachTo(OCEAN, 'the_hub_berth').map((m) => m.name))
      .toEqual(['the_far_start', 'slow_down_ic', 'the_hub_berth'])
  })

  it('answers to the island alias too, because marksOf keys a mark both ways', () => {
    expect(approachTo(OCEAN, 'the_hub').map((m) => m.name))
      .toEqual(['the_far_start', 'slow_down_ic', 'the_hub_berth'])
  })

  /* `the_far_start` carries NO island on the live document. Grouping on that
   * field would have dropped the far end of the only crossing in the game and
   * left a two point line that starts 39px from the dock. */
  it('keeps a mark that carries no island at all', () => {
    expect(approachTo(OCEAN, 'the_hub_berth').some((m) => m.name === 'the_far_start')).toBe(true)
  })

  it('gives a mark to the berth it is nearest and not to the other one', () => {
    const two: WorldComposition = {
      ...OCEAN,
      slots: [],
      marks: [
        { name: 'near_berth', kind: 'berth', x: 0, y: 0 },
        { name: 'far_berth', kind: 'berth', x: 1000, y: 0 },
        { name: 'by_the_near', kind: 'waypoint', x: 100, y: 0 },
        { name: 'by_the_far', kind: 'waypoint', x: 900, y: 0 },
      ],
    } as unknown as WorldComposition
    expect(approachTo(two, 'near_berth').map((m) => m.name)).toEqual(['by_the_near', 'near_berth'])
    expect(approachTo(two, 'far_berth').map((m) => m.name)).toEqual(['by_the_far', 'far_berth'])
  })

  it('refuses a name that is not a berth, and one nobody authored', () => {
    expect(approachTo(OCEAN, 'slow_down_ic')).toEqual([])
    expect(approachTo(OCEAN, 'never_authored')).toEqual([])
  })

  /* a berth on its own is a voyage of no legs; the scene needs two points to
   * make a Pathway and would otherwise report a crossing it never made */
  it('gives a lone berth back as one mark, which is not a route', () => {
    const bare: WorldComposition = {
      version: 1, slots: [],
      marks: [{ name: 'lonely', kind: 'berth', x: 5, y: 5 }],
    } as unknown as WorldComposition
    expect(approachTo(bare, 'lonely')).toHaveLength(1)
  })

  it('lists every berth a crossing can be addressed to, for the refusal', () => {
    expect(approachNames(OCEAN)).toEqual(['the_hub_berth'])
  })

  /* THE FAR START IS WHERE THE HULL IS, so it leads the crossing whatever its
   * distance from the berth. Farthest-first would have put a mark drawn further
   * out ahead of it and sailed the ship away from the island before toward it. */
  it('starts the crossing at the_far_start even when another mark is farther out', () => {
    const wide: WorldComposition = {
      ...OCEAN,
      marks: [
        ...OCEAN.marks!,
        { name: 'the_way_out', kind: 'waypoint', x: 2199, y: 2900 },
      ],
    } as unknown as WorldComposition
    expect(approachTo(wide, 'the_hub_berth').map((m) => m.name))
      .toEqual(['the_far_start', 'the_way_out', 'slow_down_ic', 'the_hub_berth'])
  })

  it('names the far start, and only when it is not a berth', () => {
    expect(farStart(OCEAN)?.name).toBe('the_far_start')
    expect(farStart(OCEAN)).toMatchObject({ x: 2199, y: 2504 })
    const berthed: WorldComposition = {
      ...OCEAN,
      marks: [{ name: 'the_far_start', kind: 'berth', x: 1, y: 1 }],
    } as unknown as WorldComposition
    expect(farStart(berthed)).toBeUndefined()
    expect(farStart({ version: 1, slots: [] } as unknown as WorldComposition)).toBeUndefined()
  })
})

/* the names an island can ask a sea route by, and which berth each one means */
describe('what a route name means on the water', () => {
  const OCEAN: WorldComposition = {
    version: 397,
    slots: [{
      map: 'hub', place: 'home-island', title: 'The Hub',
      at: { x: 2077.5, y: 1973.5 }, footprint: { w: 669, h: 377 },
      state: 'available', release: 1400,
      berth: { name: 'the_hub_berth', x: 2264, y: 2145, facing: 'north' },
    }],
    marks: [
      { name: 'the_hub_berth', kind: 'berth', x: 2264, y: 2145, facing: 'north', island: 'the_hub' },
      { name: 'the_far_start', kind: 'waypoint', x: 2199, y: 2504 },
      { name: 'slow_down_ic', kind: 'waypoint', x: 2229, y: 2162, island: 'the_hub' },
    ],
  } as unknown as WorldComposition

  it('answers the name the hub island really asks by', () => {
    expect(berthOfRoute(OCEAN, 'the_hub_approach')).toBe('the_hub_berth')
  })

  it('answers the berth, its alias, and the slot, each with or without _approach', () => {
    for (const n of ['the_hub_berth', 'the_hub', 'the_hub_berth_approach', 'hub', 'hub_approach', 'home_island_approach'])
      expect(berthOfRoute(OCEAN, n), n).toBe('the_hub_berth')
  })

  it('refuses a waypoint, a spelling nobody authored, and a bare suffix', () => {
    expect(berthOfRoute(OCEAN, 'slow_down_ic')).toBeUndefined()
    expect(berthOfRoute(OCEAN, 'slow_down_ic_approach')).toBeUndefined()
    expect(berthOfRoute(OCEAN, 'the_stadium_approach')).toBeUndefined()
    expect(berthOfRoute(OCEAN, '_approach')).toBeUndefined()
    expect(berthOfRoute(OCEAN, 'approach')).toBeUndefined()
  })

  it('gives the whole crossing for that name, far start first', () => {
    const b = berthOfRoute(OCEAN, 'the_hub_approach')!
    expect(approachTo(OCEAN, b).map((m) => m.name)).toEqual(['the_far_start', 'slow_down_ic', 'the_hub_berth'])
  })
})
