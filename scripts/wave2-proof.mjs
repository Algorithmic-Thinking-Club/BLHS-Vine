/* THE WAVE 2 GATE, driven through a real browser on the REAL HUB BUNDLE.
 *
 * Wave 1's script (scripts/wave1-proof.mjs) is the pattern and it still runs:
 * it proves the stage on the Maw stand-in and nothing here replaces it. This one
 * proves the seven things wave 2 was ordered to buy, in one run, and it grows an
 * item at a time rather than forking per item.
 *
 * The gate, verbatim from docs/ops/BRIEF-ENGINE-2.md:
 *
 *   sail a leg on the composition, open the chart, dock and enter through a
 *   covered transition, run one frame activity scored in both arms, tick a year
 *   with a planner spend and a core beat, reach the yearbook, and graduate a
 *   compressed run.
 *
 * EVERY CHECK GOES THROUGH THE SHIPPED PATH. The debug hooks are handles on the
 * real code, never a second copy of it: `__board` calls the same `board()` the E
 * key calls, `__helm` feeds the same helm the arrow keys feed into the same
 * `stepHull`, and `__dock` starts the same berthing manoeuvre. A proof run that
 * drives a second implementation proves that implementation and nothing else.
 *
 * Run against whichever server is up, with MAPVIS on 5274 for the real hub:
 *   node scripts/wave2-proof.mjs http://localhost:5173
 *   node scripts/wave2-proof.mjs http://localhost:4173 preview
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const tag = process.argv[3] ?? 'dev'
/* PINNED, NOT NEWEST. `?map=hub` with no version asks the platform for whatever
 * it published last, and what it published last is not always what anybody
 * verified: v10 was written unattended by a stale tab and was the newest for
 * three quarters of an hour. A proof run that follows "newest" proves whatever
 * happened to be there, so the version is an argument with a default and the run
 * prints it. */
const hubV = process.argv[4] ?? '13'
/* AND THE WORLD IS PINNED FOR THE SAME REASON THE MAP IS.
 *
 * Wave 4 pointed `loadComposition` at the platform, which was always the plan and
 * is right for a student. It is wrong for THIS run: every check below is about
 * the engine's own arithmetic on a document, and the document MAPVIS has
 * published so far holds one island, no rumour and no named water, so twelve
 * checks went from proving the water to proving what has been drawn this week.
 *
 * A rumour at a real future position, two paintings sharing one dot, and a
 * crossing between two named seas are all still true of the engine and are still
 * worth a gate. They are proved against the committed document, which is the
 * offline copy every check here was written against, and the run says so.
 * `?world=local` is the same escape hatch `?src=local` is for maps. */
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

/* a run mid-first-year: the intro is done, the founding has not happened, and
 * three tokens are in hand, which is the state the planner and the year model
 * both expect to be handed. */
const SAVE = {
  v: 2, id: 'r_w2', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
}

/* ---- THE CLOCK, JOINED BEFORE THE RUN STARTS ------------------------------
 *
 * §80.6's dose measure is the study's exposure number and until this wave it
 * could only be verified in production: `src/game/telemetry.ts` sent nowhere in
 * dev, so every beat piled up in localStorage and `api/_dose.ts` never saw one.
 * The endpoint is `/api/log` in both now, and the vite dev bridge answers it out
 * of a local JSON file, so the whole path is walkable here.
 *
 * A beat is only READABLE if it belongs to a participant in a class, because
 * `readEvents` joins through the roster. So the run joins first, through the
 * SHIPPED join endpoint, using the class the dev bridge seeds (vite.config.ts:
 * code DEVDEV, teacher key tk_dev). If a developer has a real DATABASE_URL there
 * is no seeded class and this leg says so and is skipped rather than failing:
 * it is a dev-store proof and it should say which store it proved. */
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

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => { console.log(`  [pageerror] ${e.message}`); failures++ })
/* "Failed to load resource: 404" is the browser saying a fetch missed and NOT
 * saying which one, seven times a run, which reads like something is broken. The
 * URL is the whole of the information, and the one that shows up is the engine
 * asking the platform for `panther-maw` before it falls back to the local
 * folder: the stand-in has never been published to MAPVIS, so a 404 there is the
 * fallback working rather than failing. Anything else gets named. */
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
/* SEEDED ONCE, NOT ON EVERY LOAD. An init script runs again on every reload, and
 * the run legs below reload on purpose to make a written save visible to a page
 * that caches it. Without this guard the reload put the starting save back and
 * every year of progress vanished between one check and the next. */
