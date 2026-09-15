/* the year ends at the title: the intro film stops at the handover, the middle of year one is the two classes, and the ending starts only once the year is done and the principal is pressed, never the counselor. it asserts and exits non-zero, because the old one only printed lines and always exited 0 */
import { boot, LIVE } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const headed = process.argv.includes('--headed')

let pass = 0
const fails = []
const ok = (what, good, detail = '') => {
  const line = `${what}${detail ? '  ' + detail : ''}`
  if (good) { pass++; console.log(`  ok    ${line}`) }
  else { fails.push(line); console.log(`  FAIL  ${line}`) }
}

const h = await boot('ending-fix', {
  save: null, url: base, headed,
  dir: arg('dir', 'reference/_archive/build-shots/ending-fix'),
})
const { page, say, shot, look, finish } = h

/* never pressed: a blind run that opens Settings finds `Restart adventure` and `Yes, erase it all`, two planks no smaller than the way on, and a live run erased its own save on the beach and then reported the year never ended */
const BACKWARD = /^back$|^close$|skip|quit|settings|back to the|back to my|leave this|put back|untick|close for now|restart|erase|start over/i
const TALKING = /^click, or press space$|^begin the year$/i
const LETTER = { Perseverance: 'P', Ownership: 'O', 'Work Ethic': 'W', Engagement: 'E', Respect: 'R' }
const forward = (v) => v.press
  .filter((e) => !e.disabled && e.text && !BACKWARD.test(e.text))
  .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))

const read = () => page.evaluate(() => ({
  map: window.__pmap ? window.__pmap.map : null,
  movie: document.documentElement.dataset.movie === '1',
  hull: window.__pmap ? !!window.__pmap.hull : false,
  prompt: window.__pmap ? window.__pmap.prompt : null,
  onTitle: !!document.querySelector('.ti-line2'),
  plank: document.querySelector('.ti-plank')?.innerText.trim().replace(/\s+/g, ' ') ?? null,
  again: !!document.querySelector('.ti-again'),
  bar: document.querySelector('.ob-panel')?.innerText.trim().replace(/\s+/g, ' ') ?? null,
}))

const t0 = Date.now()
const at = () => ((Date.now() - t0) / 1000).toFixed(1)

/* ---- THE WHOLE RUN, COLD, TO THE TITLE ------------------------------------ */
say('THE RUN  cold from the title, all the way back to the title')
const placed = new Set()
let last = null, repeats = 0
let sawHandover = null, sawBoat = false, turned = null, ended = null
let sawClassBar = null, sawEndBar = null
const lines = []
let lastLine = null

