/* THE WHOLE ROAD TO ATC AND BACK, which is the thing that has never happened.
 *
 *   node scripts/atc-voyage-proof.mjs           against the dev server
 *   node scripts/atc-voyage-proof.mjs --live    against the deploy
 *
 * Travel was proved on the castaway stand-in with nothing at the far end. This is
 * the first time a student picks a real club on the year sheet, sails there, does
 * the thing, and comes home with it on their transcript:
 *
 *   1  the year sheet's own button reads "Sail to the Algorithmic Thinking Club"
 *   2  pressing it casts off and the ship crosses on her own
 *   3  the far end is atc-1, ashore, with the island's Python running
 *   4  the activity is played and graded
 *   5  sailing home ends inside the Panther's Maw
 *   6  the year can close, because the voyage is finished
 */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const said = (t) => t.join(' | ')
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

/* a student standing in the Maw with the year planned: Advisory sat, both classes
 * graded, football counted, and ATC the one pick still owed */
const save = (() => {
  const s = STAMPED()
  s.ledger = [
    { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 1, grade: 3.2, year: 1, season: 'Fall' },
    { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 1, grade: 3.9, year: 1, season: 'Winter' },
  ]
  s.completions = [{ programme: 'football', year: 1, grade: 3, at: 1, attempts: 1, firstGrade: 3 }]
  /* THE OPENING IS BEHIND HIM. Without these the Maw plays its whole rail film on
   * load, the controls are held for a minute and a half, and the proof spends its
   * budget clicking through an orientation instead of sailing. A student reaching
   * their first voyage has been through it. */
  s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
  return s
})()

const h = await boot('atc-voyage', {
  save,
  url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
  dir: 'reference/_archive/build-shots/atc-voyage',
})
const { page, say, shot, look, state, pressText, until, finish } = h

await page.waitForTimeout(live ? 9000 : 6000)
let v = await state('in the maw')
await shot('01-in-the-maw')

/* ---- 1. the sheet names the voyage ---------------------------------------- */
/* THE CORNER IS CHROME AND THE HARNESS FILTERS IT OUT ON PURPOSE, so the plaque
 * cannot be pressed by text. Opened through the same word an island would use. */
const openUi = async (ui) => page.evaluate((u) => window.__intent({ kind: 'open', ui: u }), ui)
await openUi('planner')
v = await until((s) => s.press.some((e) => /Sail (to|there)/i.test(e.text)), { ms: 12000 })
await shot('02-the-year-sheet')
const sailBtn = v.press.find((e) => /Sail (to|there)/i.test(e.text))
/* THE NAME IS ON THE CARD AND THE PRESS IS UNDER IT, which is two checks and was
 * one. The button used to repeat the club's name and that is what overflowed it:
 * the sign is 171px and "Sail to Algorithmic Thinking Club" needs 254. What the
 * sheet has to do is name the club and offer the voyage, and it still does both. */
ok('the year sheet names the club', /Algorithmic Thinking Club/i.test(said(v.texts)), said(v.texts).slice(0, 160))
ok('and offers the voyage under it', !!sailBtn, sailBtn ? sailBtn.text : 'nothing to press')

/* ---- 2 and 3. she casts off and puts in at ATC ----------------------------- */
await pressText(/Sail (to|there)/i)
const there = await until((s) => s.map && s.map.map === 'atc-1' && !s.map.hull, { ms: 90000, every: 700 })
await shot('03-ashore-at-atc')
ok('the crossing lands at the ATC island',
  !!there.map && there.map.map === 'atc-1', there.map ? `${there.map.map} hull=${there.map.hull}` : 'no map')
ok('he is off the boat and on the island', !!there.map && !there.map.hull, JSON.stringify(there.map))

/* the island's own python is what greets him, not the engine */
const island = await page.evaluate(() => {
  try { return window.__pmap.island } catch { return null }
})
ok('the island\'s python is loaded and claims its anchors',
  !!island && island.handlers.length >= 3, JSON.stringify(island))

