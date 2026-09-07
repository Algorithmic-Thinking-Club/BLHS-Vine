/* THE LAW, TESTED AT LAST.
 *
 * src/vine/intents.ts:222 carries the rule the whole API rests on: no intent may
 * resolve successfully without performing, because the person a silent no-op
 * deceives is the AUTHOR, not the player. A member writes an arrival script, runs
 * it, sees no error, and ships an island whose most cinematic beat never plays and
 * reports that it worked. That survived a year, and one did.
 *
 * The enforcement is a single try/catch in one function and NOTHING TESTED IT.
 * 238 tests passed in twenty files and not one imported `performIntent` or
 * `runStation`, so every one of the three words that used to lie could have come
 * back and the suite would still have been green. These tests are the fence.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  performIntent, NotBuilt, WAIT_CEILING_MS, WAIT_FOR_CEILING_MS,
  type Intent, type IntentEngine, type IntentHost, type IntentWorld,
} from './intents'
import { runStation } from '../game/maw/run-station'

/* a world that carries exactly one anchor and records what it was asked to do, so
 * a test can tell "it refused" from "it did nothing and said yes" */
function stubWorld(over: Partial<IntentWorld> = {}) {
  const did: string[] = []
  const world: IntentWorld = {
    mapId: () => 'test-map',
    hasAnchor: (n) => n === 'chart_table',
    say: async (who, text) => { did.push(`say:${who ?? '-'}:${text}`) },
    choose: async (_p, o) => { did.push(`choose:${o.join('|')}`); return 1 },
    guideTo: (a) => { did.push(`guideTo:${a}`) },
    walkTo: async (a) => { did.push(`walkTo:${a}`) },
    lookAt: async (a) => { did.push(`lookAt:${a}`) },
    show: (a, v) => { did.push(`show:${a}:${v}`) },
    fx: async (n) => { did.push(`fx:${n}`) },
    enter: async (m) => { did.push(`enter:${m}`) },
    ashore: async () => { did.push('ashore') },
    cutscene: async (s) => { did.push(`cutscene:${s}`) },
    pose: async (p, f) => { did.push(`pose:${p ?? '-'}:${f ?? '-'}`) },
    actorMove: async (a, t) => { did.push(`actorMove:${a}:${t}`) },
    leadTo: async (a, t) => { did.push(`leadTo:${a}:${t}`) },
    place: (a, t) => { did.push(`place:${a}:${t}`) },
    actorFace: (a, f) => { did.push(`actorFace:${a}:${f}`) },
    actorLook: (a, l) => { did.push(`actorLook:${a}:${l}`) },
    actorRelease: (a) => { did.push(`actorRelease:${a ?? '*'}`) },
    route: async (p, who, back) => { did.push(`route:${p}:${who}:${back}`) },
    framing: async (s) => { did.push(`framing:${s}`) },
    view: async (v) => { did.push(`view:${v}`) },
    waitFor: async (a) => { did.push(`waitFor:${a}`); return true },
    ...over,
  }
  return { world, did }
}

const stubEngine = (): { engine: IntentEngine; did: string[] } => {
  const did: string[] = []
  return {
    did,
    engine: {
      openUi: (u, wait) => { did.push(`openUi:${u}${wait ? ':wait' : ''}`) },
      playBeat: async (b) => { did.push(`playBeat:${b}`); return 3 },
      read: (p) => { did.push(`read:${p}`); return 42 },
      setFlag: (f) => { did.push(`setFlag:${f}`) },
      award: (a) => { did.push(`award:${JSON.stringify(a)}`) },
      log: (e) => { did.push(`log:${e}`) },
      movie: (on) => { did.push(`movie:${on}`) },
      mode: () => 'game',
      /* no real timer in a test: the point of a `wait` here is that it was asked
       * for and that the ceiling was applied, and a test that really slept would
       * add thirty seconds to the suite to prove a setTimeout works */
      wait: async (ms) => { did.push(`wait:${ms}`) },
      sound: (n, g) => { did.push(`sound:${n}${g === undefined ? '' : `:${g}`}`) },
    },
  }
}

const host = (over: Partial<IntentWorld> = {}): IntentHost & { did: string[]; edid: string[] } => {
  const w = stubWorld(over)
  const e = stubEngine()
  return { world: w.world, engine: e.engine, did: w.did, edid: e.did }
}

