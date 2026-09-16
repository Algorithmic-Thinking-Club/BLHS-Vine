/* drives the published Maw room in a real browser: in the hub door, every station, a handler crashed on purpose, back out. every press goes through `window.__station(name)` and every reading off the DOM, so there is no second code path. node scripts/maw1-proof.mjs <base-url> */
import { chromium } from 'playwright'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const base = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '')
const shots = 'reference/_archive/build-shots/maw1'
mkdirSync(shots, { recursive: true })

let failures = 0
const ok = (name, pass, detail = '') => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${String(detail).slice(0, 200)}` : ''}`)
  if (!pass) failures++
}

/* a run past the intro that has never been in this room: `introDone` mounts the Hud, and without the Hud `open` refuses instead of opening nothing */
const fresh = (over = {}) => ({
  v: 2, id: 'r_maw1', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  /* `flags: []` here makes the room play its whole founding film, so every check about the room introducing itself counts film lines: `maw:founding` and `maw:railed` are what a student who has watched it carries */
  plans: {}, flags: ['maw:founding', 'maw:railed'], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: 1788400000000, ...over,
})

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const noise = []
page.on('pageerror', (e) => { console.log(`  [pageerror] ${e.message}`); failures++ })
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !/Failed to load resource/.test(t)) console.log(`  [console.error] ${t}`)
  if (/\[pmap\]|\[award\]/.test(t)) noise.push(t)
})