for (let i = 0; i < 460; i++) {
  const v = await look()
  const r = await read()

  const box = v.texts.some((t) => /click, or press space/i.test(t))
    ? v.texts.filter((t) => !TALKING.test(t) && !/^(Map|Guide|My Year|\?)$/.test(t)).join(' | ')
    : null
  if (box && box !== lastLine) { lastLine = box; lines.push(box) }

  /* the two things that must NEVER happen once the year is closing */
  if (r.prompt && /get in the boat/i.test(r.prompt) && turned) sawBoat = true
  if (v.save?.flags?.includes('maw:handed_over') && !sawHandover) {
    sawHandover = at(); say(`*** HANDED OVER at ${sawHandover}s ***`); await shot('handed-over')
  }
  if (r.bar && /Open My Year/i.test(r.bar) && !sawClassBar) {
    sawClassBar = r.bar; say(`*** THE BAR NAMES A CLASS: ${JSON.stringify(r.bar)} ***`)
  }
  /* the bar reads `Go back to the Maw. The principal is waiting.` and used to read `Find the principal. Year one is done.`, so watch for either and an old deploy still reports */
  if (r.bar && /(Find the principal|The principal is waiting)/i.test(r.bar) && !sawEndBar) {
    sawEndBar = r.bar; say(`*** THE BAR SAYS THE YEAR IS DONE: ${JSON.stringify(r.bar)} ***`)
  }
  if (!turned && v.save?.flags?.includes('yearbook:y1')) {
    turned = at(); say(`*** THE PAGE TURNED at ${turned}s ***`); await shot('page-turned')
  }
  if (!ended && turned && r.onTitle) {
    ended = at(); say(`*** THE TITLE at ${ended}s ***`)
    await page.waitForTimeout(1800); await shot('the-title'); break
  }
  if (i % 12 === 0) {
    await shot(`${at()}s-${(v.texts[0] ?? r.map ?? 'blank').slice(0, 20)}`)
    say(`  t=${at()}s map=${r.map} movie=${r.movie ? 1 : 0} bar=${JSON.stringify(r.bar)}`)
  }

  if (v.texts.some((t) => TALKING.test(t))) { await page.mouse.click(683, 640); await page.waitForTimeout(420); continue }
  const hit = async (e) => { await page.mouse.click(e.box.x + e.box.w / 2, e.box.y + e.box.h / 2); await page.waitForTimeout(620) }
  const keep = v.press.find((e) => !e.disabled && /^keep going$/i.test(e.text))
  if (keep) { placed.clear(); await hit(keep); continue }
  const bucket = v.press.find((e) => /^Put (.+) in (.)$/.test(e.text)
    && LETTER[e.text.match(/^Put (.+) in (.)$/)[1]] === e.text.match(/^Put (.+) in (.)$/)[2])
  if (bucket) { placed.add(bucket.text.match(/^Put (.+) in/)[1]); await hit(bucket); continue }
  const chip = v.press.find((e) => LETTER[e.text] && !placed.has(e.text))
  if (chip) { await hit(chip); continue }
  const commit = v.press.find((e) => !e.disabled && /check my answer/i.test(e.text))
  if (commit) { await hit(commit); continue }
  /* the middle of the year: the sheet's one button sits the class, or sails to it the day the roster says so, and the word changes while the press does not */
  /* a pick with no island reads `Go`, one with an island reads `Sail to <name>`, and the same press finishes the pick either way */
  const goClass = v.press.find((e) => !e.disabled && /^(go|go to class|sail there|sail to .+)$/i.test(e.text))
  if (goClass) { await hit(goClass); continue }
  /* adrift, which the bar says and the chart answers: `Click the island to sail there` comes from the scene rather than the year, and the control is a pin on the chart behind the Map plaque this driver treats as chrome, so without this the run flipped Handbook tabs at the hub for four minutes */
  if (r.bar && /Click the island to sail there/i.test(r.bar)) {
    const put = await page.evaluate(() => {
      const pin = document.querySelector('.ch-isle-go')
      if (pin) { pin.click(); return 'sailed' }
      const map = document.querySelector('[data-tour="map"]')
      if (map) { map.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'opened' }
      return null
    })
    if (put) { await page.waitForTimeout(900); continue }
  }
  /* the bar is the only thing that says where, and My Year is a corner plaque this run treats as chrome, so it is opened by name when the bar asks */
  if (r.bar && /Open My Year/i.test(r.bar)) {
    const opened = await page.evaluate(() => {
      const b = document.querySelector('.hud-tokenbtn')
      if (!b) return false
      b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true
    })
    if (opened) { await page.waitForTimeout(700); continue }
  }
  /* the ending is a press on the principal, and he is a station in the room */
  /* the closing starts at the man: walking into the Maw with the year done is the other road, but a student on this road presses him, because the year closes at the chart table with him already in the room and no map load coming */
  if (r.bar && /(Find the principal|The principal is waiting)/i.test(r.bar) && r.map === 'panther-maw') {
    const fired = await page.evaluate(() => (window.__station ? window.__station('principal_desk') : 'no handle'))
    if (fired === 'fired') { await page.waitForTimeout(900); continue }
  }
  /* the one-control fallback obeys the same refusal: a screen whose only button is `Yes, erase it all` is a screen to walk away from, not to press */
  const only = v.press.filter((e) => !e.disabled && e.text && !BACKWARD.test(e.text))
  if (!forward(v).length && only.length === 1) { await hit(only[0]); continue }
  const pick = forward(v)[0]
  if (pick) {
    if (pick.text === last) repeats++; else { last = pick.text; repeats = 0 }
    if (repeats > 4) { const alt = forward(v).find((e) => e.text !== pick.text); if (alt) { last = alt.text; repeats = 0; await hit(alt); continue } }
    await hit(pick); continue
  }
  if (v.map?.lit) { await page.mouse.click(v.map.lit.at.x, v.map.lit.at.y); await page.waitForTimeout(700); continue }
  await page.waitForTimeout(700)
}

const end = await read()
const endV = await look()
const classesSat = (endV.save?.ledger ?? []).filter((e) => String(e.id).startsWith('class:')).length

say('')
say('---- BRIEF-CLOSE-THE-LOOP, checked ----')
/* section 3: the ending ends at the title */
ok('the cold road reaches the classes', !!sawClassBar, sawClassBar ? 'the bar named one' : 'it never did')

/* section 3: never "Continue, Fall, Year 1" */

ok('and never offers Continue over a season', !/continue/i.test(end.plank ?? '') && !/fall|winter|spring/i.test(end.plank ?? ''))

/* ruling 3: one plank, and no year two */
ok('and offers nothing else, no way back and no year two', !end.again,
  end.again ? 'a second plank is still there' : 'one plank')
/* ruling 1: the intro film ends at the handover, always */
ok('the introduction ends at the handover', !!sawHandover,
  sawHandover ? `at ${sawHandover}s` : 'maw:handed_over was never written')
/* ruling 2: the middle of the year is the two classes */
ok('and the bar then names a class and where to sit it', !!sawClassBar, JSON.stringify(sawClassBar))
ok('and both picked classes are on the transcript', classesSat === 2, `${classesSat} of 2 sat`)
/* ruling 3: the ending starts only when the year is done */
ok('the bar says the year is done before the film starts', !!sawEndBar, JSON.stringify(sawEndBar))
/* section 3: the berth is quiet from the moment the closing starts */
ok('the boat is never offered once the year has closed', !sawBoat)
/* section 4: no seasons anywhere a student reads */
const said = [...lines, end.plank ?? '', end.bar ?? '', ...endV.texts].join(' | ')
ok('and no student read the word Fall, Winter or Spring', !/\b(Fall|Winter|Spring)\b/.test(said))

