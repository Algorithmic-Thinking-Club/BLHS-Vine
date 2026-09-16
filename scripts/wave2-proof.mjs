/* browser proof of the sail, the chart, a covered door, a scored frame, a year tick, the yearbook and graduation on the real hub bundle: `__board`, `__helm` and `__dock` are handles on the shipped `board()`, `stepHull` and berthing, because a run that drives a second implementation proves that implementation and nothing else */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const tag = process.argv[3] ?? 'dev'
/* the map version is pinned and printed rather than newest, because `?map=hub` with no version takes whatever the platform published last and that is not always what anybody verified */
const hubV = process.argv[4] ?? '13'
/* the world is pinned to the committed offline document for the same reason: the published one holds one island, no rumour and no named water, so twelve checks below would prove what has been drawn instead of the engine's arithmetic, and `?world=local` is the escape hatch `?src=local` is for maps */
const WORLD = 'world=local'
const shots = 'reference/_archive/build-shots/wave2'
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, got, want) => {
  const s = typeof got === 'string' ? got : JSON.stringify(got)
  const ok = want instanceof RegExp ? want.test(s)
    : typeof want === 'function' ? !!want(got)
      : s.includes(String(want))
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${s.slice(0, 200)}`)
  if (!ok) failures++
}

/* a run mid first year: intro done, the founding not yet happened, three tokens in hand, which is the state the planner and the year model both expect to be handed */
const SAVE = {
  v: 2, id: 'r_w2', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
}

/* the clock leg joins first through the shipped join endpoint, because `readEvents` joins through the roster so a beat is only readable if it belongs to a participant in a class; the dev bridge seeds code DEVDEV with teacher key tk_dev, and a real DATABASE_URL has no seeded class so this leg is skipped rather than failed */
const DEV_TEACHER_KEY = 'tk_dev'
const post = async (path, body) => {
  const r = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const handle = `ProofDose${Date.now().toString(36).slice(-5)}`
let joined = null
try {
  const r = await post('/api/join', { code: 'DEVDEV', handle })
  if (r.status === 200 && r.body?.participantId) joined = r.body
  else console.log(`  [dose] no seeded dev class (join -> ${r.status}); the heartbeat leg is skipped`)
} catch (e) {
  console.log(`  [dose] the api is not answering on this server (${e.message}); the heartbeat leg is skipped`)
}
if (joined) SAVE.participantId = joined.participantId

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => { console.log(`  [pageerror] ${e.message}`); failures++ })
/* a 404 on `/api/v1/maps/panther-maw` is the platform fallback working, since the stand-in was never published there, and anything else gets named because the browser's bare 404 line never says which url missed */
const EXPECTED_404 = /\/api\/v1\/maps\/panther-maw/
page.on('response', (r) => {
  if (r.status() < 400 || EXPECTED_404.test(r.url())) return
  console.log(`  [http ${r.status()}] ${r.url()}`)
})
page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (/Failed to load resource/.test(m.text())) return    // the response listener says which
  console.log(`  [console.error] ${m.text()}`)
})
/* the save is seeded only when localStorage is empty, because an init script reruns on every reload and the legs below reload on purpose, which otherwise put the starting save back and lost every year of progress */
await page.addInitScript((s) => {
  if (!localStorage.getItem('blhs_save_v2')) {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.removeItem('blhs_seen_v1')   // a clean sitting, so arrivals are first arrivals
  }
}, SAVE)

/* a capture waits 360ms because `waitForSelector` returns on the first frame of a panel's 220-300ms entrance, and a proof whose pictures are the gate has no business photographing a moving panel */
const shot = async (n) => {
  await page.waitForTimeout(360)
  await page.screenshot({ path: `${shots}/${tag}-${n}.png` })
}
const json = (fn, ...a) => page.evaluate(([f, args]) => JSON.parse(window[f](...args)), [fn, a])
const ready = () => page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 90000 })

/* nothing along the bottom of the window may stand on the body: every surface that lays out from the bottom edge publishes its height through src/game/ui/frame.ts and the camera lifts the painting clear, so from outside the player is above or beside it and never behind it */
const clearOfThePlayer = async (label) => {
  const you = (await json('__sea')).you
  const rects = await page.evaluate(() => [...document.querySelectorAll('.pc-root, .dlg-choices, .cs-dialogue, .ys-card')]
    .map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })
    .filter((r) => r.bottom > r.top))
  const behind = rects.filter((r) =>
    you.x > r.left && you.x < r.right && you.y > r.top && you.y - you.h < r.bottom)
  check(label, { you, behind: behind.length, rects: rects.length }, (o) => o.behind === 0)
}

console.log(`\n=== wave 2 · ${tag}: ${base} · hub v${hubV} ===\n`)

// ---------------------------------------------------------------- 1. the world
console.log('1 · the world: the real hub, placed on a composition the engine reads')

await page.goto(`${base}/?scene=pmap&deep=1&map=hub&v=${hubV}&${WORLD}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await ready()

const sea0 = await json('__sea')
check('the REAL hub bundle loaded, off the platform and not a hand copy', sea0, (s) => s.map === 'hub')
check('and the composition places it, so the engine reads where a map is rather than holding it',
  sea0, (s) => s.placed === true && s.canSail === true)
/* the seven states, five a student's and two the world's, where the chart and the water read the same table so they cannot disagree */
check('every slot on the water carries one of the seven states', sea0,
  (s) => s.states.length >= 2 && s.states.every((x) => /=(rumour|rising|misty|discovered|available|active|completed)$/.test(x)))
check('a slot with no map reads as a rumour at a real future position', sea0,
  (s) => s.states.some((x) => x.endsWith('=rumour')))
check('and the water this painting sits on has a name', sea0, (s) => s.region === 'home_water')
await clearOfThePlayer('and the arrival card is not standing on him: the camera lifted for it')
await shot('1-hub')

console.log('\n1b · a leg, sailed on the shipped physics')
check('nothing is aboard before anybody boards', sea0, (s) => s.aboard === false && s.zoom === 1)
check('casting off is offered at the berth', await page.evaluate(() => window.__board()), 'aboard')
const sea1 = await json('__sea')
check('the driven body changed, so the camera came off the clamp and pulled out',
  sea1, (s) => s.aboard === true && s.free === true && s.want < 0.5)
check('and residency changed with it: the composition decided what is in memory',
  sea1, (s) => s.resident.includes('hub'))

/* the leg out of the harbour is flown the way a student flies it: every input is the same helm the arrow keys feed into the same `stepHull`, because warping a boat to a coordinate would only prove the warp */
const helm = (t, turn, ms) => page.evaluate(([a, b, c]) => window.__helm(a, b, c), [t, turn, ms])
/* the helm window is deliberately longer than the loop period, because an override that expires between two polls is a boat coasting half a crossing, and a headless browser's rAF is slower than a real one's */
const steerTo = async (tx, ty, ms) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = await json('__sea')
    if (Math.hypot(tx - s.at.x, ty - s.at.y) < 160) break
    const want = Math.atan2(ty - s.at.y, tx - s.at.x)
    const err = Math.atan2(Math.sin(want - s.headingRad), Math.cos(want - s.headingRad))
    await helm(1, Math.abs(err) < 0.06 ? 0 : Math.sign(err), 2500)
    await page.waitForTimeout(200)
  }
}