const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')))
const line = () => page.textContent('.cs-dialogue-text').catch(() => '')
/* wait on the words, not on `.cs-continue-hint`: the hint is absent while a line is still being typed, absent between two lines while a camera moves, and absent forever if nothing was said, and all three read the same from out here */
const settled = async (ms = 20000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if ((await line()).trim()) {
      await page.waitForSelector('.cs-continue-hint, .dlg-choice', { timeout: 4000 }).catch(() => {})
      return true
    }
    await page.waitForTimeout(200)
  }
  return false
}
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` })
/* click the box on, and tolerate a box that goes away for a beat, because a camera move between two lines is the scene breathing and not the scene ending */
const advance = async () => {
  await settled()
  const said = await line()
  await page.click('.dlg-box').catch(() => {})
  return said
}
const readOut = async (max) => {
  const said = []
  for (let i = 0; i < max; i++) {
    const t = await advance()
    if (t) said.push(t)
    const back = await page.waitForSelector('.cs-dialogue', { timeout: 6000 }).then(() => true).catch(() => false)
    if (!back) break
  }
  return said
}
const openMaw = async (s = fresh(), q = '') => {
  await page.addInitScript((v) => { localStorage.setItem('blhs_save_v2', JSON.stringify(v)) }, s)
  await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw${q}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 90000 })
  /* the first gesture, because a browser makes no sound until one has happened and a proof that never clicks proves silence */
  await page.mouse.click(683, 740)
  return page.waitForFunction(
    () => (window.__pmap?.island?.handlers || []).length > 0, null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
}
/* `fire()` returns "busy" silently, and handlers register before `on_start` has run on the far side of the worker, so a press landing in that window does nothing: retry for 30000 ms, longer than any opening here and short enough that a genuinely stuck room still fails */
const fire = async (name) => {
  const until = Date.now() + 30000
  for (;;) {
    const r = await page.evaluate((n) => window.__station(n), name)
    if (r !== 'busy' || Date.now() > until) return r
    await page.waitForTimeout(300)
  }
}

/* a door has no owner for `__station` to resolve, so press it with the key, held rather than tapped because a keydown and keyup between two frames is a press the ticker's edge test never sees, and retried because the door refuses while it checks what is behind it */
const pressDoor = async (name, to) => {
  const put = await page.evaluate((n) => {
    const a = JSON.parse(window.__anchors()).find((x) => x.name === n)
    if (!a) return null
    for (const [dx, dy] of [[0, 0], [0, 8], [0, 12], [6, 8], [-6, 8], [0, 16], [10, 0], [0, -8]]) {
      if (String(window.__warp(a.x + dx, a.y + dy)).startsWith('ok')) return `${a.x + dx},${a.y + dy}`
    }
    return null
  }, name)
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(700)
    await page.keyboard.down('e')
    await page.waitForTimeout(160)
    await page.keyboard.up('e')
    const went = await page.waitForFunction(
      (m) => window.__pmap && window.__pmap.map === m, to, { timeout: 8000 },
    ).then(() => true).catch(() => false)
    if (went) return put
  }
  return put
}

/* 1 · walking in from the hub door */
console.log('\n1 · in through the tunnel, the way a student arrives')
{
  await page.addInitScript((v) => { localStorage.setItem('blhs_save_v2', JSON.stringify(v)) }, fresh())
  await page.goto(`${base}/?scene=pmap&deep=1&map=hub`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 90000 })
  ok('the hub carries the door into the Maw',
    /panthers_maw/.test(await page.evaluate(() => window.__anchors())))
  /* the anchor sits on a blocked pixel, which is the hub's own repair and not this island's, so the body goes on the ground just below it */
  const stoodAt = await pressDoor('panthers_maw', 'panther-maw')
  ok('there is standable ground inside the hub door ring', !!stoodAt, String(stoodAt))
  const landed = (await page.evaluate(() => window.__pmap.map)) === 'panther-maw'
  ok('pressing the hub door lands in the Maw', landed,
    await page.evaluate(() => window.__pmap.map))
  const claimed = await page.waitForFunction(
    () => (window.__pmap?.island?.handlers || []).length > 0, null, { timeout: 30000 },
  ).then(() => true).catch(() => false)
  ok('the room found its python with no url asking for it', claimed,
    await page.evaluate(() => JSON.stringify(window.__pmap.island.handlers)))
  ok('and it is the six pressable anchors plus start',
    (await page.evaluate(() => window.__pmap.island.handlers.join(','))) ===
    'start,talk:chart_table,talk:counselor,talk:hearth,talk:outfitter,talk:principal_desk,talk:trophy_wall')
}

/* 2 · the arrival: facing as authored, and a room that introduces itself once */
console.log('\n2 · the arrival')
{
  ok('he faces the way the spawn anchor says, not south',
    (await page.evaluate(() => window.__pmap.facing)) === 'south-east',
    await page.evaluate(() => window.__pmap.facing))
  const said = await readOut(4)
  ok('the room says what it is, on the first visit only', said.length === 2, said.join(' / '))
  ok('and the line is the room and not a menu', /Panther's Maw/.test(said[0] ?? ''), said[0])
  await shot('01-arrived')
  const s = await save()
  ok('it remembers it has been walked into, under a bare name',
    (s.flags ?? []).includes('maw:seen'), JSON.stringify(s.flags))
}
{
  /* the fortieth crossing. Same room, same island, a save that has been here. */
  await openMaw(fresh({ flags: ['maw:seen'] }))
  await page.waitForTimeout(2500)
  ok('a second arrival says nothing at all', !(await page.$('.cs-dialogue')))
}

/* 3 · the founding event */
console.log('\n3 · the founding event at the desk')
{
  await openMaw(fresh({ flags: ['maw:seen'] }))
  ok('the desk answers', (await fire('principal_desk')) === 'fired')
  await settled()
  const first = await line()
  ok('the principal speaks', /Bonney Lake High School/.test(first), first)
  ok('and he has a face, which no member could set before tonight',
    await page.evaluate(() => !!document.querySelector('[class*=portrait] img')))
  await shot('02-founding-greeting')

  const said = await readOut(12)
  const tour = said.filter((t) => /fire is Advisory|honor cords|holds your trophies/.test(t))
  ok('the room is pointed out, three stations, one idea each', tour.length === 3, tour.join(' / '))
  ok('the authored cutscene runs on the painted room',
    said.some((t) => /This is the Maw/.test(t)), said.join(' / '))
  await page.waitForTimeout(3500)
  const s = await save()
  ok('and the founding flag lands as the BARE name objective.ts reads',
    (s.flags ?? []).includes('maw:founding'), JSON.stringify(s.flags))
  ok('not under this island\'s programme id', !(s.flags ?? []).some((f) => f.startsWith('the-maw:')))
  await shot('03-founding-done')
}
{
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }))
  await fire('principal_desk')
  await settled()
  const again = await line()
  ok('a second visit is a person who remembers, not the scene again',
    /Back again/.test(again), again)
}

/* 4 · the hearth, both arms */
console.log('\n4 · the fire, and the two arms of the study')
for (const arm of ['game', 'plain']) {
  await openMaw(fresh({ arm, flags: ['maw:seen', 'maw:founding'] }))
  ok(`[${arm}] the fire answers`, (await fire('hearth')) === 'fired')
  await settled()
  ok(`[${arm}] the fire says Advisory is starting`, /Advisory is starting/.test(await line()), await line())
  await page.click('.dlg-box').catch(() => {})
  const up = await page.waitForSelector(arm === 'plain' ? '.bt-plainform' : '.bt-stage', { timeout: 20000 })
    .then(() => true).catch(() => false)
  ok(`[${arm}] the required beat mounts in this arm`, up)
  const head = await page.textContent(arm === 'plain' ? '.bt-plainplace' : '.bt-head').catch(() => '')
  ok(`[${arm}] and it is THIS year's beat, asked for rather than spelled`,
    /Advisory/.test(head), head)
  await shot(`04-hearth-${arm}`)
}
{
  /* the year is already sat, and the station has to know that without ever seeing the ledger, which is the whole reason `get("advisory")` exists */
  await openMaw(fresh({
    flags: ['maw:seen', 'maw:founding'],
    ledger: [{ id: 'core:y1', title: 'This is the place', kind: 'core', credit: 0.5, grade: 3.4, year: 1, season: 'Fall' }],
  }))
  await fire('hearth')
  await settled()
  const banked = await line()
  ok('a fire already sat at this year says so, and is not run twice', /done for this year/.test(banked), banked)
  await page.waitForTimeout(1200)
  ok('and nothing mounted a second beat', !(await page.$('.bt-stage, .bt-plainform')))
}

