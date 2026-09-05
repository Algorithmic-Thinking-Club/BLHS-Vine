/* THE ENGINE-Y1 GATE: the eight words year one needs, watched in a real browser.
 *
 * Every one of these was a thing the game could not do on 2026-09-04, and seven
 * of the eight live inside PmapScene, which has no unit test and cannot have one:
 * it is five and a half thousand lines of Pixi behind an async boot. So the proof
 * is a running browser and the game's own debug surface, which is the same shape
 * wave1, wave2 and wave4 take.
 *
 * WHAT IS PROVED HERE AND WHAT IS NOT. This says the machinery performs. It does
 * NOT say the game is good, and nothing in this file may ever be quoted as though
 * it did: Ash playing it is the only gate, and he has not.
 *
 * Run: npm run dev, then `node scripts/y1-proof.mjs`.
 *   --base=http://localhost:5173   where the game is
 *   --headed                       watch it
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = arg('base', 'http://localhost:5173')
const SHOTS = 'reference/_archive/build-shots/y1'
fs.mkdirSync(SHOTS, { recursive: true })
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f))

let n = 0
let failures = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  ok   ${label}${detail ? ` · ${detail}` : ''}`)
  else { failures++; console.log(`  FAIL ${label}${detail ? ` · ${detail}` : ''}`) }
  return !!cond
}

const settle = async (page, extra = 0) => {
  /* a settle that races a navigation throws 'execution context was destroyed',
   * which fails a gate for a reason that has nothing to do with the game */
  try {
    await page.evaluate(async () => {
    const read = () => (window.__pmap && window.__pmap.camZ) || 0
    const t0 = performance.now()
    let last = read(), still = 0
    while (performance.now() - t0 < 2200) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = read()
      still = Math.abs(now - last) < 1e-3 ? still + 1 : 0
      last = now
      if (still > 10) break
      }
    })
  } catch { /* the page moved under us; the wait below is enough */ }
  await page.waitForTimeout(240 + extra)
}

const shot = async (page, name, extra = 0) => {
  await settle(page, extra)
  const file = `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}

const ready = async (page) => {
  await page.waitForFunction(() => window.__sceneReady === true, { timeout: 25000 })
  await settle(page)
}

const b = await chromium.launch({ headless: !has('headed') })
const page = await b.newPage({ viewport: { width: 1366, height: 768 } })

/* A RUN, SEEDED ONCE, with the founding flag NOT set so the objective is the
 * real first one a freshman meets. Same guard as wave 4: an init script runs on
 * every reload and must not put the starting save back over a written one. */
await page.addInitScript((s) => {
  if (!localStorage.getItem('blhs_save_v2')) {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.removeItem('blhs_seen_v1')
  }
}, {
  v: 2, id: 'r_y1', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
})
const log = []
page.on('console', (m) => log.push(m.text()))
page.on('pageerror', (e) => { failures++; console.log(`  FAIL page error · ${e.message}`) })

/* ============================================================================
 * 1 · THE CANVAS TAKES A POINTER
 * ==========================================================================*/
console.log('\n1 · click to walk')
await page.goto(`${base}/?scene=pmap&map=hub`, { waitUntil: 'domcontentloaded' })
await ready(page)

const stageMode = await page.evaluate(() => {
  const a = window.__app
  return a ? { mode: a.stage.eventMode, hit: !!a.stage.hitArea } : null
})
ok('the stage is a hit target at all', stageMode?.mode === 'static' && stageMode.hit,
  JSON.stringify(stageMode))

const before = await page.evaluate(() => ({ x: window.__pmap.x, y: window.__pmap.y }))
/* a click through the game's own router, in painting pixels, so the gate tests
 * the routing and not Playwright's ability to synthesise a Pixi event */
const walked = await page.evaluate(() => {
  const p = window.__pmap
  /* THE NEAREST GROUND THE WALK LAW ACTUALLY APPROVES, found by asking rather
   * than by assuming. The hub's quay is narrow: a fixed grid at forty pixels
   * missed every standable pixel around the spawn and the gate reported the
   * feature broken when the probe was what was wrong. */
  for (let r = 12; r <= 90; r += 6) {
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2
      const x = Math.round(p.x + Math.cos(th) * r), y = Math.round(p.y + Math.sin(th) * r)
      if (JSON.parse(window.__probe(x, y)).stand) return window.__click(x, y)
    }
  }
  return 'no standable pixel found'
})
ok('a click on the floor is accepted', walked === 'walking', String(walked))
await page.waitForTimeout(1400)
const after = await page.evaluate(() => ({ x: window.__pmap.x, y: window.__pmap.y }))
ok('and he actually moved', Math.hypot(after.x - before.x, after.y - before.y) > 6,
  `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
await shot(page, 'clicked-to-walk')

/* ============================================================================
 * 2 · THE ONE THING THAT IS LIT
 * ==========================================================================*/
console.log('\n2 · the lit objective')
const leading = await page.evaluate(() => window.__pmap.guide)
ok('the game is pointing at something', !!leading, String(leading))

/* the objective on the hub with no founding flag is inside the mountain, so what
 * the hub lights is the door that leads there */
const litAnchor = await page.evaluate((name) => {
  const a = (window.__pmap.anchors || []).find((q) => q.name === name)
  return a ? { name: a.name, kind: a.kind, x: a.x, y: a.y } : null
}, leading)
ok('and it resolves to a real anchor on this map', !!litAnchor, JSON.stringify(litAnchor))
await shot(page, 'the-lit-thing')

/* ============================================================================
 * 3 · CLICKING THE LIT THING DOES IT
 * ==========================================================================*/
console.log('\n3 · clicking the lit thing')
/* the door preflight is a fetch per target fired at load. A student walking to
 * it takes seconds; a gate clicking it takes none, so it waits for the answer
 * the way a person's feet would. */
await page.waitForTimeout(600)
const fired = await page.evaluate((name) => {
  const a = (window.__pmap.anchors || []).find((q) => q.name === name)
  if (!a) return 'no such anchor exposed'
  return window.__click(a.x, a.y)
}, leading)
ok('a click on the lit thing is taken as a press, not as a walk', fired === 'fired', String(fired))

/* AND CHANGING YOUR MIND DOES NOT PRESS IT. The action a click means used to be
 * the same callback that settles the walk, and every cancellation settles the
 * walk, so pressing a key two paces in ran the thing you had just walked away
 * from. On this door that meant the map swapped from across the room. */
const changedMind = await page.evaluate(async (name) => {
  const a = (window.__pmap.anchors || []).find((q) => q.name === name)
  const started = window.__click(a.x, a.y)
  await new Promise((r) => setTimeout(r, 250))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
  await new Promise((r) => setTimeout(r, 500))
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }))
  await new Promise((r) => setTimeout(r, 400))
  return { started, walking: window.__pmap.walkLabel, map: window.__pmap.map }
}, leading)
ok('a key press countermands the walk instead of taking the door',
  changedMind.map === 'hub' && !changedMind.walking, JSON.stringify(changedMind))