await helm(1, 0, 4000)                                           // clear the harbour
await page.waitForTimeout(3600)
const seaOut = await json('__sea')
check('she made way under her own physics', seaOut, (s) => s.speed > 60)
check('and stayed off the rocks doing it', seaOut, (s) => s.aground === false)
check('leaving a wake behind her, two trails with per-point age', seaOut, (s) => s.wake > 20)
check('the zoom TRAVELLED rather than snapping, and settled where the body asked',
  seaOut, (s) => Math.abs(s.zoom - s.want) < 0.03 && s.want < 0.5)

/* away east, for the field somebody keeps mentioning */
await steerTo(1480, -160, 60000)
const sea2 = await json('__sea')
const moved = Math.hypot(sea2.at.x - sea1.at.x, sea2.at.y - sea1.at.y)
check('a real distance was covered on the composition', String(Math.round(moved)), (n) => Number(n) > 700)
/* the composition is the thing sailed on: she crossed out of the home water into a named region and came inside the discovery radius of a slot holding no map, which is what a rumour at a real future position is for */
check('she crossed into another named sea region', sea2, (s) => s.region === 'the_reach')
check('and coming close enough to a rumour discovered it, off the PAINTED extent',
  sea2, (s) => s.seen.includes('stadium'))
await shot('2-sailing')