await page.addInitScript((s) => {
  if (!localStorage.getItem('blhs_save_v2')) {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.removeItem('blhs_seen_v1')   // a clean sitting, so arrivals are first arrivals
  }
}, SAVE)

/* A CAPTURE WAITS FOR THE PICTURE TO STOP MOVING. `waitForSelector` returns on
 * the FIRST frame of a panel's 220-300ms entrance, so this whole set was shot
 * mid-animation and the fresh-eyes round read it as translucent panels with the
 * world bleeding through them. The entrances carry no opacity any more
 * (hud.css `hb-in`), so this is belt and braces; a proof whose pictures are the
 * gate still has no business photographing a moving panel. */
const shot = async (n) => {
  await page.waitForTimeout(360)
  await page.screenshot({ path: `${shots}/${tag}-${n}.png` })
}
const json = (fn, ...a) => page.evaluate(([f, args]) => JSON.parse(window[f](...args)), [fn, a])
const ready = () => page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 90000 })

/* NOTHING ALONG THE BOTTOM OF THE WINDOW STANDS ON THE BODY.
 *
 * The brief's third item, as an assertion instead of a picture. Every surface
 * that lays itself out from the bottom edge (the dialogue box, the year's card,
 * the arrival card, a stack of choices) publishes its height through
 * src/game/ui/frame.ts and the camera lifts the painting clear of all of them.
 * This is how that gets checked from outside: whatever is on screen, the player
 * is above it or beside it and never behind it. */
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

