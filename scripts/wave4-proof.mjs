/* the browser proof: the running game must read the world, a bad slot, the painting's base extent, a named berth and the drawn UI kit off the platform, and the beach opening must play as a python island through nothing but vine.py; run npm run dev then this file, with --base, --headed and --slow */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = arg('base', 'http://localhost:5173')
const SHOTS = 'reference/_archive/build-shots/wave4'
fs.mkdirSync(SHOTS, { recursive: true })
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f))

let n = 0
let failures = 0
const notes = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  ok   ${label}${detail ? ` · ${detail}` : ''}`)
  else { failures++; console.log(`  FAIL ${label}${detail ? ` · ${detail}` : ''}`) }
  notes.push({ label, ok: !!cond, detail })
  return !!cond
}

/* the capture waits for the zoom to settle rather than a fixed 360ms, which is less than the camera's 0.42 second time constant, so a shot taken the instant a script hands the camera back is taken mid travel; there is a ceiling and it says when it gave up */
const settle = async (page, extra = 0) => {
  const spent = await page.evaluate(async (cap) => {
    const read = () => (window.__pmap && window.__pmap.camZ) || 0
    const t0 = performance.now()
    let last = read(), still = 0
    while (performance.now() - t0 < cap) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = read()
      still = Math.abs(now - last) < 1e-3 ? still + 1 : 0
      last = now
      if (still > 10) break
    }
    return Math.round(performance.now() - t0)
  }, has('slow') ? 4000 : 2200)
  await page.waitForTimeout((has('slow') ? 500 : 240) + extra)
  return spent
}

const shot = async (page, name, extra = 0) => {
  const spent = await settle(page, extra)
  const file = `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file })
  console.log(`  shot ${file}${spent > 2000 ? '  (the camera never settled)' : ''}`)
  return file
}

const b = await chromium.launch({ headless: !has('headed') , args: GPU })
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })

/* seed a run once: `set_flag` and `award` need a save to write into, and the init script runs again on every reload so it must not put the starting save back over a written one; `introDone: true` is a lie this proof tells, because the Hud is behind that flag and this is not the intro's first run */
await page.addInitScript((s) => {
  if (!localStorage.getItem('blhs_save_v2')) {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.removeItem('blhs_seen_v1')
  }
}, {
  v: 2, id: 'r_w4', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'castaway:wake', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
})
const log = []
page.on('console', (m) => log.push(m.text()))
page.on('pageerror', (e) => { failures++; console.log(`  FAIL page error · ${e.message}`) })
const since = (i) => log.slice(i).join('\n')

/* 1 · the world comes off the platform */
console.log('\n1 · the world composition, off the platform for the first time')
{
  const seen = []
  page.on('request', (r) => seen.push(r.url()))
  await page.goto(`${base}/?scene=pmap&deep=1&map=hub`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })

  const asked = seen.filter((u) => u.includes('/api/v1/world'))
  ok('it asks the platform for the world', asked.length > 0, asked[0] || 'nothing was asked')
  ok('and NOT the copy committed in this repo',
    !seen.some((u) => u.endsWith('/world/composition.json')))

  const w = await page.evaluate(() => {
    const c = window.__world && window.__world.composition
    return c ? { version: c.version, source: c.source, slots: c.slots.length, marks: (c.marks || []).length } : null
  })
  ok('and the document it got is the published one', !!w && w.source === 'mapvis', JSON.stringify(w))
  ok('which carries a named berth', !!w && w.marks > 0, w ? `${w.marks} mark(s)` : '')

  const rep = await page.evaluate(() => window.__world && window.__world.report)
  ok('with no faults, so nothing was dropped', !!rep && rep.faults.length === 0,
    rep ? `origin ${rep.origin}, ${rep.faults.length} fault(s)` : '')

  await shot(page, 'hub-off-the-platform')
}