/* 5 · the counselor, off the live table */
console.log('\n5 · the counselor')
{
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }))
  ok('the counselor answers', (await fire('counselor')) === 'fired')
  await settled()
  ok('nothing earned yet, and she says so', /No cord started yet/.test(await line()), await line())
  await page.click('.dlg-box').catch(() => {})
  const asked = await page.waitForSelector('.dlg-choice', { timeout: 20000 })
    .then(() => true).catch(() => false)
  ok('and she asks a question', asked)
  const opts = asked ? await page.$$eval('.dlg-choice', (b) => b.map((x) => x.textContent.trim())) : []
  ok('and offers the Handbook', /Open the Handbook/.test(opts.join(' | ')), opts.join(' | '))
  if (asked) await page.click('.dlg-choice:nth-child(1)')
  ok('which opens the Handbook', asked && await page.waitForSelector('.hb-book', { timeout: 15000 })
    .then(() => true).catch(() => false))
  await shot('05-counselor-empty')
}
{
  /* a run four AP classes in: the cord named and the numbers said have to be progress.ts's own, not this island's arithmetic */
  const ap = (n) => Array.from({ length: n }, (_, i) => ({
    id: `class:ap-${i}`, title: `AP ${i}`, kind: 'class', credit: 1, grade: 3.5,
    year: 1, season: 'Fall', tags: ['ap'],
  }))
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'], ledger: ap(3) }))
  await fire('counselor')
  await settled()
  const first = await line()
  ok('a run with progress gets a different sentence', !/No cord started yet/.test(first), first)
  ok('and it is the live detail string the tracker prints', /\d+ of \d+/.test(first), first)
  await shot('06-counselor-live')
}

/* 6 · the panels, the chart table and the outfitter */
console.log('\n6 · the two panels')
{
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }))
  ok('the chart table answers', (await fire('chart_table')) === 'fired')
  await settled()
  ok('the table says what it is before it opens', /year sheet/.test(await line()), await line())
  await page.click('.dlg-box').catch(() => {})
  ok('the year sheet opens', await page.waitForSelector('.pl-sheet', { timeout: 15000 })
    .then(() => true).catch(() => false))
  const tok = await page.$$('.pl-token, [class*=token]')
  ok('with the season tokens on it, which are the mechanic', tok.length > 0, `${tok.length} found`)
  await shot('07-chart-table')
}
{
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }))
  ok('the outfitter answers', (await fire('outfitter')) === 'fired')
  await settled()
  await page.click('.dlg-box').catch(() => {})
  ok('the wardrobe opens', await page.waitForSelector('.wd-body', { timeout: 15000 })
    .then(() => true).catch(() => false))
  await shot('08-outfitter')
}

/* 7 · the trophy wall */
console.log('\n7 · the wall')
{
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }))
  /* read the shelf before anything is pressed, the one state it could not fail in: a placement is drawn from the first frame, so a first year with nothing earned walked in to a full trophy case and watched it vanish on E */
  await page.waitForFunction(
    () => window.__pmap && window.__pmap.shown.the_trophy_wall === false,
    null, { timeout: 20000 },
  ).then(() => true).catch(() => false)
  ok('an empty run walks in to a wall with no shelf, before pressing anything',
    (await page.evaluate(() => window.__pmap.shown.the_trophy_wall)) === false,
    JSON.stringify(await page.evaluate(() => window.__pmap.shown)))
  ok('the empty wall answers', (await fire('trophy_wall')) === 'fired')
  await settled()
  ok('an empty wall says it is empty', /trophy wall is empty/.test(await line()), await line())
  /* the line comes first and the picture second: `show` is a hard refusal on a bundle whose trophy_wall is not bound to a placement and takes the rest of the handler with it, so the sentence is said where it cannot be lost and the shelf has not moved yet here */
  await page.click('.dlg-box').catch(() => {})
  await page.waitForTimeout(900)
  ok('and the drawn shelf is not on it yet',
    (await page.evaluate(() => window.__pmap.shown.the_trophy_wall)) === false,
    JSON.stringify(await page.evaluate(() => window.__pmap.shown)))
  await shot('09-wall-empty')
}
{
  await openMaw(fresh({
    flags: ['maw:seen', 'maw:founding'], stickers: ['first-voyage', 'key-club'], badges: ['resident'],
  }))
  await page.waitForTimeout(2500)
  ok('and a run with three things walks in to the shelf already there',
    (await page.evaluate(() => window.__pmap.shown.the_trophy_wall)) === true,
    JSON.stringify(await page.evaluate(() => window.__pmap.shown)))
  ok('the wall answers', (await fire('trophy_wall')) === 'fired')
  await settled()
  const full = await line()
  ok('a wall with three things on it counts them', /^3 trophies on the wall/.test(full), full)
  await page.click('.dlg-box').catch(() => {})
  await page.waitForTimeout(900)
  ok('and the shelf is shown, which is `show` against a named placement',
    (await page.evaluate(() => window.__pmap.shown.the_trophy_wall)) === true)
  await shot('10-wall-filled')
}