describe('an unbuilt word refuses instead of resolving', () => {
  it('turns a NotBuilt throw into {ok:false} carrying its own message', async () => {
    const h = host({ cutscene: async () => { throw new NotBuilt('cutscene', '"x" cannot play here') } })
    const r = await performIntent({ kind: 'cutscene', script: 'x' }, h)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.why).toContain('cutscene is not built yet')
    expect(r.ok === false && r.why).toContain('cannot play here')
  })

  it('turns any other throw into a refusal rather than letting it cross the boundary', async () => {
    const h = host({ show: () => { throw new Error('the sprite is gone') } })
    const r = await performIntent({ kind: 'show', anchor: 'chart_table', visible: true }, h)
    expect(r).toEqual({ ok: false, why: 'the sprite is gone' })
  })

  it('says which word needed a map when the scene has none', async () => {
    const h = { world: null, engine: stubEngine().engine }
    const r = await performIntent({ kind: 'walk_to', anchor: 'chart_table' }, h)
    expect(r).toEqual({ ok: false, why: 'walk_to needs a map, and this scene has none' })
  })

  it('and still answers the engine half with no world at all', async () => {
    const e = stubEngine()
    const r = await performIntent({ kind: 'get', path: 'year' }, { world: null, engine: e.engine })
    expect(r).toEqual({ ok: true, value: 42 })
  })
})

describe('every word that takes an anchor refuses a name the map does not carry', () => {
  /* A TYPO IN AN ANCHOR NAME IS THE MOST LIKELY MISTAKE A MEMBER WILL MAKE, and
   * `look_at` was the one word of the four that went straight through, resolved on
   * the next tick, and answered ok with the camera never having moved. */
  const cases: Intent[] = [
    { kind: 'guide_to', anchor: 'chart_tabel' },
    { kind: 'walk_to', anchor: 'chart_tabel' },
    { kind: 'look_at', anchor: 'chart_tabel' },
    { kind: 'show', anchor: 'chart_tabel', visible: true },
    /* the director words check theirs the same way and for the same reason, and
     * `fx` joined them: it took an anchor and checked it only inside the scene,
     * so the one word whose refusal could differ from every other word's did */
    { kind: 'fx', name: 'spark', anchor: 'chart_tabel' },
    { kind: 'actor_move', actor: 'chart_tabel', to: 'chart_table' },
    { kind: 'actor_move', actor: 'chart_table', to: 'chart_tabel' },
    { kind: 'actor_face', actor: 'chart_tabel', facing: 'south' },
    { kind: 'actor_look', actor: 'chart_tabel', look: 'angry' },
    { kind: 'actor_release', actor: 'chart_tabel' },
    { kind: 'wait_for', anchor: 'chart_tabel' },
  ]
  for (const i of cases) {
    it(`${i.kind} says so, at the name that was wrong`, async () => {
      const h = host()
      const r = await performIntent(i, h)
      expect(r.ok, i.kind).toBe(false)
      expect(r.ok === false && r.why).toContain('no anchor named "chart_tabel" on test-map')
      expect(h.did, `${i.kind} performed anyway`).toEqual([])
    })
  }

  it('and performs when the anchor is real', async () => {
    const h = host()
    for (const i of [
      { kind: 'guide_to', anchor: 'chart_table' },
      { kind: 'walk_to', anchor: 'chart_table' },
      { kind: 'look_at', anchor: 'chart_table' },
      { kind: 'show', anchor: 'chart_table', visible: false },
    ] as Intent[]) expect((await performIntent(i, h)).ok, i.kind).toBe(true)
    expect(h.did).toEqual(['guideTo:chart_table', 'walkTo:chart_table', 'lookAt:chart_table', 'show:chart_table:false'])
  })

  it('look_at with a null anchor is letting the camera go, not a missing name', async () => {
    const h = host()
    expect((await performIntent({ kind: 'look_at', anchor: null }, h)).ok).toBe(true)
    expect(h.did).toEqual(['lookAt:null'])
  })

  it('guide_to with a null anchor takes the arrow down and is not a missing name', async () => {
    /* the arrow had a raise and no lower. An island that pointed once outranked
     * the year's own next step for the life of the scene, which on the hub means
     * every objective after that beat pointed at whatever the beat had finished
     * with. */
    const h = host()
    expect((await performIntent({ kind: 'guide_to', anchor: null }, h)).ok).toBe(true)
    expect(h.did).toEqual(['guideTo:null'])
  })

  it('actor_release with no name is a tidy-up and is always legal', async () => {
    // releasing everything has to work on a map where nothing was ever driven,
    // because the scene itself calls it at the end whether or not a script did
    const h = host()
    expect((await performIntent({ kind: 'actor_release' }, h)).ok).toBe(true)
    expect(h.did).toEqual(['actorRelease:*'])
  })
})

