/* the year one gate: eight words watched in a real browser, because seven live in PmapScene, five and a half thousand lines of Pixi behind an async boot that no unit test can reach; it proves the machinery performs, never that the game is good. run npm run dev, then node scripts/y1-proof.mjs */
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
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
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
  /* a settle that races a navigation throws 'execution context was destroyed', which fails a gate for a reason that has nothing to do with the game */
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

const b = await chromium.launch({ headless: !has('headed') , args: GPU })
const page = await b.newPage({ viewport: { width: 1366, height: 768 } })

/* seed the run once with the founding flag unset so the objective is the real first one a freshman meets, and the init script must never put the starting save back over a written one */
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

/* 1 · the canvas takes a pointer */
console.log('\n1 · click to walk')
await page.goto(`${base}/?scene=pmap&deep=1&map=hub`, { waitUntil: 'domcontentloaded' })
await ready(page)

const stageMode = await page.evaluate(() => {
  const a = window.__app
  return a ? { mode: a.stage.eventMode, hit: !!a.stage.hitArea } : null
})
ok('the stage is a hit target at all', stageMode?.mode === 'static' && stageMode.hit,
  JSON.stringify(stageMode))

const before = await page.evaluate(() => ({ x: window.__pmap.x, y: window.__pmap.y }))
/* a click through the game's own router, in painting pixels, so the gate tests the routing and not Playwright's ability to synthesise a Pixi event */
const walked = await page.evaluate(() => {
  const p = window.__pmap
  /* the nearest ground the walk law approves, asked for rather than assumed: the hub's quay is narrow, and a fixed forty pixel grid missed every standable pixel near the spawn and reported the feature broken when the probe was what was wrong */
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

/* 2 · the one thing that is lit */
console.log('\n2 · the lit objective')
const leading = await page.evaluate(() => window.__pmap.guide)
ok('the game is pointing at something', !!leading, String(leading))

/* the objective on the hub with no founding flag is inside the mountain, so what the hub lights is the door that leads there */
const litAnchor = await page.evaluate((name) => {
  const a = (window.__pmap.anchors || []).find((q) => q.name === name)
  return a ? { name: a.name, kind: a.kind, x: a.x, y: a.y } : null
}, leading)
ok('and it resolves to a real anchor on this map', !!litAnchor, JSON.stringify(litAnchor))
await shot(page, 'the-lit-thing')

/* 3 · clicking the lit thing does it */
console.log('\n3 · clicking the lit thing')
/* the door preflight is a fetch per target fired at load, and a gate clicking it spends no walking time, so it waits for the answer the way a player's feet would */
await page.waitForTimeout(600)
const fired = await page.evaluate((name) => {
  const a = (window.__pmap.anchors || []).find((q) => q.name === name)
  if (!a) return 'no such anchor exposed'
  return window.__click(a.x, a.y)
}, leading)
ok('a click on the lit thing is taken as a press, not as a walk', fired === 'fired', String(fired))

/* changing your mind must not press it: the action a click means used to be the same callback that settles the walk, and every cancellation settles the walk, so a key pressed two paces in swapped the map from across the room */
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

/* 4 · the crossing ends on its own */
console.log('\n4 · the crossing')
/* a fresh sitting, because the card is once per map per session and section 1 already spent it arriving on the hub on foot, so without this the gate reads the rule working correctly as the card being broken */
await page.evaluate(() => sessionStorage.removeItem('blhs_seen_v1'))
await page.goto(`${base}/?scene=pmap&deep=1&map=hub&aboard=1`, { waitUntil: 'domcontentloaded' })
await ready(page)

const afloat = await page.evaluate(() => ({
  aboard: !!window.__pmap.hull,
  card: !!document.querySelector('.pc-card'),
}))
ok('he arrives on the water', afloat.aboard, JSON.stringify(afloat))
ok('and the card naming the island has NOT been spent yet', !afloat.card,
  'it is owed until he is standing on it')
await shot(page, 'offshore')

/* watched for rather than read once: the card holds for 3.2 seconds and the crossing takes several, so a single read after the crossing lands after the card has gone and would pass or fail on timing; start watching before the ship moves */
await page.evaluate(() => {
  window.__cardSeen = false
  const tick = setInterval(() => {
    if (document.querySelector('.pc-card')) { window.__cardSeen = true; clearInterval(tick) }
  }, 100)
  setTimeout(() => clearInterval(tick), 20000)
})

/* `__dock` is the same hook the player's own `E · tie up here` calls, so the gate drives that manoeuvre and watches the crossing finish with no further press */
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

/* 5 · the arrival card is paid at the landing */
console.log('\n5 · the arrival card')
const cardSeen = await page.evaluate(() => window.__cardSeen === true)
ok('and the card naming the island is paid at the landing', cardSeen,
  cardSeen ? 'it appeared once he was ashore' : 'it never appeared at all')

/* 6 · the chart can send the ship */
console.log('\n6 · click to sail')
/* the whole path, through the real bus: asking only whether the scene was listening let the first version of this ship dead, because the guard refused every click while the Handbook was open, since the open Handbook is itself a world hold, and a listener count passed anyway */
await page.evaluate(() => sessionStorage.removeItem('blhs_seen_v1'))
await page.goto(`${base}/?scene=pmap&deep=1&map=hub`, { waitUntil: 'domcontentloaded' })
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
    /* the island already stood on must be refused by the scene, not by the no-listener fallback, and the sentence is how the two are told apart: a scene that refuses everything and a scene nobody is listening to look identical from the panel unless the refusal is read */
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

/* the button is not drawn where there is no sea: the Maw is a windowless room and it is where the chart table stands, so a control that is always there and usually refuses teaches a student that the chart does not work */
await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw`, { waitUntil: 'domcontentloaded' })
await ready(page)
const indoors = await page.evaluate(async () => {
  const bus = await import('/src/game/world/sail-bus.ts')
  return { n: bus.sailListenerCount(), from: bus.sailFrom(), map: window.__pmap.map }
})
ok('and inside a room the chart offers nothing at all',
  indoors.map === 'panther-maw' && indoors.n === 0, JSON.stringify(indoors))

/* 7 · a grant answers */
console.log('\n7 · every grant answers')
const answered = await page.evaluate(async () => {
  const r = await window.__pmap.perform({ kind: 'award', fact: 'proof_fact' })
  await new Promise((z) => setTimeout(z, 120))
  const card = document.querySelector('#kit-feedback')
  return { ok: r && r.ok, said: card ? card.textContent : null }
})
ok('award() writes AND speaks', !!answered.ok && !!answered.said, JSON.stringify(answered))
await shot(page, 'a-grant-answers')

/* 8 · guide_to(None) takes the arrow down */
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