/* ============================================================================
 * 4 · THE CROSSING ENDS ON ITS OWN
 * ==========================================================================*/
console.log('\n4 · the crossing')
/* A FRESH SITTING, because the card is once per map per SESSION and section 1
 * already arrived on the hub on foot and spent it. Without this the gate reads
 * the rule working correctly as the card being broken, which is exactly the
 * shape of proof failure this repo has shipped before. */
await page.evaluate(() => sessionStorage.removeItem('blhs_seen_v1'))
await page.goto(`${base}/?scene=pmap&map=hub&aboard=1`, { waitUntil: 'domcontentloaded' })
await ready(page)

const afloat = await page.evaluate(() => ({
  aboard: !!window.__pmap.hull,
  card: !!document.querySelector('.pc-card'),
}))
ok('he arrives on the water', afloat.aboard, JSON.stringify(afloat))
ok('and the card naming the island has NOT been spent yet', !afloat.card,
  'it is owed until he is standing on it')
await shot(page, 'offshore')

/* WATCHED FOR RATHER THAN LOOKED FOR ONCE. The card holds for 3.2 seconds and
 * the crossing takes several, so a single read after the crossing is a read
 * taken after the card has already gone, and it would pass or fail on timing
 * rather than on behaviour. This starts watching BEFORE the ship moves. */
await page.evaluate(() => {
  window.__cardSeen = false
  const tick = setInterval(() => {
    if (document.querySelector('.pc-card')) { window.__cardSeen = true; clearInterval(tick) }
  }, 100)
  setTimeout(() => clearInterval(tick), 20000)
})

/* the ship takes herself in. `__dock` is the existing hook: it is what the
 * player's own `E · tie up here` calls, and the point of the item is that the
 * crossing ends without him pressing it. So the gate drives the same manoeuvre
 * and watches it finish by itself. */
const docking = await page.evaluate(() => window.__dock())
ok('she is put on the approach', docking === 'docking', String(docking))
await page.waitForTimeout(9000)
const ashore = await page.evaluate(() => ({
  aboard: !!window.__pmap.hull,
  berthing: window.__pmap.berthing,
  voyage: window.__pmap.voyage,
}))
ok('and she finishes it herself: he is ashore with nothing pressed', !ashore.aboard,
  JSON.stringify(ashore))
await shot(page, 'stepped-ashore')

/* ============================================================================
 * 5 · THE ARRIVAL CARD IS PAID WHERE HE LANDS
 * ==========================================================================*/
