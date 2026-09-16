/* watches the closing of year one in a real browser, sampling the scene's own live state: it proves the shape, never that it is good. node scripts/sail-home-proof.mjs --base=http://localhost:5173 [--headed] */
import { chromium } from 'playwright'
import fs from 'node:fs'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const SHOTS = arg('shots', 'reference/_archive/build-shots/sail-home')
fs.mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const ok = (n, good, d = '') => {
  if (good) { pass++; console.log(`  ok   ${n}${d ? '  ' + d : ''}`) }
  else { fails.push(`${n}${d ? '  ' + d : ''}`); console.log(`  FAIL ${n}${d ? '  ' + d : ''}`) }
}

/* a year with everything done but the page, standing in the Maw: the state the closing film's own trigger fires on */
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

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') , args: GPU })
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
  /* clicked, not typed: space needs the page to hold focus and a panel opening mid film takes it, so a key-only driver sat on one line and reported the film as stalled */
  const said = await page.evaluate(() => {
    const box = document.querySelector('.dlg-box')
    if (!box) return false
    box.click()
    return true
  })
  if (said) { await wait(420); return true }
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
let sailedAt = 0, sailedTill = 0
const t0 = Date.now()

while (Date.now() - t0 < 180000) {
  const v = await look()
  if (v.onTitle) { sawTitle = true; break }

  if (/that is year one at bonney lake, finished/i.test(v.text)) sawCongrats = true
  /* the choose word draws its options as buttons over the dialogue box, so this must look before the generic presser below does */
  const sail = v.buttons.find((b) => /sail home/i.test(b)) || (/sail home/i.test(v.text) ? 'Sail Home' : null)
  if (sail && !sawSailHome) {
    /* wait for the line to finish before pressing: a click while the typewriter is running finishes the typewriter instead of reaching the button, so the press is lost and the film waits for ever on it. the continue hint is the mark that a line has finished drawing */
    await page.waitForSelector('.cs-continue-hint, .dlg-choice', { timeout: 8000 }).catch(() => {})
    await wait(250)
    sawSailHome = true
    await page.screenshot({ path: `${SHOTS}/2-sail-home.png` })
    const pressed = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /sail home/i.test(e.innerText))
      if (!b) return false
      b.click()
      return true
    })
    /* AND IT TRIES AGAIN. One press that lands nowhere must not end the run. */
    if (!pressed) sawSailHome = false
    await wait(700)
    continue
  }

  /* once he is on the hub, watch the four beats of the departure */
  if (v.map === 'hub') {
    if (!v.hull && v.x !== null) { dockedAt.x = v.x; dockedAt.y = v.y; wasAtDock = true }
    if (v.hull) {
      hullSeen++
      /* two things drew over the departure and both were wrong: the year's "look around" sentence, and the hub's own "you land at the harbor" */
      const over = await page.evaluate(() => ({
        bar: document.querySelector('.ob-live')?.textContent?.trim() ?? '',
        card: document.querySelector('.pc-card, .pc-root')?.textContent?.trim() ?? '',
      }))
      if (over.bar && !sawBarOnDeparture) sawBarOnDeparture = over.bar
      if (over.card && !sawCardOnDeparture) sawCardOnDeparture = over.card
      if (!hopped) { hopped = true; await page.screenshot({ path: `${SHOTS}/4-aboard.png` }) }
      const at = await page.evaluate(() => ({ x: Math.round(window.__pmap.hull.x), y: Math.round(window.__pmap.hull.y) }))
      /* timed, not assumed: the pace is the clock between the first and last sample, because measuring the distance against the scene's `SAIL_OUT_MS` reports 23 px/s off six samples and 35 off nine for the same boat at the same speed */
      if (!sailedFrom) { sailedFrom = at; sailedAt = Date.now() }
      sailedTo = at
      sailedTill = Date.now()
    }
  }

  if (await answer()) continue

  /* `wall_shown` carries the year, so the ending walks him to his case in every year rather than only the first, and the film waits on that panel being shut */
  const wall = await page.evaluate(() => {
    const sheet = document.querySelector('.tw-sheet')
    if (!sheet) return false
    /* the plank carries its key cap in the same element, so the label is "Esc Back" rather than "Back" */
    const b = [...sheet.querySelectorAll('button')].find((e) => /back/i.test(e.innerText))
    b?.click()
    return true
  })
  if (wall) { await wait(700); continue }

  /* the yearbook is pressed in the page because its cards animate in and a click by coordinate lands on a plank still at two percent opacity; the film waits on those two presses, and the chrome is refused by name so the driver cannot wander */
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
/* the hop and the departure are two things: a hull that exists for one sample is a teleport into a boat, not a departure */
ok('the departure is watched rather than instant', hullSeen >= 3, `${hullSeen} samples with a hull`)

if (sailedFrom && sailedTo) {
  const dx = sailedTo.x - sailedFrom.x, dy = sailedTo.y - sailedFrom.y
  const far = Math.hypot(dx, dy)
  ok('she really moves', far > 40, `${Math.round(far)} px`)
  /* the defect reported was a boat zooming straight downwards, a departure that is almost all +y */
  /* the heading is the map's answer and not a number here: `seaward` picks the line with the most open water within a half turn of away from the island's middle, so on the hub out really is downward. the pace is asserted instead, because the defect was full sail from cruising speed */
  const secs = Math.max(0.5, (sailedTill - sailedAt) / 1000)
  const pxs = far / secs
  /* half a helm measured 38 to 48 px/s and still read as fast, so the ceiling comes down with it */
  ok('at a pace you can watch', pxs < 32, `${Math.round(pxs)} px/s over ${secs}s`)
} else {
  ok('she really moves', false, 'no hull was ever on the water')
  ok('at a pace you can watch', false, 'no hull was ever on the water')
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
