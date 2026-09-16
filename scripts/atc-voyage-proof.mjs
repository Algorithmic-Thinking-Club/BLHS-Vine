/* the whole road to the ATC island and back: `node scripts/atc-voyage-proof.mjs`, or `--live` against the deploy; the year sheet offers the voyage, she crosses on her own, the far end is atc-1 with the island's Python running and graded, and sailing home ends in the Maw so the year can close */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const said = (t) => t.join(' | ')
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

/* a student standing in the Maw with the year planned: Advisory sat, both classes graded, football counted, and ATC the one pick still owed */
const save = (() => {
  const s = STAMPED()
  s.ledger = [
    { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 1, grade: 3.2, year: 1, season: 'Fall' },
    { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 1, grade: 3.9, year: 1, season: 'Winter' },
  ]
  s.completions = [{ programme: 'football', year: 1, grade: 3, at: 1, attempts: 1, firstGrade: 3 }]
  /* the opening is behind him: without these flags the Maw plays its whole rail film on load and holds the controls for a minute and a half, and a student reaching a first voyage has already been through it */
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
/* the corner is chrome and the harness filters it out on purpose, so the plaque cannot be pressed by text, and it opens through the same word an island would use */
const openUi = async (ui) => page.evaluate((u) => window.__intent({ kind: 'open', ui: u }), ui)
/* wait on his own dock until the ship is offered, then take her */
const boardHer = async () => {
  const at = await until((s) => s.map?.travel?.leg === 'boarding', { ms: 60000, every: 500 })
  if (at.map?.travel?.leg !== 'boarding') { say('NOBODY EVER REACHED THE DOCK'); return false }
  await page.keyboard.down('e'); await page.waitForTimeout(140); await page.keyboard.up('e')
  await until((s) => s.map?.hull === true, { ms: 15000, every: 300 })
  return true
}
await openUi('planner')
v = await until((s) => s.press.some((e) => /Sail (to|there)/i.test(e.text)), { ms: 12000 })
await shot('02-the-year-sheet')
const sailBtn = v.press.find((e) => /Sail (to|there)/i.test(e.text))
/* the name is on the card and the press is under it, which is two checks and was one: the sign is 171px and a button repeating 'Sail to Algorithmic Thinking Club' needs 254, so it overflowed */
ok('the year sheet names the club', /Algorithmic Thinking Club/i.test(said(v.texts)), said(v.texts).slice(0, 160))
ok('and offers the voyage under it', !!sailBtn, sailBtn ? sailBtn.text : 'nothing to press')

/* ---- 2 and 3. she casts off and puts in at ATC ----------------------------- */
await pressText(/Sail (to|there)/i)
/* the button no longer sails anybody anywhere on its own, it carries him to his own dock and waits for E; `sail-machine-proof.mjs` checks each beat of that, here it is only the road to the island */
await boardHer()
const there = await until((s) => s.map && s.map.map === 'atc-1' && !s.map.hull, { ms: 120000, every: 700 })
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
/* one rule now: an instruction goes into the next empty step and pressing a step takes it back out, so pressing the card and then the step fills it and empties it again; `atc-quiz-proof.mjs` exercises the ways a person gets it wrong, here it just has to be answered */
for (const label of WANT) {
  await page.evaluate((t) => {
    const c = [...document.querySelectorAll('.bt-card')].find((x) => x.textContent.trim() === t)
    if (c) c.click()
  }, label)
  await page.waitForTimeout(200)
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
/* home is the chart, the one control a student has for it: the pin for the home island with 'Sail here' on it */
await openUi('chart')
await page.waitForTimeout(1600)
v = await look()
await shot('07b-the-chart')
const pins = v.press.filter((e) => /Sail here/i.test(e.text))
say(`  chart offers ${pins.length} place(s) to sail to`)
ok('the chart offers somewhere to sail from ATC', pins.length > 0,
  JSON.stringify(v.press.map((e) => e.text).slice(0, 10)))
/* the hub and not whichever pin is first: the chart lists this island too and sailing to where you are standing is refused, so picking blind proved nothing */
const home = v.press.find((e) => /Sail to The Hub/i.test(e.text))
  ?? pins.find((e) => /Hub/i.test(e.text)) ?? pins[0]
if (home) await page.mouse.click(home.box.x + home.box.w / 2, home.box.y + home.box.h / 2)
await boardHer()
const back = await until((s) => s.map && (s.map.map === 'panther-maw' || s.map.map === 'hub') && !s.map.hull,
  { ms: 120000, every: 700 })
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