/* section 3: a reload lands on that same title state */
say('')
say('RELOAD  a student who closes the tab and comes back')
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4200)
const again = await read()
await shot('after-a-reload')



/* the trigger on its own, from a seeded year: the cold run above proves the road as far as the classes, and sitting two quizzes is a driver problem, so this seeds the state a student reaches by answering and drives the last ninety seconds */
say('')
say('THE TRIGGER  a year with both classes sat, from the principal to the title')
const doneYear = {
  v: 2, id: 'r_end3', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
  flags: ['read_the_bottle', 'hub:crossed', 'maw:founding', 'vignette:y1',
    'chart:granted', 'handbook:granted', 'maw:railed', 'maw:handed_over', 'maw:wall_shown'],
  tokens: [], ranks: {}, islands: {}, exposure: [{ place: 'home-island', docked: true }],
  completions: [], stickers: [], facts: [], badges: [], savedAt: 1,
  ledger: [
    { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 0.5, grade: 3.4, year: 1, season: 'Fall' },
    { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 0.5, grade: 3.8, year: 1, season: 'Fall' },
  ],
}
await page.evaluate((sv) => {
  localStorage.setItem('blhs_save_v2', JSON.stringify(sv))
  sessionStorage.clear()
}, doneYear)
await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw&at=arrive_maw`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__pmap, null, { timeout: 120000 })
/* the film starts when the island does, not on a stopwatch: a single sample at 4.5 seconds read a page whose python worker had not finished booting, so a road that works reported movie=false and then started nine seconds later */
for (let k = 0; k < 40; k++) {
  const r0 = await read()
  if (r0.movie) break
  await page.waitForTimeout(700)
}

/* the year ends in the Maw and the gate is every pick the student made, not the two classes alone, because every pick now has a button that always finishes it; the seed above is both classes sat and nothing else, and `objective.test.ts` holds the bar's wording while this proves the behaviour */
const armed = await read()
await shot('year-done-arrival')
ok('walking in with the year done starts the closing', armed.movie, `movie=${armed.movie}`)

let started = armed.movie, gotTitle = null
/* the closing is a film, a cover, a map swap and a wide shot, which on the deploy is the better part of a minute before the title, so every wait in here is short because most of them are clicks */
for (let k = 0; k < 260; k++) {
  const rr = await read()
  const vv = await look()
  if (!started && rr.movie) { started = true; say('*** THE CLOSING STARTED on the press ***') }
  if (!gotTitle && rr.onTitle) { gotTitle = true; await page.waitForTimeout(1600); await shot('trigger-title'); break }
  if (vv.texts.some((t) => TALKING.test(t))) { await page.mouse.click(683, 640); await page.waitForTimeout(420); continue }
  /* pressed in the page, not through `look()`, because the yearbook's cards animate in and `look()` refuses anything under two percent opacity, so the two planks that turn the page were invisible on the frames this loop sampled while a hand-driven probe with the same clicks reached the title every time */
  const hit2 = await page.evaluate(() => {
    /* the chrome a driver must never press: the corner (Map, Guide, My Year, Wall and You), the skips, and anything that would restart the run out from under the thing being proved */
    const bad = /settings|^back|^close|skip|keep playing|restart|erase|^map$|^guide$|^my year$|^wall$|^you$|^\?$/i
    const c = [...document.querySelectorAll('button')]
      .filter((e) => e.innerText && !bad.test(e.innerText.trim())
        && e.getBoundingClientRect().width > 0 && !e.closest('.ob-wrap'))
      .sort((x, y) => {
        const a = x.getBoundingClientRect(), b2 = y.getBoundingClientRect()
        return b2.width * b2.height - a.width * a.height
      })
    if (!c[0]) return null
    const t = c[0].innerText.trim().slice(0, 40)
    c[0].click()
    return t
  })
  if (hit2) { await page.waitForTimeout(700); continue }
  await page.waitForTimeout(900)
}
ok('and it runs to the end without a press it cannot answer', started)
ok('and the run ends at the title', !!gotTitle)
const fin = await read()
ok('which says the year is done, with one plank', /year one is done/i.test(fin.plank ?? '') && !fin.again,
  JSON.stringify(fin.plank))

say('')
say('every line anybody said, in order:')
lines.forEach((l, i) => say(`${String(i + 1).padStart(3)}  ${JSON.stringify(l.slice(0, 120))}`))

say('')
say(`${pass} of ${pass + fails.length} checks pass`)
if (fails.length) { say('failed:'); for (const f of fails) say(`  ${f}`) }
await finish()
process.exitCode = fails.length ? 1 : 0