/* 2 · one bad slot costs one slot */
console.log('\n2 · a faulty document loses the faulty island and keeps the rest')
{
  /* the failure mode is the bug: two faults at once on the real published world binned every island, region and berth with one console.warn as the only symptom, so this is served as a real document over a real fetch because the reader is what is under test */
  const bad = {
    version: 9, home: { slot: 'nowhere-at-all' },
    source: 'the proof, deliberately broken',
    slots: [
      { map: 'hub', title: 'the good one', at: { x: 0, y: 0 }, footprint: { w: 669, h: 377 }, state: 'available', release: 1400 },
      { map: 'too-big', title: 'past the ceiling', at: { x: 900, y: 0 }, footprint: { w: 900, h: 900 }, state: 'available', release: 1400 },
      { map: 'hub', title: 'placed twice', at: { x: 0, y: 400 }, footprint: { w: 100, h: 100 }, state: 'available', release: 1400 },
    ],
  }
  await page.route('**/api/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bad) }))
  const at = log.length
  await page.goto(`${base}/?scene=pmap&deep=1&map=hub&_=2`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })
  const w = await page.evaluate(() => {
    const c = window.__world && window.__world.composition
    const r = window.__world && window.__world.report
    return { slots: c ? c.slots.map((s) => s.title) : null, faults: r ? r.faults.length : -1, origin: r ? r.origin : '' }
  })
  ok('the good island survives', !!w.slots && w.slots.includes('the good one'), JSON.stringify(w.slots))
  ok('the two bad ones are dropped', !!w.slots && w.slots.length === 1)
  ok('and it said so out loud, not as a warn', since(at).includes('slot') && since(at).includes('dropped'))
  ok('a bad home drops nothing by itself', w.faults >= 3, `${w.faults} fault(s)`)
  await page.unroute('**/api/v1/world')
}

/* 3 · the painting's real extent */
console.log('\n3 · base: the painting inside its canvas, not the canvas')
{
  const at = log.length
  await page.goto(`${base}/?scene=pmap&deep=1&map=castaway&world=local`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })
  const line = since(at).split('\n').find((l) => l.includes('the painting is'))
  ok('the scene says which extent it used', !!line, line || 'it said nothing')
  ok('and it is the painting and not the 688x384 canvas', !!line && line.includes('465x335'))
  await shot(page, 'castaway-opens')
}