/* 8 · a handler that crashes, and a room that does not */
console.log('\n8 · crashing a handler on purpose')
{
  /* the same island with one line broken, in a folder this script makes and removes, because breaking the shipped file would prove something about a file nobody ships */
  const from = 'public/grapes/panther-maw'
  /* both roots: `vite` serves `public/` off disk and `vite preview` serves the built `dist/`, so a fixture written to one is a 404 on the other. the name must be a slug, `[a-z0-9]+(-[a-z0-9]+)*`, or `islandIdOf` refuses it before a byte is fetched */
  const roots = ['public/grapes/maw-crash', ...(existsSync('dist/grapes') ? ['dist/grapes/maw-crash'] : [])]
  for (const to of roots) {
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true })
    /* break a line that exists exactly once and in the handler under test: `String.replace` takes the first match, and `trophies = yield get("trophies")` appears twice, so the crash landed in `on_start` and a working island read as broken */
    const src = readFileSync(`${to}/island.py`, 'utf8')
    const target = '    count = on_the_wall(trophies)'
    if (src.split(target).length !== 2) {
      throw new Error(`the crash fixture cannot find exactly one "${target}" to break`)
    }
    writeFileSync(`${to}/island.py`, src.replace(target, '    count = 1 + "a deliberate crash"'))
  }
  try {
    await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }),
      `&grape=${encodeURIComponent(`${base}/grapes/maw-crash/`)}`)
    /* an island loaded with `?grape=` is scoped, its flags stamped with its own programme id, so `maw:seen` is invisible to it and the arrival plays again and has to be clicked through first. the shipped path is unscoped */
    /* click through until the box is actually gone rather than a fixed number of advances: `readOut` leaves whatever is behind its line on screen, and a dialogue still up holds the world, so the next press comes back busy */
    for (let i = 0; i < 8; i++) {
      if (!(await page.$('.cs-dialogue'))) break
      await page.waitForTimeout(900)
      await page.click('.dlg-box').catch(() => {})
    }
    ok('the arrival is out of the way before the crash', !(await page.$('.cs-dialogue')))
    noise.length = 0
    const fired = await fire('trophy_wall')
    ok('the broken station was actually pressed', fired === 'fired', String(fired))
    await page.waitForTimeout(3000)
    ok('the crash is reported with the member\'s own error',
      noise.some((t) => /unsupported types|__add__|str/.test(t)),
      noise.slice(-4).join(' | ').slice(0, 300) || '(nothing on the console)')
    ok('the map is still up', (await page.evaluate(() => window.__pmap.map)) === 'panther-maw')
    const before = await page.evaluate(() => `${Math.round(window.__pmap.x)},${Math.round(window.__pmap.y)}`)
    await page.keyboard.down('a'); await page.waitForTimeout(900); await page.keyboard.up('a')
    ok('the controls came back', before !== await page.evaluate(() => `${Math.round(window.__pmap.x)},${Math.round(window.__pmap.y)}`))
    ok('another station in the same island still answers', (await fire('counselor')) === 'fired')
    await settled()
    ok('and it speaks', /No cord started yet/.test(await line()))
    await shot('11-crash-survived')
  } finally {
    for (const to of roots) rmSync(to, { recursive: true, force: true })
  }
}

/* 9 · walking out */
console.log('\n9 · back out through the tunnel')
{
  await openMaw(fresh({ flags: ['maw:seen', 'maw:founding'] }))
  ok('the way out is a door and nothing in the island claims it',
    !(await page.evaluate(() => window.__pmap.island.handlers.includes('talk:maw_entrance'))))
  const stood = await pressDoor('maw_entrance', 'hub')
  ok('there is standable ground inside the tunnel door ring', !!stood, String(stood))
  ok('and it puts the player back on the hub',
    (await page.evaluate(() => window.__pmap.map)) === 'hub',
    await page.evaluate(() => window.__pmap.map))
  await shot('12-back-on-the-hub')
}

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`)
await browser.close()
process.exit(failures ? 1 : 0)