// ---------------------------------------------------------------- 2. the chart
console.log('\n2 · the chart, drawn from the same list the water is')
await page.evaluate(() => window.__intent({ kind: 'open', ui: 'chart' }))
await page.waitForSelector('.ch-sea', { timeout: 10000 })
const isles = await page.$$eval('.ch-isle', (n) => n.map((e) => e.className + '|' + e.textContent))
check('the chart drew the composition and not the tile-era registry', isles.join(' ~ '), /ch-isle ch-/)
/* the claim is the relationship and not the count, which broke once as `=== 2` when the offline document grew a third island: the hub, hub-a2 and the Maw are four slots and one dot because they are one place */
const slotsOf = await page.evaluate(() => {
  const c = window.__world.composition
  return { slots: c.slots.length, home: c.slots.filter((s) => s.place === 'home-island').length }
})
check('one dot per PLACE, so the hub and the Maw are one island and not two',
  JSON.stringify({ ...slotsOf, dots: isles.length }),
  () => slotsOf.home >= 3 && isles.length === slotsOf.slots - slotsOf.home + 1)
check('a rumour is on it, at a real position, unnamed', isles.join(' ~ '), /ch-rumour/)
check('and every mark carries a SHAPE as well as a colour, so state does not rely on hue',
  isles.join(' ~ '), /[?*~·○▲✓]/)
const regions = await page.$$eval('.ch-region-name', (n) => n.map((e) => e.textContent))
/* `the_reach`'s label is now "the far water", and the region's name is untouched */
check('the named water is on the paper too', regions.join(','), 'the far water')
await shot('3-chart')
await page.keyboard.press('Escape').catch(() => {})
await page.click('.hb-veil', { position: { x: 10, y: 10 } }).catch(() => {})
await page.waitForFunction(() => !document.querySelector('.ch-sea'), null, { timeout: 8000 }).catch(() => {})

// ------------------------------------------------- 3. dock, and a covered door
console.log('\n3 · dock, then a door through the transition library')
check('she can be put in, from wherever the leg ended', await page.evaluate(() => window.__dock()), 'docking')
/* the manoeuvre runs the same physics under a computed helm: out to the approach point, then alongside, then stopped on the authored heading */
await page.waitForFunction(() => JSON.parse(window.__sea()).berthing === 'alongside', null, { timeout: 60000 })
check('she made the approach point before the berth, rather than cutting the corner',
  await json('__sea'), (s) => s.berthing === 'alongside')
await page.waitForFunction(() => JSON.parse(window.__sea()).aboard === false, null, { timeout: 60000 })
const sea3 = await json('__sea')
check('the manoeuvre finished and the body was handed back, camera and all',
  sea3, (s) => s.aboard === false && s.free === false && s.want === 1)
await shot('4-docked')

/* the hub's own door into the Maw, which used to run a black rectangle drawn by the scene and never touched the five covers or the fact pool, fired and not awaited on purpose because `enter` resolves only when the map has really swapped and awaiting it would put every check below after the cover had lifted */
await page.evaluate(() => { void window.__intent({ kind: 'enter', map: 'panther-maw', at: 'arrive_maw' }) })
await page.waitForSelector('.tr-scene', { timeout: 10000 })
check('a door swap raised a real cover, not a rectangle', await page.textContent('.tr-scene-entering'), 'E N T E R I N G')
check('the cover names the DESTINATION, in words rather than a slug',
  await page.textContent('.tr-scene-title'), /PANTHER/i)
/* a cover says where you are going and nothing else, so the trivia line under the name is gone and a fact element coming back is now the failure, which is why the check is inverted rather than deleted */
check('and it carries no trivia line under the name',
  await page.$('.tr-scene-fact'), (el) => el === null)
await shot('5-cover')
await page.waitForFunction(() => !document.querySelector('.tr-root'), null, { timeout: 30000 })
await ready()
check('and the map behind it really did change', await json('__sea'), (s) => s.map === 'panther-maw')
/* the place card fires on entry, once per session per map, and takes no input; photograph it first because it lives 3.2 seconds and drops itself the moment a panel opens, so asserting text first meant the year's own card had already covered it */
await page.waitForSelector('.pc-root', { timeout: 10000 })
await shot('6-placecard')
const card = await page.textContent('.pc-name').catch(() => '')
check('the arrival card said where this is, and never a slug', card, /Panther/i)
check('and it is not a control: nothing on it can be clicked or focused',
  await page.$eval('.pc-root', (e) => `${e.getAttribute('aria-hidden')}|${getComputedStyle(e).pointerEvents}`),
  'true|none')