console.log('\n5 · the arrival card')
const cardSeen = await page.evaluate(() => window.__cardSeen === true)
ok('and the card naming the island is paid at the landing', cardSeen,
  cardSeen ? 'it appeared once he was ashore' : 'it never appeared at all')

/* ============================================================================
 * 6 · THE CHART CAN SEND HER
 * ==========================================================================*/
console.log('\n6 · click to sail')
/* THE WHOLE PATH, THROUGH THE REAL BUS. Asking only whether the scene was
 * listening is what let the first version of this ship dead: the guard refused
 * every click, because the open Handbook is itself a world hold, and a check on
 * the listener count passed happily while the feature could not fire once. */
await page.evaluate(() => sessionStorage.removeItem('blhs_seen_v1'))
await page.goto(`${base}/?scene=pmap&map=hub`, { waitUntil: 'domcontentloaded' })
await ready(page)

const chart = await page.evaluate(async () => {
  const bus = await import('/src/game/world/sail-bus.ts')
  const comp = await import('/src/game/world/composition.ts')
  const world = await comp.loadComposition()
  const here = window.__pmap.map
  const slots = comp.seaSlots(world)
  const away = slots.find((s) => s.berth && s.map && s.map !== here)
  const home = slots.find((s) => s.map === here)
  return {
    listening: bus.sailListenerCount(),
    from: bus.sailFrom(),
    away: away ? { title: away.title, answer: await bus.requestSail(away) } : null,
    /* THE ISLAND HE IS ON, which must be refused BY THE SCENE and not by the
     * no-listener fallback. The sentence is how the two are told apart, and it
     * is the assertion that would have caught the dead guard: a scene that
     * refuses everything and a scene nobody is listening to look identical from
     * the panel unless the refusal is read. */
    home: home ? await bus.requestSail(home) : null,
  }
})
ok('the scene is listening, and it knows which island he is on',
  chart.listening > 0 && chart.from === 'hub', JSON.stringify({ n: chart.listening, from: chart.from }))
ok('a click is answered BY THE SCENE, not by the nobody-heard-it fallback',
  !!chart.home && chart.home.ok === false && /already there/i.test(chart.home.why),
  JSON.stringify(chart.home))
if (chart.away) {
  ok('and a click on somewhere else puts her to sea',
    chart.away.answer && chart.away.answer.ok === true, JSON.stringify(chart.away))
} else {
  console.log('  note the published world holds one island, so there is nowhere else to sail to yet')
}

/* AND THE BUTTON IS NOT DRAWN WHERE THERE IS NO SEA. The Maw is a windowless
 * room and it is where the chart table stands, so it is where a student opens
 * the chart. A control that is always there and usually refuses teaches them
 * that the chart does not work. */
await page.goto(`${base}/?scene=pmap&map=panther-maw`, { waitUntil: 'domcontentloaded' })
await ready(page)
const indoors = await page.evaluate(async () => {
  const bus = await import('/src/game/world/sail-bus.ts')
  return { n: bus.sailListenerCount(), from: bus.sailFrom(), map: window.__pmap.map }
})
ok('and inside a room the chart offers nothing at all',
  indoors.map === 'panther-maw' && indoors.n === 0, JSON.stringify(indoors))

/* ============================================================================
 * 7 · A GRANT ANSWERS
 * ==========================================================================*/
console.log('\n7 · every grant answers')
const answered = await page.evaluate(async () => {
  const r = await window.__pmap.perform({ kind: 'award', fact: 'proof_fact' })
  await new Promise((z) => setTimeout(z, 120))
  const card = document.querySelector('#kit-feedback')
  return { ok: r && r.ok, said: card ? card.textContent : null }
})
ok('award() writes AND speaks', !!answered.ok && !!answered.said, JSON.stringify(answered))
await shot(page, 'a-grant-answers')

/* ============================================================================
 * 8 · guide_to(None)
 * ==========================================================================*/
console.log('\n8 · the arrow comes down')
const arrow = await page.evaluate(async () => {
  const p = window.__pmap
  const a = (p.anchors || [])[0]
  const up = a ? await p.perform({ kind: 'guide_to', anchor: a.name }) : null
  const asked = p.guideAsked
  const down = await p.perform({ kind: 'guide_to', anchor: null })
  return { up: up && up.ok, asked, down: down && down.ok, after: p.guideAsked }
})
ok('guide_to(null) is accepted', arrow.down === true, JSON.stringify(arrow))
ok('and the arrow the island raised is actually down', arrow.after === null, JSON.stringify(arrow))

console.log(`\n${failures ? `${failures} FAILED` : 'all pass'} · ${n} shots in ${SHOTS}`)
await b.close()
process.exit(failures ? 1 : 0)