/* ---- 4. the activity ------------------------------------------------------- */
const press = async (a) => page.evaluate((n) => window.__station(n), a)
const settle = async (ms = 25000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const busy = await page.evaluate(() => (window.__pmap ? window.__pmap.island.busy : false))
    if (!busy) return true
    await page.mouse.click(683, 640)
    await page.waitForTimeout(400)
  }
  return false
}
const drive = async (stop, ms = 45000) => {
  const seen = []
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = await look()
    for (const t of s.texts) if (!seen.includes(t)) seen.push(t)
    if (stop(s, seen)) return { seen, hit: true }
    const btn = s.press.find((e) => /(^|\s)Sure$/i.test(e.text))
    if (btn) await page.mouse.click(btn.box.x + btn.box.w / 2, btn.box.y + btn.box.h / 2)
    else await page.mouse.click(683, 640)
    await page.waitForTimeout(450)
  }
  return { seen, hit: false }
}

await press('host')
const talk = await drive((s) => !!s.press.find((e) => /^RUN$/i.test(e.text)))
await shot('04-the-screen')
ok('the president meets him and opens the machine', talk.hit, said(talk.seen).slice(-180))

const WANT = ['forward 2', 'turn left', 'forward 3', 'turn right', 'forward 3']
for (let i = 0; i < WANT.length; i++) {
  await page.evaluate((label) => {
    const c = [...document.querySelectorAll('.bt-card')].find((x) => x.textContent.trim() === label)
    if (c) c.click()
  }, WANT[i])
  await page.waitForTimeout(150)
  await page.evaluate((slot) => {
    const w = [...document.querySelectorAll('.bt-slotwell')]
    if (w[slot]) w[slot].click()
  }, i)
  await page.waitForTimeout(180)
}
await pressText(/^RUN$/i)
await until((s) => said(s.texts).includes('reached the flag'), { ms: 15000 })
await shot('05-it-ran')
await pressText(/Keep going/i)
await page.waitForTimeout(900)
await pressText(/Show up after school/i)
await page.waitForTimeout(700)
await pressText(/Keep going/i)
await page.waitForTimeout(1600)
await shot('06-result')
await pressText(/Back to the game|Back|Done/i)
await page.waitForTimeout(1500)
await settle()

const afterIsland = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('blhs_save_v2') || 'null')
  return s ? { completions: s.completions.map((c) => c.programme), islands: s.islands, stickers: s.stickers } : null
})
ok('ATC is finished and on the record',
  !!afterIsland && afterIsland.completions.includes('atc'), JSON.stringify(afterIsland))

/* ---- 5. home ---------------------------------------------------------------- */
await shot('07-before-sailing-home')
/* HOME IS THE CHART, which is the one control a student has for it: the pin for
 * the home island with "Sail here" on it. */
await openUi('chart')
await page.waitForTimeout(1600)
v = await look()
await shot('07b-the-chart')
const pins = v.press.filter((e) => /Sail here/i.test(e.text))
say(`  chart offers ${pins.length} place(s) to sail to`)
ok('the chart offers somewhere to sail from ATC', pins.length > 0,
  JSON.stringify(v.press.map((e) => e.text).slice(0, 10)))
if (pins.length) await page.mouse.click(pins[0].box.x + pins[0].box.w / 2, pins[0].box.y + pins[0].box.h / 2)
const back = await until((s) => s.map && (s.map.map === 'panther-maw' || s.map.map === 'hub') && !s.map.hull,
  { ms: 90000, every: 700 })
await shot('08-home')
ok('sailing home lands back at the home island',
  !!back.map && ['panther-maw', 'hub'].includes(back.map.map), back.map ? back.map.map : 'no map')

/* ---- 6. the year can close -------------------------------------------------- */
const closing = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('blhs_save_v2') || 'null')
  return s ? { ledger: s.ledger.map((e) => e.id), completions: s.completions.map((c) => c.programme) } : null
})
say(`  ${JSON.stringify(closing)}`)
ok('both picks are finished, so nothing holds the year open',
  !!closing && closing.completions.includes('atc') && closing.completions.includes('football'),
  JSON.stringify(closing?.completions))

console.log(`\n${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
await finish()
process.exit(fails.length ? 1 : 0)