/* and it is actually visible: the card sits under the dialogue box in the stack and was positioned inside the box's own band, so an arrival landing while anybody was talking was drawn entirely behind the paper, which was every arrival */
const cardBox = await page.evaluate(() => {
  const c = document.querySelector('.pc-root')?.getBoundingClientRect()
  const d = document.querySelector('.cs-dialogue')?.getBoundingClientRect()
  return { card: c && { top: Math.round(c.top), bottom: Math.round(c.bottom) }, box: d && { top: Math.round(d.top) } }
})
check('and it clears the dialogue box rather than hiding behind it',
  cardBox, (b) => !!b.card && (!b.box || b.card.bottom <= b.box.top))
await clearOfThePlayer('and it clears the player as well, rather than trading one collision for another')

// ---------------------------------------------------------------- riders
console.log('\nriders · fx performs, and refuses what it cannot draw')
check('a named one-shot plays and its promise resolves',
  await page.evaluate(() => window.__fx('spark')), 'played')
check('and a name the library does not hold still refuses, listing what it has',
  await page.evaluate(() => window.__fx('not_a_real_effect')), /not in the effect library/)
check('the same word, asked for as an INTENT, performs rather than throwing',
  await page.evaluate(() => window.__intent({ kind: 'fx', name: 'spark', anchor: 'hearth' })
    .then((r) => JSON.stringify(r))), '"ok":true')
check('and an anchor this map does not carry is refused by name',
  await page.evaluate(() => window.__intent({ kind: 'fx', name: 'spark', anchor: 'nowhere' })
    .then((r) => JSON.stringify(r))), 'no anchor named')
/* fired and deliberately not awaited, because `__fx` resolves when the effect has finished, and `island_rising` is the one photographed since its 2600ms leaves a ring on screen in a frame taken partway through */
await page.evaluate(() => { void window.__fx('island_rising') })
await shot('7-fx')
check('an effect is still on screen while it is playing, which is what the shot is of',
  await page.evaluate(() => window.__fx('island_rising')), 'played')

// ------------------------------------------- 4. one frame, scored in both arms
console.log('\n4 · one scored frame, run in BOTH arms, from the same authored items')

/* `play` honours the arm, so one authored beat renders as the game and as the control with no second file, driven here through the same intent a grape issues, once each way */
const runBeat = async (plain) => {
  await page.evaluate((p) => { void window.__intent({ kind: 'play', beat: 'core:y1', as_plain: p }) }, plain)
  await page.waitForSelector(plain ? '.bt-plain' : '.bt-stage', { timeout: 15000 })
  const text = await page.textContent(plain ? '.bt-plain' : '.bt-stage')
  return text.replace(/\s+/g, ' ').trim()
}

/* a graded frame cannot be dismissed: src/game/ui/a11y.ts writes that rule down and the runner joins it with `closeOnEscape: false`, so the frame is left by ending the sitting and `settle()` is a reload rather than a pretend click, otherwise the planner opens underneath the quiz */
const settle = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
}

const game = await runBeat(false)
check('the game arm mounted a real frame on the painted map', game, (t) => t.length > 40)
check('and it is a real modal: a screen reader is told, and Tab cannot leave it',
  await page.$eval('.bt-stage', (e) => `${e.getAttribute('role')}|${e.getAttribute('aria-modal')}`), 'dialog|true')
check('and Escape does NOT abandon a scored item halfway through',
  await (async () => {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(200)
    return page.$('.bt-stage').then((el) => (el ? 'still up' : 'gone'))
  })(), 'still up')
await shot('8-arm-game')
await settle()

const plain = await runBeat(true)
check('the control arm mounted the SAME beat as a plain form', plain, (t) => t.length > 40)
/* content constant and game-ness the variable: the items must be identical and only the chrome around them changes */
const stem = 'What is the one thing'
const bothHave = (needle) => game.includes(needle) === plain.includes(needle)
check('and the two arms carry the same items, which is the whole study',
  String(bothHave(stem)), 'true')
