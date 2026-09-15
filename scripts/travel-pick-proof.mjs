/* travel checked in a live browser: a pick with an island reads "Sail to <name>" and sails behind the bars, one without reads "Go"; it reads the page through `window.__pmap`, never the code */
import { chromium } from 'playwright'
import fs from 'node:fs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const SHOTS = arg('shots', 'reference/_archive/build-shots/travel')
fs.mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const ok = (item, what, good, detail = '') => {
  if (good) { pass++; console.log(`  ok   ${item}  ${what}${detail ? '  ' + detail : ''}`) }
  else { fails.push(`${item}  ${what}${detail ? '  ' + detail : ''}`); console.log(`  FAIL ${item}  ${what}${detail ? '  ' + detail : ''}`) }
}

/* a student who has been handed the room and has a year on the sheet: founding flag and vignette set, the plan stamped with two classes and one club, Advisory sat */
const SAVE = {
  v: 2, id: 'r_travel', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: {
    1: { slots: { Fall: 'football' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true },
  },
  /* `maw:railed` is what says the opening has been watched, because `island.py` gates on it and not on the founding flag, so without it the room replays the whole film */
  flags: ['maw:founding', 'maw:railed', 'maw:wall_shown', 'vignette:y1', 'chart:granted', 'handbook:granted'],
  tokens: ['Winter', 'Spring'],
  ledger: [{ id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5, grade: 4, year: 1, season: 'Fall', attempts: 1, firstGrade: 4 }],
  ranks: {}, islands: {}, exposure: [], completions: [], stickers: [], facts: [], badges: [],
  savedAt: Date.now(),
}

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') })

async function open(url, save = SAVE) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  page.on('console', (m) => {
    const t = m.text()
    if (/\[travel\]|\[pmap\].*sail|voyage/i.test(t)) console.log(`      · ${t}`)
  })
  await page.addInitScript((s) => {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.removeItem('blhs_seen_v1')
  }, save)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__pmap, null, { timeout: 120000 })
  return page
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* wait until a predicate run in the page comes back true, or give up saying so */
async function until(page, fn, ms = 30000, step = 200) {
  const t0 = Date.now()
  for (;;) {
    let v = false
    try { v = await page.evaluate(fn) } catch { /* the scene is being rebuilt */ }
    if (v) return true
    if (Date.now() - t0 > ms) return false
    await wait(step)
  }
}

const readSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2') || 'null'))
const mapOf = (page) => page.evaluate(() => window.__pmap?.map ?? null)

console.log(`\ntravel + picks, against ${base}\n`)

/* ==== 4: ONE BUTTON PER PICK ============================================== */
{
  console.log('4  one button per pick, and the roster decides')
  const page = await open(`${base}/?scene=pmap&deep=1&world=local&map=panther-maw`)
  await until(page, () => !!window.__pmap?.island?.started, 25000)
  await wait(1200)

  /* the bar names the first pick, which is the class he has not sat */
  const bar = await page.evaluate(() => document.querySelector('.ob-live')?.textContent?.trim() ?? '')
  ok('4.1', 'the bar names the first pick', /AP Human Geography/i.test(bar), JSON.stringify(bar))

  /* open My Year off the corner, the way a student does */
  await page.click('[data-tour="my-year"]')
  await until(page, () => !!document.querySelector('.pl-sheet, .pl-root, [class*="pl-"]'), 8000)
  await wait(500)
  await page.screenshot({ path: `${SHOTS}/4-year-sheet.png` })

  const buttons = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.pl-class')]
    return rows.map((r) => ({
      name: r.querySelector('.pl-class-name')?.textContent?.trim() ?? '',
      button: [...r.querySelectorAll('button')].map((b) => b.textContent.trim()).join('|'),
    }))
  })
  console.log('      rows:', JSON.stringify(buttons))
  ok('4.2', 'every pick row has exactly one control',
    buttons.length >= 2 && buttons.every((b) => b.button && !b.button.includes('|')))
  ok('4.3', 'with no island the word is "Go"', buttons.every((b) => /^Go$/i.test(b.button)), buttons.map((b) => b.button).join(', '))
  ok('4.3b', 'and both classes are on the sheet', /Human Geography/.test(JSON.stringify(buttons)) && /Spanish/.test(JSON.stringify(buttons)))

  /* the club he picked has the same one button on its own card */
  /* the picked club carries the same one button wherever the sheet draws it, listed under "After school" when nothing on the roster is playable rather than in a season column */
  const club = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.pl-class, .pl-filled')]
      .map((r) => ({ name: r.querySelector('.pl-class-name, .pl-card-name')?.textContent?.trim() ?? '',
        button: [...r.querySelectorAll('button')].map((b) => b.textContent.trim()) }))
    return rows.find((r) => /Example/i.test(r.name)) ?? null
  })
  ok('4.4', 'the club he picked has one too', !!club && club.button.some((b) => /^Go$/i.test(b)), JSON.stringify(club))

  /* press it: the card, the tick, the wall, and the bar moving on */
  const before = await readSave(page)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.pl-class')].find((r) => /Human Geography/i.test(r.textContent))
    row?.querySelector('button')?.click()
  })
  await wait(900)
  const card = await page.evaluate(() => document.body.innerText)
  ok('4.5', 'the card says it in Ash\'s words', /no island yet\. counted as done/i.test(card))
  await page.screenshot({ path: `${SHOTS}/4-counted.png` })

  const after = await readSave(page)
  const row = (after?.ledger ?? []).find((e) => e.id === 'class:ap-human-geo')
  ok('4.6', 'the pick is on the ledger', !!row, JSON.stringify(row ?? null))
  ok('4.7', 'and it was not there before', !(before?.ledger ?? []).some((e) => e.id === 'class:ap-human-geo'))

  await wait(1400)
  const bar2 = await page.evaluate(() => document.querySelector('.ob-live')?.textContent?.trim() ?? '')
  ok('4.8', 'the bar names the NEXT pick', /Spanish/i.test(bar2), JSON.stringify(bar2))

  /* the trophy wall lives on the year sheet's own foot, not as a plaque in the corner, because five signs up there read as a toolbar of ugly buttons */
  /* pressing a pick shuts the sheet, so it is opened again the way a student would, through the corner then the plank on the sheet's own foot */
  await page.click('[data-tour="my-year"]')
  await until(page, () => !!document.querySelector('.pl-mine'), 8000)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => /your trophy wall/i.test(e.innerText))
    b?.click()
  })
  await until(page, () => !!document.querySelector('.tw-sheet'), 8000)
  await wait(2400)
  await page.screenshot({ path: `${SHOTS}/4-wall.png` })
  const wall = await page.evaluate(() => ({
    frames: document.querySelectorAll('.tw-frame').length,
    full: document.querySelectorAll('.tw-frame-full').length,
    text: document.querySelector('.tw-sheet')?.innerText ?? '',
  }))
  ok('4.9', 'the wall has a frame for every pick plus Advisory', wall.frames === 4, `${wall.frames}`)
  ok('4.10', 'and the counted pick filled its frame', wall.full >= 2, `${wall.full} filled`)
  ok('4.11', 'the wall is reachable from the year sheet at all', /trophy wall/i.test(wall.text))
  await page.close()
}