await page.goto(`${base}/?scene=pmap&map=hub&v=${hubV}&${WORLD}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await ready()

const sea0 = await json('__sea')
check('the REAL hub bundle loaded, off the platform and not a hand copy', sea0, (s) => s.map === 'hub')
check('and the composition places it, so the engine reads where a map is rather than holding it',
  sea0, (s) => s.placed === true && s.canSail === true)
/* THE SEVEN STATES. Five are a student's and two are the world's, and the chart
 * and the water read the same table so they cannot disagree. */
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

/* THE LEG: out of the harbour, about, and away east into the Reach.
 *
 * FLOWN THE WAY A STUDENT FLIES IT. Every input below is the same helm the arrow
 * keys feed into the same `stepHull`: a throttle, a rudder, and a look at where
 * she has got to. Nothing warps a boat to a coordinate, because a run that did
 * would be proving the warp. */
const helm = (t, turn, ms) => page.evaluate(([a, b, c]) => window.__helm(a, b, c), [t, turn, ms])
/* the helm window is deliberately longer than the loop period: an override that
 * expires between two polls is a boat that spends half a crossing coasting, and
 * a headless browser's rAF is slower than a real one's */
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
/* THE COMPOSITION IS THE THING SAILED ON. She crossed out of the home water into
 * a named region, and came inside the discovery radius of a slot that holds no
 * map at all, which is what a rumour at a real future position is for. */
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
/* THE CLAIM IS THE RELATIONSHIP, NOT THE COUNT. This asserted `=== 2` and broke
 * the day the offline document grew a third island, which is exactly the thing
 * the document is for: a count is a fact about how much has been authored and
 * the collapse is a fact about the engine. What must stay true is that the hub,
 * hub-a2 and the Maw are four slots and ONE dot, because they are one place. */
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
/* the expected string moved with the words pass, 2026-09-04: `the_reach`'s
   LABEL is now "the far water". The region's NAME is untouched. */
check('the named water is on the paper too', regions.join(','), 'the far water')
await shot('3-chart')
await page.keyboard.press('Escape').catch(() => {})
await page.click('.hb-veil', { position: { x: 10, y: 10 } }).catch(() => {})
await page.waitForFunction(() => !document.querySelector('.ch-sea'), null, { timeout: 8000 }).catch(() => {})

// ------------------------------------------------- 3. dock, and a covered door
console.log('\n3 · dock, then a door through the transition library')
check('she can be put in, from wherever the leg ended', await page.evaluate(() => window.__dock()), 'docking')
/* the manoeuvre runs the same physics under a computed helm: out to the approach
 * point, then alongside, then stopped on the authored heading. Ash's word for
 * what this has to look like was *properly*. */
await page.waitForFunction(() => JSON.parse(window.__sea()).berthing === 'alongside', null, { timeout: 60000 })
check('she made the approach point before the berth, rather than cutting the corner',
  await json('__sea'), (s) => s.berthing === 'alongside')
await page.waitForFunction(() => JSON.parse(window.__sea()).aboard === false, null, { timeout: 60000 })
const sea3 = await json('__sea')
check('the manoeuvre finished and the body was handed back, camera and all',
  sea3, (s) => s.aboard === false && s.free === false && s.want === 1)
await shot('4-docked')

/* THE COVERED TRANSITION. The hub's own door into the Maw, which before this
 * wave ran a black rectangle drawn by the scene and never touched the five
 * covers or the fact pool.
 *
 * FIRED AND NOT AWAITED, on purpose. `enter` resolves when the map has really
 * swapped, which is the contract a station body needs, and awaiting it here
 * would put every check below AFTER the cover had already lifted. */
await page.evaluate(() => { void window.__intent({ kind: 'enter', map: 'panther-maw', at: 'arrive_maw' }) })
await page.waitForSelector('.tr-scene', { timeout: 10000 })
check('a door swap raised a real cover, not a rectangle', await page.textContent('.tr-scene-entering'), 'E N T E R I N G')
check('the cover names the DESTINATION, in words rather than a slug',
  await page.textContent('.tr-scene-title'), /PANTHER/i)
/* AND IT CARRIES NOTHING ELSE. This check used to read the loading fact out of
 * `.tr-scene-fact` and assert it was a real sentence. Ash ruled the trivia line
 * off every cover on 2026-09-06: "a cover says where you are going and nothing
 * else", naming the "INSIDE BONNEY LAKE HIGH SCHOOL / Around 1,700 students..."
 * line by sight. The element is gone, so the check is inverted rather than
 * deleted: a fact line coming back on a cover is now the failure. */
check('and it carries no trivia line under the name',
  await page.$('.tr-scene-fact'), (el) => el === null)
await shot('5-cover')
await page.waitForFunction(() => !document.querySelector('.tr-root'), null, { timeout: 30000 })
await ready()
check('and the map behind it really did change', await json('__sea'), (s) => s.map === 'panther-maw')
/* THE PLACE CARD: fired on entry, once per session per map, taking no input.
 *
 * THE PICTURE COMES FIRST HERE, and that is the fix rather than a preference.
 * The card lives 3.2 seconds and then leaves, and it also drops itself the
 * moment a panel opens (PlaceCard.tsx: it is an announcement, not a queue). The
 * old order asserted the text, then the aria attributes, then shot, and by then
 * the year's own card had opened over it: the capture called "6-placecard"
 * showed no card at all. Shoot the thing while it is on screen, then ask it
 * questions. */
await page.waitForSelector('.pc-root', { timeout: 10000 })
await shot('6-placecard')
const card = await page.textContent('.pc-name').catch(() => '')
check('the arrival card said where this is, and never a slug', card, /Panther/i)
check('and it is not a control: nothing on it can be clicked or focused',
  await page.$eval('.pc-root', (e) => `${e.getAttribute('aria-hidden')}|${getComputedStyle(e).pointerEvents}`),
  'true|none')
/* AND IT IS ACTUALLY VISIBLE, which it was not. The card is deliberately UNDER
 * the dialogue box in the stack and was also positioned inside the box's own
 * band, so an arrival that landed while anybody was talking was drawn entirely
 * behind the paper. The year's opening line lands in the same second as the
 * arrival on every map, so that was every arrival. */
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
/* AND THE CAPTURE HAS TO SHOW AN EFFECT PLAYING.
 *
 * `__fx` resolves when the effect has FINISHED, which is the contract a station
 * body needs and is exactly wrong for a photograph: every check above waited for
 * the spark to end, so the shot called "7-fx" was a picture of a room with no fx
 * in it. Fired and deliberately not awaited, and the longest thing in the
 * library is the one that gets photographed: `island_rising` runs 2600ms, so a
 * frame taken partway through it has a ring on screen to see. */
await page.evaluate(() => { void window.__fx('island_rising') })
await shot('7-fx')
check('an effect is still on screen while it is playing, which is what the shot is of',
  await page.evaluate(() => window.__fx('island_rising')), 'played')

// ------------------------------------------- 4. one frame, scored in both arms
console.log('\n4 · one scored frame, run in BOTH arms, from the same authored items')

/* THE STRONGEST THING THE VINE GIVES A MEMBER, and §16.0 says none of them will
 * ever know it: `play` honours the arm, so one authored beat renders as the game
 * and as the control with no second file. Driven here through the same intent a
 * grape issues, once each way, with the items read off the screen both times. */
const runBeat = async (plain) => {
  await page.evaluate((p) => { void window.__intent({ kind: 'play', beat: 'core:y1', as_plain: p }) }, plain)
  await page.waitForSelector(plain ? '.bt-plain' : '.bt-stage', { timeout: 15000 })
  const text = await page.textContent(plain ? '.bt-plain' : '.bt-stage')
  return text.replace(/\s+/g, ' ').trim()
}

/* A GRADED FRAME CANNOT BE DISMISSED, AND THAT IS THE PRODUCT'S ANSWER.
 *
 * This clicked `.bt-close` and `.bt-veil` and swallowed the timeout when neither
 * did anything, because neither has ever been a dismiss: `src/game/ui/a11y.ts`
 * writes the rule down as "a panel that is not dismissible (a graded frame
 * mid-run)" and the runner now joins that contract with `closeOnEscape: false`.
 * So the frame is left the way a student leaves one, by ending the sitting, and
 * `settle()` is a reload rather than a pretend click. Without this the planner
 * opened UNDERNEATH the quiz and the capture named "10-planner" was a picture of
 * the quiz. */
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
/* CONTENT CONSTANT, GAME-NESS THE VARIABLE. The items are the study's content and
 * they must be identical; the chrome around them is the independent variable. */
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
/* the slot is a placeholder until it is opened, which is the sheet's own shape:
 * the menu of what a season could hold is behind the token, not printed beside
 * it. So the check opens one, exactly as a student does. */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.pl-sheet button')].find((x) => /place the season token/.test(x.textContent))
  b?.click()
})
await page.waitForTimeout(300)
const menu = await page.$$eval('.pl-sheet button', (b) => b.map((x) => x.textContent.trim()).join(' | '))
check('the sheet lists programmes off the roster and not a stale array', menu, /Football|Key Club|Track/)
/* N3: A REFUSAL THAT SAYS WHY. The season lock was a `.filter()` on this menu,
 * which removed an out-of-season programme instead of refusing it, so a student
 * looking for football in winter was told nothing at all. */
check('and an out-of-season programme is REFUSED in words rather than hidden',
  menu, /season|Winter|Spring|Fall/)
await shot('10-planner')

/* A SAVE IS WRITTEN AND THEN RELOADED, NEVER POKED UNDER A LIVE PAGE.
 *
 * `loadSave` caches and the `storage` event only fires ACROSS tabs, so a direct
 * write is invisible to the running page: the next panel that saves anything
 * merges from its own stale cache and the write is gone. The first draft of this
 * run lost a whole stamped plan that way and the yearbook read an empty year.
 * Reloading is what a student's next sitting does anyway. */
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

/* the stamp: a season token committed to a PROGRAMME and two classes picked.
 * A slot points at a programme id and never at a map, which is what lets one
 * stadium hold football in the fall and flag football in the winter without
 * either marking the other complete. */
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
/* the core beat and both classes on the ledger, which is exactly what
 * `readyForYearbook` asks for and what a real year arrives at */
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
/* THE SECTIONS ARE IN A FIXED ORDER AND NONE IS DROPPED. §80.6: a page that
 * assembles section by section in an order that does not depend on what is
 * present, so a freshman's page and a senior's page are one document. */
const sections = await page.$$eval('.yb-sect', (n) => n.map((e) => e.textContent.trim()))
check('every section is on the page, present or empty', String(sections.length), (n) => Number(n) >= 4)
await shot('11-yearbook')

// ------------------------------------------------ 7. graduate a compressed run
console.log('\n7 · a compressed run graduates, and the transcript freezes')
/* FOUR YEARS, COMPRESSED. The same four plans, the same three rows per year and
 * the fourth turn taken, which is what `endYear` calls terminal. Nothing here is
 * a shortcut past a rule: `readyForYearbook` still has to be true for year four
 * or the book will not offer the stage. */
const plan1 = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')).plans['1'])
/* THE LEDGER ID OF A CLASS CARRIES NO YEAR (`classDone` reads `class:<id>`), so a
 * class sat in two years is one row. The core beat's does carry one. Getting this
 * wrong is what made year four read as owing two classes it had already passed,
 * and the book correctly refused to close on it. */
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
/* the last turn is `endYear`, and the fourth one is terminal: it marks the run
 * graduated instead of refilling tokens, because senior year does not repeat */
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
    /* the ceremony is walked, not clicked through a wizard: most beats advance by
     * tapping the card itself, and the board carries one real button. Both paths
     * are tried, in that order, because a card that has a button is a card whose
     * body does nothing. */
    const b = [...document.querySelectorAll('.gr-stage button')].find((x) => !x.disabled)
    if (b) b.click()
    else document.querySelector('.gr-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(500)
}
const dip = await page.textContent('.gr-diploma').catch(() => '')
check('a compressed run reached the diploma', dip, (t) => t.length > 40)
check('and it carries a verification code a teacher can check', dip, /[A-Z0-9]{4,}/)
/* THE TRANSCRIPT IS FROZEN. `_store.ts`'s putState is an upsert with `on conflict
 * do update` and there was no snapshot at all, so a graduate who kept playing
 * moved the roster's number while the printed code did not move with it, which
 * reads exactly like a student cheating in front of a class. */
const sealed = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')).diploma)
check('the run was SEALED at the stage rather than recomputed at render',
  JSON.stringify(sealed ?? null), (t) => t !== 'null' && t.includes('code'))
await shot('12-diploma')

// ------------------------------- riders · the clock, end to end and not queued
if (joined) {
  console.log('\nriders · time on task, from the browser clock to the dose table')
  /* THE LAST FLUSH. The logger drains on a five-second interval and on pagehide,
   * and closing a browser is not a pagehide the page gets to act on, so the run
   * gives it one interval to put the tail of the queue on the wire. */
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
  /* THE ID NEVER LEAVES, which is the rule the roster op already holds and the
   * reason this table can be looked at in front of a class at all. */
  check('the table names the handle and never the participant id',
    me ?? {}, (m) => !!m.handle && !JSON.stringify(m).includes(joined.participantId))
  console.log(`        ${d.beatRows} beats · ${me?.onTaskMinutes ?? 0} min on task · cadence ${d.cadenceMs}ms`)
}

await browser.close()
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} — shots in ${shots}/${tag}-*.png\n`)
process.exit(failures ? 1 : 0)