await shot('9-arm-plain')
await settle()

// ------------------------------------ 5. a year ticks: a planner spend + a beat
console.log('\n5 · a year ticks: a token spent on the real roster, then the core beat')
await page.evaluate(() => { void window.__intent({ kind: 'open', ui: 'planner' }) })
await page.waitForSelector('.pl-sheet', { timeout: 10000 })
/* the slot is a placeholder until it is opened, because the menu of what a season could hold sits behind the token rather than printed beside it, so the check opens one exactly as a student does */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.pl-sheet button')].find((x) => /place the season token/.test(x.textContent))
  b?.click()
})
await page.waitForTimeout(300)
const menu = await page.$$eval('.pl-sheet button', (b) => b.map((x) => x.textContent.trim()).join(' | '))
check('the sheet lists programmes off the roster and not a stale array', menu, /Football|Key Club|Track/)
/* an out-of-season programme must be refused in words rather than filtered out of this menu, because a `.filter()` here left a student looking for football in winter told nothing at all */
check('and an out-of-season programme is REFUSED in words rather than hidden',
  menu, /season|Winter|Spring|Fall/)
await shot('10-planner')

/* a save is written and then reloaded, never poked under a live page, because `loadSave` caches and the `storage` event only fires across tabs, so the next panel that saves anything merges from its own stale cache and the write is gone */
const writeRun = async (patch) => {
  await page.evaluate((p) => {
    const s = JSON.parse(localStorage.getItem('blhs_save_v2'))
    localStorage.setItem('blhs_save_v2', JSON.stringify({ ...s, ...p, savedAt: Date.now() }))
  }, patch)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready()
}
const row = (id, title, kind, year) => ({
  id, title, kind, credit: 0.5, grade: 3.4, year, season: 'Fall', attempts: 1, firstGrade: 3.4,
})

check('three season tokens in hand before anything is committed',
  await page.evaluate(() => String(JSON.parse(localStorage.getItem('blhs_save_v2')).tokens.length)), '3')

/* the stamp is a season token committed to a programme with two classes picked, and a slot points at a programme id and never at a map, which lets one stadium hold football in the fall and flag football in the winter without either marking the other complete */
await writeRun({
  plans: { 1: { slots: { Fall: 'football' }, classes: ['ap-seminar', 'ap-chem'], stamped: true } },
  tokens: ['Winter', 'Spring'],
  islands: { football: 'active' },
})
const spent = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')))
check('a token was spent on a PROGRAMME and never on a map', JSON.stringify(spent.plans[1].slots), 'football')
check('and two of the three seasons are left', String(spent.tokens.length), '2')

// ---------------------------------------------------------- 6. the yearbook
console.log('\n6 · the year closes into a book')
/* the core beat and both classes on the ledger, which is exactly what `readyForYearbook` asks for and what a real year arrives at */
await writeRun({
  ledger: [row('core:y1', 'This is the place', 'core', 1),
    row('class:ap-seminar', 'AP Seminar', 'class', 1),
    row('class:ap-chem', 'AP Chemistry', 'class', 1)],
})
await page.evaluate(() => { void window.__intent({ kind: 'open', ui: 'yearbook' }) })
await page.waitForSelector('.yb-page', { timeout: 10000 })
const yb = (await page.textContent('.yb-page')).replace(/\s+/g, ' ')
check('the book opened on a year and named it', yb, /Year 1/)
check('and it read the year that really happened rather than an empty one',
  yb, (t) => !/Nothing was graded/.test(t))
/* the sections are in a fixed order and none is dropped, so a page assembles the same way whatever is present and a freshman's page and a senior's page are one document */
const sections = await page.$$eval('.yb-sect', (n) => n.map((e) => e.textContent.trim()))
check('every section is on the page, present or empty', String(sections.length), (n) => Number(n) >= 4)
await shot('11-yearbook')