/* ==== 3: TRAVEL =========================================================== */
{
  console.log('\n3  travel, the whole thing')
  /* runs on the published world because the built-in composition holds one island, so the only pin is the place already stood in, which the engine refuses as a door rather than a voyage; sections 1, 2 and 3b keep the local one and only need the chart's drawing and the skip */
  /* the club has to be on the year sheet, because without it the ATC island is drawn misty with no control on it and the only pressable pin is the island being stood in */
  const page = await open(`${base}/?scene=pmap&deep=1&map=panther-maw`, {
    ...SAVE,
    plans: { 1: { slots: { Fall: 'football', Winter: 'atc' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
    tokens: ['Spring'],
  })
  await until(page, () => !!window.__pmap?.island?.started, 25000)
  await wait(1200)

  /* the chart opens off the corner and is drawn to the real world */
  await page.click('[data-tour="map"]')
  await until(page, () => !!document.querySelector('.ch-chart'), 10000)
  await wait(700)
  await page.screenshot({ path: `${SHOTS}/3-chart.png` })
  const chart = await page.evaluate(() => ({
    isles: document.querySelectorAll('.ch-isle').length,
    /* picks that are not places are rows in the register and not pins: class names and an example club pinned to the water with "no island yet" under them made the chart a course catalogue */
    picks: document.querySelectorAll('.ch-row-owed').length,
    go: document.querySelectorAll('.ch-isle-go').length,
    text: document.querySelector('.ch-chart')?.innerText ?? '',
  }))
  console.log('      chart:', JSON.stringify({ ...chart, text: undefined }))
  ok('3.1', 'the chart draws the real world', chart.isles >= 2, `${chart.isles} marks`)
  ok('3.2', 'and his own picks are on it', chart.picks >= 1, `${chart.picks} picked`)
  ok('3.3', 'and there is somewhere to sail from inside the Maw', chart.go >= 1, `${chart.go} sailable`)

  /* press one and the whole journey runs: bars, a map change, ashore */
  /* presses the island by name, not whichever is first: a picked club makes more islands sailable and the first became the one being stood on, which is refused and proves nothing */
  const target = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.ch-isle-go')]
    const named = (b) => b.querySelector('.ch-name')?.textContent?.trim() ?? ''
    const b = all.find((x) => /algorith|thinking|club/i.test(named(x)))
      ?? all.find((x) => !/hub|bonney/i.test(named(x)))
      ?? all[0]
    const name = b ? named(b) : ''
    b?.click()
    return name
  })
  console.log(`      sailing to ${target}`)
  const barsUp = await until(page, () => document.documentElement.dataset.movie === '1', 8000)
  ok('3.4', 'the bars go up', barsUp)
  const skip = await until(page, () => !!document.querySelector('.sv-skip'), 8000)
  ok('3.5', 'the skip plaque sits over the crossing', skip)
  if (skip) {
    const at = await page.evaluate(() => {
      const r = document.querySelector('.sv-skip').getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), text: document.querySelector('.sv-skip').textContent }
    })
    /* the plaque has to clear the movie bars: they are 10vh each, so at 14px it draws under the top one and the offer is invisible on every game-arm crossing */
    const bar = await page.evaluate(() => Math.round(window.innerHeight * 0.1))
    ok('3.6', 'top left, and it says what the key is', at.left < 200 && at.top < 260 && /esc/i.test(at.text), JSON.stringify(at))
    ok('3.6b', 'and it clears the movie bar rather than hiding under it', at.top >= bar, `top ${at.top} against a ${bar}px bar`)
  }
  await page.screenshot({ path: `${SHOTS}/3-crossing.png` })

  /* a pick on the chart carries the player to their own quay and waits there for E to board */
  await board(page)
  const left = await until(page, () => {
    const m = window.__pmap?.map
    return typeof m === 'string' && m !== 'panther-maw'
  }, 60000)
  ok('3.7', 'the map really changes', left, `${await mapOf(page)}`)

  /* ashore means the bars are down, there is no hull underneath, and the scene answering is the one sailed to */
  const ashore = await until(page, () => {
    const m = window.__pmap?.map
    return typeof m === 'string' && m !== 'panther-maw'
      && !window.__pmap?.hull
      && document.documentElement.dataset.movie !== '1'
  }, 90000)
  ok('3.8', 'and he ends up standing on it, bars down', ashore, `${await mapOf(page)}`)
  await wait(1200)
  await page.screenshot({ path: `${SHOTS}/3-ashore.png` })
  await page.close()
}