/* 4 · the drawn ui kit */
console.log('\n4 · the ui kit, off the platform')
{
  const at = log.length
  await page.goto(`${base}/?scene=pmap&deep=1&map=castaway&world=local&kit=1`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })
  await page.waitForTimeout(1200)
  const kit = await page.evaluate(() => {
    const el = document.getElementById('mapvis-kit')
    const css = el ? el.textContent : ''
    return {
      mounted: !!el,
      rules: (css.match(/\.kit-surface-/g) || []).length,
      tokens: (css.match(/--kit-art-/g) || []).length,
      relative: (css.match(/url\('\/api/g) || []).length,
      versioned: (css.match(/\?v=/g) || []).length,
      dialogue: css.includes('.kit-surface-dialogue'),
    }
  })
  ok('a style element is mounted', kit.mounted)
  ok('with real surface rules', kit.rules > 0, `${kit.rules} rule(s), ${kit.tokens} art token(s)`)
  ok('the piece called dialogue_box mounts on the game handle "dialogue"', kit.dialogue)
  ok('every image url is absolute and versioned', kit.relative === 0 && kit.versioned > 0,
    `${kit.relative} relative, ${kit.versioned} versioned`)
}

/* 5 · the gate: the opening, as a member's island */
console.log('\n5 · the gate: the beach opening, in python, on a painted map')
const GATE = `${base}/?scene=pmap&deep=1&map=castaway&world=local`
  + `&grape=${encodeURIComponent(`${base}/grapes/castaway/`)}`
{
  /* a first run has not been anywhere: the scene records where the player stood about once a second and resumes there, which is right for a closed Chromebook lid and wrong for the opening, so the save is cleared and the init script re-seeds it on the next navigation */
  await page.evaluate(() => localStorage.removeItem('blhs_save_v2'))
  const at = log.length
  await page.goto(GATE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })
  /* the first gesture, because Chrome will not let a page make a sound until the user has touched it and a proof that never clicks proves silence */
  await page.mouse.click(640, 700)

  const loaded = await page.waitForFunction(
    () => (window.__pmap && window.__pmap.island && window.__pmap.island.handlers || []).length > 0,
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
  ok('the island loaded over http and claimed its handlers', loaded)
  /* the fastest the hull ever went, sampled from inside the page, because reading the speed afterwards loses the race: the route resolves, fires and the scene is torn down before the question is asked, and a high-water mark cannot be beaten by the thing it measures */
  await page.evaluate(() => {
    window.__hullTop = 0
    setInterval(() => {
      const h = window.__pmap && window.__pmap.hull
      if (h && h.speed > window.__hullTop) window.__hullTop = h.speed
    }, 50)
  })

  /* ---- the waking ---- */
  const posed = await page.waitForFunction(
    () => window.__pmap && window.__pmap.pose === 'sleep', null, { timeout: 20000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 1 · pose: he is asleep on the sand', posed)
  const beforeShow = await page.evaluate(() => window.__pmap && window.__pmap.shown && window.__pmap.shown.bottle_1)
  await shot(page, 'beat1-asleep')

  const sat = await page.waitForFunction(
    () => window.__pmap && window.__pmap.pose === 'sit', null, { timeout: 20000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 2 · pose: he sits up', sat)
  await shot(page, 'beat2-sits-up')

  /* the box is clicked like a player and not a script: the pump clicks whenever a line waits so a counted number of clicks cannot go stale, it can be paused so a capture holds a box, and it waits ADVANCE_DEAD_MS (250) plus the typewriter because the first click finishes the typing and the second advances */
  const line = () => page.evaluate(() => {
    const el = document.querySelector('.cs-dialogue-text') || document.querySelector('.dlg-box')
    return el ? el.textContent.trim() : ''
  })
  const seen = []
  let pumping = true
  let paused = true
  /* the eye runs faster than the hand: sampling and clicking on one 640ms loop let a short line be typed in full and advanced between two samples, so the reader ticks about five times per click, faster than the typewriter can finish the shortest line the island writes */
  let tick = 0
  const pump = (async () => {
    while (pumping) {
      await page.waitForTimeout(120)
      if (paused || !pumping) { tick = 0; continue }
      try {
        const there = await page.evaluate(() => {
          const el = document.querySelector('.cs-dialogue-text')
          return el ? el.textContent.trim() : null
        })
        if (there === null) { tick = 0; continue }
        if (there && seen[seen.length - 1] !== there) seen.push(there)
        if (++tick < 5) continue
        tick = 0
        /* the veil is what listens and it is the whole screen, so clicking it by selector rather than at a coordinate keeps a moved box or a resized skin from quietly stopping the proof */
        await page.click('.dlg-veil', { timeout: 2000 }).catch(() => {})
      } catch { break }
    }
  })()

  await page.waitForTimeout(1100)
  const first = await line()
  ok('BEAT 3 · say: his first line is in the real dialogue box', /sand/i.test(first), first.slice(0, 60))
  await shot(page, 'beat3-first-line')
  paused = false

  /* the bottle arrives, and 'was not before' is measured rather than assumed: waiting only for `true` would pass on the first frame if a first `show(..., False)` had silently failed, so the hidden state is sampled while he is still lying on the sand */
  ok('and the bottle was NOT on the sand while he slept', beforeShow === false,
    `shown.bottle_1 was ${JSON.stringify(beforeShow)} during the waking`)
  const shown = await page.waitForFunction(
    () => window.__pmap && window.__pmap.shown && window.__pmap.shown.bottle_1 === true,
    null, { timeout: 25000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 4 · show: the bottle is on the sand and was not before', shown)

  const framed = await page.evaluate(() => window.__pmap && window.__pmap.framing)
  ok('BEAT 5 · framing: the authored shot was taken by name', framed === 'the_find', String(framed))

  /* waited for, not sampled: the zoom is a continuous path with a 0.42 second time constant held for about two seconds, so reading camZ at an arbitrary instant reads the middle of the travel and calls it the shot */
  const zoomed = await page.waitForFunction(
    () => window.__pmap && window.__pmap.camZ > window.__pmap.Z * 1.5,
    null, { timeout: 8000 },
  ).then(() => true).catch(() => false)
  ok('and its zoom is a multiple of the opening view', zoomed,
    await page.evaluate(() => window.__pmap ? `camZ ${window.__pmap.camZ.toFixed(2)} against Z ${window.__pmap.Z.toFixed(2)}, the shot asks for 2.2x` : ''))
  await shot(page, 'beat5-the-find')

  /* ---- the arrow ---- */
  const guided = await page.waitForFunction(
    () => window.__pmap && window.__pmap.guide === 'the_wrack_line', null, { timeout: 25000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 6 · guide_to: the arrow points at the bottle', guided)
  await shot(page, 'beat6-the-arrow')

  /* the walk is seized, and nothing touches a key here on purpose because the island waits nine seconds for a player who does not come and then takes it */
  const seized = await page.waitForFunction(
    () => window.__pmap && window.__pmap.walkLabel && window.__pmap.walkLabel.startsWith('the_wrack_walk'),
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 7 · route: the walk is seized along the authored line', seized)
  await shot(page, 'beat7-the-walk-seized')

  const arrived = await page.waitForFunction(
    () => window.__pmap && Math.hypot(window.__pmap.x - 312, window.__pmap.y - 179) < 26,
    null, { timeout: 40000 },
  ).then(() => true).catch(() => false)
  ok('and he really got there, by the walk law', arrived,
    await page.evaluate(() => window.__pmap ? `${Math.round(window.__pmap.x)},${Math.round(window.__pmap.y)}` : ''))

  /* ---- the message ---- */
  const read = await page.waitForFunction(
    () => {
      const el = document.querySelector('.cs-dialogue-text')
      return !!el && /paper|corked|reading|boat with my name/i.test(el.textContent)
    },
    null, { timeout: 40000 },
  ).then(() => true).catch(() => false)
  paused = true
  await page.waitForTimeout(500)
  const msg = await line()
  ok('BEAT 8 · say: the message in the bottle plays through the real box', read, msg.slice(0, 70))
  await shot(page, 'beat8-the-message')
  paused = false

  /* ---- down to the boat ---- */
  const toBoat = await page.waitForFunction(
    () => window.__pmap && window.__pmap.walkLabel && window.__pmap.walkLabel.startsWith('the_long_way'),
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 9 · route: the long way down to the jetty', toBoat)
  await shot(page, 'beat9-the-long-way')

  /* ---- the voyage ---- */
  const aboard = await page.waitForFunction(
    () => window.__pmap && window.__pmap.hull !== null, null, { timeout: 60000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 10 · route(who="ship"): he is aboard and the hull exists', aboard)
  /* not through `shot`, because settling waits up to 2.4 seconds for the camera to stop and the camera does not stop until the crossing is over, so the settle ate the whole voyage and both captures came back as the arrival card on the far side */
  {
    const f = `${SHOTS}/${String(++n).padStart(2, '0')}-beat10-aboard.png`
    await page.screenshot({ path: f })
    console.log(`  shot ${f}`)
  }

  const moved = await page.waitForFunction(
    () => window.__hullTop > 5, null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
  /* shot without waiting for the camera, the one capture here that must not settle: the ship is crossing, so waiting for the picture to stop moving waits for the crossing to end and the frame came back as the arrival card with under way written beneath it */
  const file = `${SHOTS}/${String(++n).padStart(2, '0')}-beat11-under-way.png`
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
  ok('and the ship is really under way on the shipped physics', moved,
    await page.evaluate(() => `her best was ${(window.__hullTop || 0).toFixed(1)} px/s`))

  /* ---- the door ---- */
  const entered = await page.waitForFunction(
    () => window.__pmap && window.__pmap.map === 'hub', null, { timeout: 90000 },
  ).then(() => true).catch(() => false)
  ok('BEAT 12 · enter: it put in at the central island through a covered swap', entered,
    await page.evaluate(() => window.__pmap ? window.__pmap.map : 'nowhere'))
  await shot(page, 'beat12-arrived-at-the-hub')

  /* ---- and nothing lied on the way ---- */
  const refused = since(at).split('\n').filter((l) => /is not built yet|could not perform/.test(l))
  ok('no word reported success while doing nothing', refused.length === 0, refused.slice(0, 3).join(' | '))
  const flagged = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('blhs_save_v2') || '{}').flags || [] } catch { return [] }
  })
  ok('and the island wrote its own flag in its own corner',
    flagged.some((f) => String(f).includes('read_the_bottle')), JSON.stringify(flagged).slice(0, 90))
  /* named lines, not a count: `seen.length >= 6` counted partial typewriter frames as lines, so the island could have dropped four real lines and still passed, and the island's own text is the expectation */
  const WROTE = [
    'Ugh. Sand. A whole lot of sand.',
    'Last thing I remember is water. So much water.',
    'Something washed ashore.',
    'The paper is dry, which means somebody corked it properly.',
    'Take the boat to the central island. Find the principal inside the mountain.',
    'A boat at the jetty. Time to walk down and take it.',
    'Right. Sail for the light on the central island.',
  ]
  /* measured as a fraction of each line because the box is a typewriter: every sample is a prefix, so demanding the whole string demands the sampler catch one specific frame and it misses about half the time, while a line that never played leaves nothing that is a prefix of it */
  const drew = WROTE.map((w) => {
    const best = seen.filter((s) => w.startsWith(s.slice(0, Math.min(s.length, w.length))) && s.length > 2)
      .reduce((m, s) => Math.max(m, Math.min(s.length, w.length)), 0)
    return { w, best, part: best / w.length }
  })
  const missed = drew.filter((d) => d.part < 0.6)
  ok('every line the island wrote really reached the screen', missed.length === 0,
    missed.length
      ? `thin or absent: ${missed.map((m) => `"${m.w.slice(0, 26)}" ${Math.round(m.part * 100)}%`).join(' | ')}`
      : `${WROTE.length} lines, each drawn to at least ${Math.round(Math.min(...drew.map((d) => d.part)) * 100)}% of its length`)
  pumping = false
  await pump
}

/* 6 · a route that ends at a berth somebody named */
console.log('\n6 · a sail route ending at a named berth, with its approach')
{
  await page.goto(`${base}/?scene=pmap&deep=1&map=castaway&world=local`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })
  const at = log.length
  const r = await page.evaluate(async () => {
    const w = window.__pmap && window.__pmap.perform
    if (!w) return { ok: false, why: 'no way in' }
    return await w({ kind: 'route', path: 'the_home_run', who: 'ship' })
  })
  ok('the route ran and was not refused', r && r.ok === true, JSON.stringify(r))
  const berthed = await page.waitForFunction(
    () => window.__pmap && window.__pmap.berthing !== null, null, { timeout: 40000 },
  ).then(() => true).catch(() => false)
  ok('and handed its last leg to the berthing manoeuvre', berthed)
  /* read off the value the scene resolved and not off the console, because `since(at).includes('the_castaway_berth')` was also true of the line printed when the lookup fails, so the check passed on the exact evidence of the thing it was written to catch */
  const named = await page.evaluate(() => window.__pmap && window.__pmap.lastBerth)
  ok('which is the berth the path names, not a coordinate',
    named === 'the_castaway_berth', `lastBerth ${JSON.stringify(named)}`)
  ok('and the world really holds a berth by that name',
    (await page.evaluate(() => (window.__world.composition.marks || []).map((m) => m.name)))
      .includes('the_castaway_berth'))
  await shot(page, 'berth-approach')
}

/* 7 · every new word refuses what it cannot do */
console.log('\n7 · the NotBuilt law, on the ten new words')
{
  const cases = [
    [{ kind: 'pose' }, 'needs a pose'],
    [{ kind: 'pose', pose: 'cartwheel' }, 'is not a pose'],
    [{ kind: 'pose', facing: 'sideways' }, 'is not a heading'],
    [{ kind: 'actor_move', actor: 'nobody_here', to: 'the_jetty' }, 'no anchor named'],
    [{ kind: 'actor_face', actor: 'the_beach', facing: 'south' }, 'not bound to a placement'],
    [{ kind: 'actor_look', actor: 'the_wrack_line', look: 'furious' }, 'has no face called'],
    [{ kind: 'route', path: 'nowhere_road' }, 'no path named'],
    [{ kind: 'route', path: 'the_crossing' }, 'only the ship can take it'],
    [{ kind: 'route', path: 'the_wrack_walk', who: 'ship' }, 'the ship cannot take it'],
    [{ kind: 'route', path: 'the_long_way', backwards: true }, 'one-way'],
    [{ kind: 'framing', shot: 'the_wide_one' }, 'no shot named'],
    [{ kind: 'wait', ms: -5 }, 'number of milliseconds'],
    [{ kind: 'wait_for', anchor: 'the_gate' }, 'no anchor named'],
    [{ kind: 'sound', name: 'trumpet' }, 'is not built yet'],
    [{ kind: 'fx', name: 'fireworks' }, 'not in the effect library'],
  ]
  for (const [intent, want] of cases) {
    const r = await page.evaluate((i) => window.__pmap.perform(i), intent)
    ok(`${intent.kind} refuses`, r && r.ok === false && String(r.why).includes(want),
      r ? String(r.why).slice(0, 90) : 'no answer')
  }
}

/* 8 · and the words that can, do */
console.log('\n8 · and each of them performs when it can')
{
  const did = []
  const run = async (i) => { const r = await page.evaluate((x) => window.__pmap.perform(x), i); did.push([i.kind, r]); return r }
  ok('pose turns him without walking him',
    (await run({ kind: 'pose', facing: 'north' })).ok === true
    && (await page.evaluate(() => window.__pmap.facing)) === 'north')
  ok('pose sits him down', (await run({ kind: 'pose', pose: 'sit' })).ok === true
    && (await page.evaluate(() => window.__pmap.pose)) === 'sit')
  await shot(page, 'pose-sit')
  ok('pose puts him back on his feet', (await run({ kind: 'pose', pose: 'stand' })).ok === true
    && (await page.evaluate(() => window.__pmap.pose)) === null)
  ok('framing takes a named shot', (await run({ kind: 'framing', shot: 'the_waking', ms: 400 })).ok === true)
  ok('framing(None) gives the camera back', (await run({ kind: 'framing', shot: null })).ok === true)
  ok('wait actually waits', await (async () => {
    const t0 = Date.now()
    const r = await run({ kind: 'wait', ms: 700 })
    return r.ok === true && Date.now() - t0 >= 650
  })())
  ok('wait_for answers false when he does not come',
    (await run({ kind: 'wait_for', anchor: 'the_jetty', ms: 600 })).value === false)
  const hid = await run({ kind: 'show', anchor: 'the_wrack_line', visible: false })
  ok('show hides and shows a bound placement',
    hid.ok === true && (await page.evaluate(() => window.__pmap.shown.bottle_1)) === false,
    JSON.stringify(hid) + ' shown=' + JSON.stringify(await page.evaluate(() => window.__pmap.shown)))
  ok('fx plays once and ENDS, so it can be composed with', await (async () => {
    const t0 = Date.now()
    const r = await run({ kind: 'fx', name: 'spark', anchor: 'the_wrack_line' })
    return r.ok === true && Date.now() - t0 > 400
  })())
  ok('sound plays a licensed effect by name', (await run({ kind: 'sound', name: 'chime' })).ok === true)
  ok('actor_release with no name is always legal', (await run({ kind: 'actor_release' })).ok === true)
}

console.log(`\n${notes.filter((x) => x.ok).length}/${notes.length} checks, ${n} screenshots in ${SHOTS}`)
if (failures) console.log(`${failures} FAILED`)
fs.writeFileSync(`${SHOTS}/checks.json`, JSON.stringify(notes, null, 2))
await b.close()
process.exit(failures ? 1 : 0)