// ------------------------------------------------ 7. graduate a compressed run
console.log('\n7 · a compressed run graduates, and the transcript freezes')
/* four years compressed, the same four plans and the same three rows per year with the fourth turn taken, and nothing here shortcuts a rule: `readyForYearbook` still has to be true for year four or the book will not offer the stage */
const plan1 = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')).plans['1'])
/* the ledger id of a class carries no year (`classDone` reads `class:<id>`) so a class sat in two years is one row, while the core beat's does carry one, and getting it wrong made year four read as owing two classes it had already passed */
const ledger4 = [
  ...[1, 2, 3, 4].map((y) => row(`core:y${y}`, `Year ${y}`, 'core', y)),
  row('class:ap-seminar', 'AP Seminar', 'class', 4),
  row('class:ap-chem', 'AP Chemistry', 'class', 4),
]
await writeRun({
  year: 4,
  plans: { 1: plan1, 2: plan1, 3: plan1, 4: plan1 },
  ledger: ledger4,
  flags: ['yearbook:y1', 'yearbook:y2', 'yearbook:y3'],
})
await page.evaluate(() => { void window.__intent({ kind: 'open', ui: 'yearbook' }) })
await page.waitForSelector('.yb-page', { timeout: 10000 })
check('year four is closable, so the book offers the stage rather than a turn',
  await page.textContent('.yb-page'), /Finish all four years|Walk the stage/)
/* the last turn is `endYear` and the fourth one is terminal: it marks the run graduated instead of refilling tokens, because senior year does not repeat */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /finish all four years|end this year/i.test(x.textContent))
  b?.click()
})
await page.waitForTimeout(600)
check('the fourth turn is terminal and marks the run graduated, not year five',
  await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('blhs_save_v2')))), '"graduated":true')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /walk the stage/i.test(x.textContent))
  b?.click()
})
await page.waitForSelector('.gr-stage', { timeout: 20000 }).catch(() => {})
/* click through the ceremony's stages to the diploma */
for (let i = 0; i < 12; i++) {
  if (await page.$('.gr-diploma')) break
  await page.evaluate(() => {
    /* the ceremony is walked rather than clicked through a wizard: most beats advance by tapping the card itself and the board carries one real button, so both are tried in that order because a card that has a button is a card whose body does nothing */
    const b = [...document.querySelectorAll('.gr-stage button')].find((x) => !x.disabled)
    if (b) b.click()
    else document.querySelector('.gr-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(500)
}
const dip = await page.textContent('.gr-diploma').catch(() => '')
check('a compressed run reached the diploma', dip, (t) => t.length > 40)
check('and it carries a verification code a teacher can check', dip, /[A-Z0-9]{4,}/)
/* the transcript is frozen at the stage: `_store.ts`'s putState is an upsert with `on conflict do update` and there was no snapshot at all, so a graduate who kept playing moved the roster's number while the printed code did not move with it */
const sealed = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')).diploma)
check('the run was SEALED at the stage rather than recomputed at render',
  JSON.stringify(sealed ?? null), (t) => t !== 'null' && t.includes('code'))
await shot('12-diploma')

// ------------------------------- riders · the clock, end to end and not queued
if (joined) {
  console.log('\nriders · time on task, from the browser clock to the dose table')
  /* the last flush: the logger drains on a five-second interval and on pagehide, and closing a browser is not a pagehide the page gets to act on, so the run gives it one interval to put the tail of the queue on the wire */
  await page.waitForTimeout(6000)
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_log_queue') ?? '[]').length)
  check('the offline queue really drained rather than piling up locally', String(left), (n) => Number(n) < 10)

  const r = await post('/api/dose', {
    classId: joined.classId, teacherKey: DEV_TEACHER_KEY, handle: joined.handle ?? handle,
  })
  check('the dose read answers for the class this run joined', String(r.status), '200')
  const d = r.body ?? {}
  const me = (d.participants ?? [])[0]
  check('beats written by THIS browser reached the store', String(d.beatRows ?? 0), (n) => Number(n) > 0)
  check('and the reader folded them into real time on task, not a zero',
    JSON.stringify(me ?? null), () => !!me && me.onTaskMs > 0)
  /* the participant id never leaves, which is the rule the roster op already holds and the reason this table can be looked at in front of a class at all */
  check('the table names the handle and never the participant id',
    me ?? {}, (m) => !!m.handle && !JSON.stringify(m).includes(joined.participantId))
  console.log(`        ${d.beatRows} beats · ${me?.onTaskMinutes ?? 0} min on task · cadence ${d.cadenceMs}ms`)
}

await browser.close()
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} — shots in ${shots}/${tag}-*.png\n`)
process.exit(failures ? 1 : 0)
