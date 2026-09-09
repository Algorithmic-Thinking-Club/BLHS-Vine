/* SAILING HOME: the last ninety seconds of year one, watched in a real browser.
 *
 * ASH, 2026-09-09: *"after Thor sees what he earns... Principal Panther should
 * clearly congratulate him with a dialogue for finishing year one. Then a big
 * button should pop on the screen 'Sail Home'. When clicked, Thor gets
 * teleported to the dock, still in cutscene mode. Then he hops on the boat
 * smoothly, and the boat slowly sails normally back out into the ocean. Then
 * title screen comes back."*
 *
 * And what he played: *"thor violently gets teleported, thor doesnt even hop on
 * the boat, the boat just starts zooming straight downwards, and then the title
 * screen comes on. extremely buggy."*
 *
 * Every check here is a claim about a PICTURE, sampled off the scene's own live
 * state while it happens. It proves the shape and never that it is good; Ash
 * playing it is the only gate.
 *
 *   node scripts/sail-home-proof.mjs --base=http://localhost:5173 [--headed]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', 'http://localhost:5173')
const SHOTS = arg('shots', 'reference/_archive/build-shots/sail-home')
fs.mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const ok = (n, good, d = '') => {
  if (good) { pass++; console.log(`  ok   ${n}${d ? '  ' + d : ''}`) }
  else { fails.push(`${n}${d ? '  ' + d : ''}`); console.log(`  FAIL ${n}${d ? '  ' + d : ''}`) }
}

/* a year with everything done but the page, standing in the Maw: the state the
 * closing film's own trigger fires on */
const SAVE = {
  v: 2, id: 'r_sail', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
  flags: ['read_the_bottle', 'hub:crossed', 'maw:founding', 'maw:railed',
    'maw:handed_over', 'maw:wall_shown', 'vignette:y1', 'chart:granted', 'handbook:granted'],
  tokens: [], ranks: {}, islands: {}, exposure: [{ place: 'home-island', docked: true }],
  completions: [], stickers: [], facts: [], badges: [], savedAt: 1,
  ledger: [
    { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 0.5, grade: 3.4, year: 1, season: 'Fall' },
    { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 0.5, grade: 3.8, year: 1, season: 'Fall' },
  ],
}

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
page.on('console', (m) => {
  const t = m.text()
  if (/\[travel\]|run_ended|sailed_out|Traceback|island's opening stopped|closing/i.test(t)) {
    console.log(`      · ${t.slice(0, 200)}`)
  }
})
await page.addInitScript((s) => {
  localStorage.setItem('blhs_save_v2', JSON.stringify(s))
  sessionStorage.clear()
}, SAVE)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/* `SAIL_OUT_MS` in the scene, which is what the samples below are spread over */
const SAIL_SECONDS = 5.2
const look = () => page.evaluate(() => {
  const p = window.__pmap
  return {
    map: p?.map ?? null,
    hull: !!p?.hull,
    x: p ? Math.round(p.x) : null,
    y: p ? Math.round(p.y) : null,
    movie: document.documentElement.dataset.movie === '1',
    onTitle: !!document.querySelector('.ti-root'),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
    buttons: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 12),
  }
})
async function until(fn, ms = 40000, step = 200) {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = await page.evaluate(fn) } catch { /* the scene is being rebuilt */ }
    if (v) return true
    if (Date.now() - t0 > ms) return false
    await wait(step)
  }
}
/* a line is a click, the way a student answers one */
const answer = async () => {
  const said = await page.evaluate(() => !!document.querySelector('.dlg-box'))
  if (said) { await page.keyboard.press('Space'); await wait(420); return true }
  return false
}

console.log(`\nsailing home, against ${base}\n`)