/* waits on the home dock until the ship is offered, then takes her, which is the one press a person makes on a journey they asked for */
async function board(page) {
  for (let i = 0; i < 100; i++) {
    const leg = await page.evaluate(() => { try { return window.__pmap?.travel?.leg ?? null } catch { return null } })
    if (leg === 'boarding') {
      await page.locator('canvas').first().focus().catch(() => {})
      await page.keyboard.press('e')
      await wait(600)
      return true
    }
    if (leg === 'crossing' || leg === 'landing') return true
    await wait(400)
  }
  return false
}

/* ==== 3b: ESC LANDS HIM AT THE DOCK ====================================== */
{
  console.log('\n3b esc lands him at the destination dock')
  const page = await open(`${base}/?scene=pmap&deep=1&world=local&map=panther-maw`)
  await until(page, () => !!window.__pmap?.island?.started, 25000)
  await wait(1200)
  const armed = await page.evaluate(async () => {
    const r = await window.__intent({ kind: 'sail_to', map: 'castaway' })
    return r
  })
  ok('3.9', 'sail_to is a word the engine answers', armed?.ok !== false, JSON.stringify(armed))
  await until(page, () => !!document.querySelector('.sv-skip'), 10000)
  /* this is the skip, so she has to be under way first: pressed on the dock the same key calls the journey off, which `sail-machine-proof.mjs` checks instead */
  /* before she moves the plaque reads "Esc: not just now" and Escape calls the journey off; under way it reads "Esc: skip ahead" and Escape lands at the far dock, and the wrong one showing is a key that does something else */
  const onDock = await page.evaluate(() => document.querySelector('.sv-skip')?.textContent ?? '')
  ok('3.9b', 'on the dock the plaque offers to call it off', /not just now/i.test(onDock), JSON.stringify(onDock))
  await board(page)
  /* the key first and then the plaque, which is the same offer for a student on a trackpad who has never pressed Escape */
  await page.locator('canvas').first().focus().catch(() => {})
  await page.keyboard.press('Escape')
  /* watched, not sampled once: the word changes on the frame the key lands and the map swaps a moment later, so a single read a half second in is a coin toss */
  let said = ''
  for (let i = 0; i < 20; i++) {
    said = await page.evaluate(() => document.querySelector('.sv-skip')?.textContent ?? '')
    if (/arriving/i.test(said)) break
    await wait(200)
  }
  ok('3.10', 'Escape is heard', /arriving/i.test(said), JSON.stringify(said))
  const there = await until(page, () => window.__pmap?.map === 'castaway', 60000)
  ok('3.11', 'and he is put ashore on the far island', there, `${await mapOf(page)}`)
  await wait(1200)
  await page.screenshot({ path: `${SHOTS}/3-skipped.png` })
  const onFoot = await page.evaluate(() => !window.__pmap?.hull)
  ok('3.12', 'on foot, not still in the boat', onFoot)
  await page.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL ${f}`)
console.log(`shots in ${SHOTS}`)
process.exit(fails.length ? 1 : 0)