describe('the director class', () => {
  it('refuses a pose that says nothing at all', async () => {
    // both fields absent is a call that would stand there reporting success and
    // doing nothing, which is the one thing no word in this vocabulary may do
    const h = host()
    const r = await performIntent({ kind: 'pose' }, h)
    expect(r).toEqual({ ok: false, why: 'pose needs a pose, a facing, or both' })
    expect(h.did).toEqual([])
  })

  it('lets a pose be a heading on its own, which is the common case', async () => {
    const h = host()
    expect((await performIntent({ kind: 'pose', facing: 'north' }, h)).ok).toBe(true)
    expect(h.did).toEqual(['pose:-:north'])
  })

  it('caps a wait rather than freezing a scene for an hour', async () => {
    const h = host()
    expect((await performIntent({ kind: 'wait', ms: 999_999 }, h)).ok).toBe(true)
    expect(h.edid).toEqual([`wait:${WAIT_CEILING_MS}`])
  })

  it('refuses a wait that is not a number of milliseconds', async () => {
    const h = host()
    for (const ms of [-1, NaN, Infinity]) {
      const r = await performIntent({ kind: 'wait', ms }, h)
      expect(r.ok, String(ms)).toBe(false)
      expect(r.ok === false && r.why).toContain('wait wants a number of milliseconds')
    }
    expect(h.edid).toEqual([])
  })

  it('answers wait_for with whether he actually got there', async () => {
    // a timeout that resolves the same as an arrival is a timeout an island
    // cannot branch on, so the value IS the answer
    const arrived = host()
    expect(await performIntent({ kind: 'wait_for', anchor: 'chart_table' }, arrived))
      .toEqual({ ok: true, value: true })
    const gave = host({ waitFor: async () => false })
    expect(await performIntent({ kind: 'wait_for', anchor: 'chart_table', ms: 10 }, gave))
      .toEqual({ ok: true, value: false })
  })

  it('sends a null shot through, because releasing the camera is the message', async () => {
    const h = host()
    expect((await performIntent({ kind: 'framing', shot: null }, h)).ok).toBe(true)
    expect(h.did).toEqual(['framing:null'])
  })

  it('defaults a route to the player and never to the ship', async () => {
    // a member who leaves `who` out means "walk him along it". Defaulting to the
    // ship would put a body on the water for saying nothing
    const h = host()
    expect((await performIntent({ kind: 'route', path: 'the_dock_walk' }, h)).ok).toBe(true)
    expect(h.did).toEqual(['route:the_dock_walk:player:false'])
  })

  it('carries a refusal from the scene back with the reason on it', async () => {
    // the whole point of the kind check living in the scene: only the scene knows
    // what the map's paths are, and the author has to hear which one broke
    const h = host({
      route: async () => { throw new NotBuilt('route', '"the_dock_walk" crosses ground nobody can stand on') },
    })
    const r = await performIntent({ kind: 'route', path: 'the_dock_walk' }, h)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.why).toContain('crosses ground nobody can stand on')
  })

  it('caps wait_for too, because an anchor behind a locked door is a wait nothing ends', async () => {
    /* THE WORST BUG THIS WAVE SHIPPED AND CAUGHT. `fire()` holds the controls for
     * the length of a station handler and the ticker hands the walk law an EMPTY
     * input while it is held, so `wait_for` from an `@on_talk` waited for a player
     * who had been made unable to move. With no `ms` there was no deadline either:
     * the promise never settled, `fire`'s finally never ran, and every station,
     * every door and the controls were dead until a page reload. The scene half of
     * the fix hands the controls back; this half is that it cannot be endless. */
    let asked: number | undefined = -1
    const h = host({ waitFor: async (_a, ms) => { asked = ms; return true } })
    await performIntent({ kind: 'wait_for', anchor: 'chart_table' }, h)
    expect(asked, 'an unbounded wait_for reached the scene unbounded').toBe(undefined)
    expect(WAIT_FOR_CEILING_MS).toBeLessThanOrEqual(120_000)
    expect(WAIT_FOR_CEILING_MS).toBeGreaterThan(WAIT_CEILING_MS)
  })

  it('refuses a pose whose name is wrong WITHOUT having turned him first', async () => {
    // the word said no and did half of yes: the heading was applied before the
    // pose name was checked, so a typo left the body facing somewhere new
    const did: string[] = []
    const h = host({
      pose: async (p, f) => {
        if (f) did.push(`turned:${f}`)
        if (p === 'cartwheel') throw new NotBuilt('pose', `"${p}" is not a pose`)
      },
    })
    const r = await performIntent({ kind: 'pose', pose: 'cartwheel', facing: 'north' }, h)
    expect(r.ok).toBe(false)
    // the scene is what orders the two checks; this pins that the word is one
    // call and cannot be half-performed by the layer above it
    expect(did.length).toBeLessThanOrEqual(1)
  })

  it('plays a sound through the engine, with no map anywhere in sight', async () => {
    // sound and wait are the two director words that work in the standalone
    // harness, which is what lets a member time and score a scene with no map
    const e = stubEngine()
    const r = await performIntent({ kind: 'sound', name: 'cork_pop' }, { world: null, engine: e.engine })
    expect(r).toEqual({ ok: true })
    expect(e.did).toEqual(['sound:cork_pop'])
  })
})