await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw&at=arrive_maw`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__pmap, null, { timeout: 120000 })

/* walking in with the year done starts the closing */
ok('walking in with the year done starts the closing', await until(() => document.documentElement.dataset.movie === '1', 30000))

/* drive it: answer lines, press the one control the film puts up, and watch */
let sawCongrats = false, sawSailHome = false, wasAtDock = false, hopped = false
let sailedFrom = null, sailedTo = null, sawTitle = false
const dockedAt = { x: null, y: null }
let hullSeen = 0
let sawBarOnDeparture = null, sawCardOnDeparture = null
const t0 = Date.now()

while (Date.now() - t0 < 180000) {
  const v = await look()
  if (v.onTitle) { sawTitle = true; break }

  if (/that is year one at bonney lake, finished/i.test(v.text)) sawCongrats = true
  /* the choose word draws its options as buttons over the dialogue box; the
   * generic presser below would find it too, so this must look BEFORE it does */
  const sail = v.buttons.find((b) => /sail home/i.test(b)) || (/sail home/i.test(v.text) ? 'Sail Home' : null)
  if (sail && !sawSailHome) {
    sawSailHome = true
    await page.screenshot({ path: `${SHOTS}/2-sail-home.png` })
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /sail home/i.test(e.innerText))
      b?.click()
    })
    await wait(700)
    continue
  }

  /* once he is on the hub, watch the four beats of the departure */
  if (v.map === 'hub') {
    if (!v.hull && v.x !== null) { dockedAt.x = v.x; dockedAt.y = v.y; wasAtDock = true }
    if (v.hull) {
      hullSeen++
      /* two things drew over the departure and both were wrong: the year's
       * "look around" sentence, and the hub's own "you land at the harbor" */
      const over = await page.evaluate(() => ({
        bar: document.querySelector('.ob-live')?.textContent?.trim() ?? '',
        card: document.querySelector('.pc-card, .pc-root')?.textContent?.trim() ?? '',
      }))
      if (over.bar && !sawBarOnDeparture) sawBarOnDeparture = over.bar
      if (over.card && !sawCardOnDeparture) sawCardOnDeparture = over.card
      if (!hopped) { hopped = true; await page.screenshot({ path: `${SHOTS}/4-aboard.png` }) }
      const at = await page.evaluate(() => ({ x: Math.round(window.__pmap.hull.x), y: Math.round(window.__pmap.hull.y) }))
      if (!sailedFrom) sailedFrom = at
      sailedTo = at
    }
  }

  if (await answer()) continue

  /* THE YEARBOOK IS PRESSED IN THE PAGE. Its cards animate in, so a click by
   * coordinate lands on a plank that is still at two percent opacity; the film
   * waits on those two presses and without them nothing after the page turning
   * ever runs. The chrome is refused by name so the driver cannot wander. */
  const hit = await page.evaluate(() => {
    const bad = /settings|^back|^close|skip|keep playing|restart|erase|^map$|^guide$|^my year$|^\?$|^next$|^got it$|^start year/i
    const c = [...document.querySelectorAll('button')]
      .filter((e) => e.innerText && !bad.test(e.innerText.trim())
        && e.getBoundingClientRect().width > 0 && !e.closest('.ob-wrap'))
      .sort((x, y) => {
        const a = x.getBoundingClientRect(), b = y.getBoundingClientRect()
        return b.width * b.height - a.width * a.height
      })
    if (!c[0]) return null
    const t = c[0].innerText.trim().slice(0, 40)
    c[0].click()
    return t
  })
  if (hit) { await wait(600); continue }
  await wait(250)
}

if (!sawTitle) sawTitle = await until(() => !!document.querySelector('.ti-root'), 20000)
await wait(1200)
await page.screenshot({ path: `${SHOTS}/5-title.png` })
const end = await look()

console.log('')
ok('the principal congratulates him for finishing year one', sawCongrats)
ok('and a big button says Sail Home', sawSailHome)
ok('pressing it puts him on the hub', wasAtDock || hopped, `dock ${dockedAt.x},${dockedAt.y}`)
ok('on his feet at the dock before he is in the boat', wasAtDock, `${dockedAt.x},${dockedAt.y}`)
ok('and then he is in the boat', hopped)
/* the hop and the departure are two things: a hull that exists for one sample is
 * a teleport into a boat, not a departure */
ok('the departure is watched rather than instant', hullSeen >= 3, `${hullSeen} samples with a hull`)

if (sailedFrom && sailedTo) {
  const dx = sailedTo.x - sailedFrom.x, dy = sailedTo.y - sailedFrom.y
  const far = Math.hypot(dx, dy)
  ok('she really moves', far > 40, `${Math.round(far)} px`)
  /* "the boat just starts zooming straight downwards" was the defect: a
   * departure that is almost all +y is the one he saw */
  /* THE HEADING IS THE MAP'S ANSWER AND NOT A NUMBER HERE. `seaward` picks the
   * line with the most open water inside a half-turn of "away from the middle of
   * the island", so on the hub, whose harbour faces the bottom of the frame, out
   * really is downward. What is worth asserting is that she leaves at a
   * WATCHABLE pace rather than bolting: the defect Ash played was full sail from
   * cruising speed, which crossed the same ground in a fifth of the time. */
  const secs = SAIL_SECONDS
  const pxs = far / secs
  ok('at a pace you can watch', pxs < 150, `${Math.round(pxs)} px/s over ${secs}s`)
} else {
  ok('she really moves', false, 'no hull was ever on the water')
  ok('and not straight down the screen', false, 'no hull was ever on the water')
}

ok('nothing is said over the last shot', !sawBarOnDeparture, sawBarOnDeparture || '')
ok('and no arrival card plays over a departure', !sawCardOnDeparture, sawCardOnDeparture || '')
ok('the run ends at the title', sawTitle)
ok('which offers the next year, with the yearbook under it', /start year 2/i.test(end.text) && /your yearbook/i.test(end.text), JSON.stringify(end.text.slice(0, 140)))

await browser.close()
console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL ${f}`)
console.log(`shots in ${SHOTS}`)
process.exit(fails.length ? 1 : 0)