describe('the control arm is not optional', () => {
  it('defaults as_plain to the arm the participant was assigned', async () => {
    const e = stubEngine()
    const plain: IntentEngine = { ...e.engine, mode: () => 'plain' }
    const spy = vi.fn(async () => 1)
    await performIntent({ kind: 'play', beat: 'core:y1' }, {
      world: null, engine: { ...plain, playBeat: spy },
    })
    expect(spy).toHaveBeenCalledWith('core:y1', true)
  })

  it('an island may force plain and may not force game', async () => {
    const spy = vi.fn(async () => 1)
    const e = { ...stubEngine().engine, playBeat: spy, mode: () => 'plain' as const }
    await performIntent({ kind: 'play', beat: 'b', as_plain: true }, { world: null, engine: e })
    expect(spy).toHaveBeenLastCalledWith('b', true)
    /* as_plain:false against a plain participant must NOT flip them into the game
     * arm: that would let one island opt the control group out of being one. */
    await performIntent({ kind: 'play', beat: 'b', as_plain: false }, { world: null, engine: e })
    expect(spy).toHaveBeenLastCalledWith('b', false)
    // the value a grape passed is honoured; what it cannot do is change engine.mode()
    expect(e.mode()).toBe('plain')
  })
})

describe('the driver hands a refusal back to the line that asked', () => {
  it('raises at the member own yield, so a wrong anchor is a traceback and not silence', async () => {
    const h = host()
    const seen: string[] = []
    function* body(): Generator<Intent, void, unknown> {
      try {
        yield { kind: 'walk_to', anchor: 'chart_tabel' }
        seen.push('kept going')
      } catch (e) {
        seen.push(`caught: ${(e as Error).message}`)
      }
      yield { kind: 'say', text: 'and the body carried on' }
    }
    const report = await runStation(body(), h, 'a station')
    expect(seen[0]).toContain('walk_to: no anchor named "chart_tabel"')
    expect(seen[0]).not.toContain('kept going')
    expect(report.refused).toEqual([{ intent: 'walk_to', why: 'no anchor named "chart_tabel" on test-map' }])
    expect(report.error).toBeUndefined()
    expect(h.did).toEqual(['say:-:and the body carried on'])
  })

  it('a value comes back through the yield, which is the whole protocol', async () => {
    const h = host()
    let picked: unknown = null
    function* body(): Generator<Intent, void, unknown> {
      picked = yield { kind: 'choose', options: ['a', 'b'] }
    }
    await runStation(body(), h, 'a station')
    expect(picked).toBe(1)
  })

  it('a body that yields something that is not an intent hears about it', async () => {
    const h = host()
    const seen: string[] = []
    function* body(): Generator<unknown, void, unknown> {
      try { yield 'walk to the table' } catch (e) { seen.push((e as Error).message) }
    }
    await runStation(body() as Generator<Intent, void, unknown>, h, 'a station')
    expect(seen[0]).toContain('which is not an intent')
  })

  /* ---- open(wait): the word BRIEF-MAW-RAIL's five beats could not be written
   * without. Without it `open` comes back the instant the screen is up, so the
   * beat after a panel runs underneath it. */
  it('open says whether it is waiting, and a waiting one holds the body up', async () => {
    const h = host()
    let opened: string | null = null
    const engine = h.engine as unknown as { openUi: (u: string, w?: boolean) => Promise<void> | void }
    let release: (() => void) | null = null
    engine.openUi = (u, w) => {
      opened = `${u}${w ? ':wait' : ''}`
      return w ? new Promise<void>((r) => { release = r }) : undefined
    }
    const after: string[] = []
    function* body(): Generator<Intent, void, unknown> {
      yield { kind: 'open', ui: 'planner', wait: true }
      after.push('the beat after the panel')
    }
    const ran = runStation(body(), h, 'the rail')
    await Promise.resolve()
    expect(opened).toBe('planner:wait')
    expect(after).toEqual([])          // still parked on the cards
    release!()
    await ran
    expect(after).toEqual(['the beat after the panel'])
  })

  it('open without wait is the same fire and forget call it always was', async () => {
    const h = host()
    await performIntent({ kind: 'open', ui: 'wardrobe' }, h)
    expect(h.edid).toEqual(['openUi:wardrobe'])
  })

  it('a body that never stops is stopped, rather than the browser tab', async () => {
    const h = host()
    function* forever(): Generator<Intent, void, unknown> {
      for (;;) yield { kind: 'log', event: 'again' }
    }
    const report = await runStation(forever(), h, 'runaway')
    expect(report.error).toContain('without finishing')
    expect(report.steps).toBeGreaterThan(9_000)
  })
})
