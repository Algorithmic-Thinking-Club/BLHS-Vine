/* THE YEAR ENDS, AND IT ENDS AT THE TITLE.
 *
 * REWRITTEN 2026-09-08 for BRIEF-CLOSE-THE-LOOP, and the brief asks for that in
 * as many words: *"update the ending proof to the new ending and say so."*
 *
 * UPDATED AGAIN 2026-09-08 EVENING, for Ash's three rulings, and this file is
 * where the new trigger is written down:
 *
 *   1  the intro film ends at the HANDOVER and never runs into the ending. The
 *      zero-island shortcut is gone, so `maw:handed_over` is written on every run
 *      and the corner arrives.
 *   2  the middle of year one is the TWO CLASSES. After the handover the bar says
 *      "Go to <class>. Open My Year.", the sheet's button sits it, and the year is
 *      not done until both are sat.
 *   3  the ending starts ONLY when the year is done: the bar says "Find the
 *      principal. Year one is done." and pressing him starts the film. The
 *      counselor never starts it. The title ends with one plank and no year two.
 *
 * AND IT ASSERTS NOW. The old one printed verdict lines a human read and always
 * exited 0, which is a gate that cannot fail. This one has checks and an exit
 * code, because it is one of the three the brief runs before a deploy.
 *
 *   node scripts/ending-fix.mjs [--base=https://blhs-island-explorer.vercel.app]
 */
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

/* NEVER PRESSED. The last three are the reason this list is longer than
 * dimwit's: a blind run that opens Settings finds "Restart adventure" and "Yes,
 * erase it all", which are two big planks and no smaller than the way on.
 * Measured against the live deploy on 2026-09-08: the run erased its own save on
 * the beach and then reported that the year never ended, which was true and was
 * this script's fault. */
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
  /* ASH, 2026-09-08 item 6, his own sentence: *"the bar says 'Go back to the
   * Maw. The principal is waiting.'"* It used to read "Find the principal. Year
   * one is done." and this watches for either, so an old deploy still reports. */
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
  /* THE MIDDLE OF THE YEAR. The sheet's one button sits the class, or sails to it
   * the day the roster says so; the word changes and the press does not. */
  /* ASH, 2026-09-08 item 4 changed the word on it: a pick with no island reads
   * "Go", one with an island reads "Sail to <name>", and the same press finishes
   * the pick either way. The quiz that used to be behind "go to class" is gone. */
  const goClass = v.press.find((e) => !e.disabled && /^(go|go to class|sail there|sail to .+)$/i.test(e.text))
  if (goClass) { await hit(goClass); continue }
  /* ---- ADRIFT, WHICH THE BAR SAYS AND THE CHART ANSWERS -----------------
   *
   * "Click the island to sail there" is the one sentence the SCENE says rather
   * than the year: he is holding the tiller. The control is a pin on the chart,
   * and the chart is behind the Map plaque, which this driver treats as chrome.
   * Without this the run flipped Handbook tabs at the hub for four minutes.
   * Measured on the live deploy 2026-09-08, twice. */
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
  /* and the bar is the only thing that says where: My Year is a corner plaque,
   * which this run treats as chrome, so it is opened by name when the bar asks */
  if (r.bar && /Open My Year/i.test(r.bar)) {
    const opened = await page.evaluate(() => {
      const b = document.querySelector('.hud-tokenbtn')
      if (!b) return false
      b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true
    })
    if (opened) { await page.waitForTimeout(700); continue }
  }
  /* the ending is a press on the principal, and he is a station in the room */
  /* THE CLOSING STARTS AT THE MAN. Ash's own trigger is walking into the Maw
   * with the year done, and the other road is pressing him, which is the one a
   * student on this road takes: the year closes at the chart table with him
   * already standing in the room, so no map load is coming. */
  if (r.bar && /(Find the principal|The principal is waiting)/i.test(r.bar) && r.map === 'panther-maw') {
    const fired = await page.evaluate(() => (window.__station ? window.__station('principal_desk') : 'no handle'))
    if (fired === 'fired') { await page.waitForTimeout(900); continue }
  }
  /* the one-control fallback obeys the same refusal: a screen whose only button
   * is "Yes, erase it all" is a screen to walk away from, not to press */
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



/* ---- RULING 3, ON ITS OWN, FROM A SEEDED YEAR ------------------------------
 *
 * The cold run above proves the road as far as the classes. Sitting two quizzes
 * is a driver problem rather than a game one, and the claim that matters here is
 * the TRIGGER: with the year really done, the bar says so and pressing the
 * principal starts the film. So this seeds the state a student reaches by
 * answering, and drives the last ninety seconds.
 */
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
/* THE FILM STARTS WHEN THE ISLAND DOES, not on a stopwatch. A single sample at
 * 4.5 seconds read a cold page whose python worker had not finished booting, so
 * a road that works reported movie=false and then started nine seconds later.
 * This waits for the frame the way a student waits for it, with a ceiling. */
for (let k = 0; k < 40; k++) {
  const r0 = await read()
  if (r0.movie) break
  await page.waitForTimeout(700)
}

/* ---- THE TRIGGER, AS ASH RULED IT ON 2026-09-08 (item 6) -------------------
 *
 * *"THE YEAR ENDS in the Maw. When every pick is done the bar says 'Go back to
 * the Maw. The principal is waiting.' Walking into the Maw with the year done
 * starts the ending film."*
 *
 * Which is what this drives, and it is a CHANGED trigger since the last time
 * this script was written: the gate used to be the two classes alone, and it is
 * now every pick the student made, clubs included, because item 4 gave every one
 * of them a button that always finishes it. The seed above is a year with both
 * classes sat and nothing else picked, which is the shape a student reaches by
 * pressing Go twice on the year sheet.
 *
 * There is no idle moment to photograph here and the bar's own wording is held
 * by `objective.test.ts`; what this proves is the behaviour, which no unit test
 * can reach. */
const armed = await read()
await shot('year-done-arrival')
ok('walking in with the year done starts the closing', armed.movie, `movie=${armed.movie}`)

let started = armed.movie, gotTitle = null
/* the closing is a film, a cover, a map swap and a wide shot: on the deploy that
 * is the better part of a minute before the title, and every wait in here is
 * short because most of them are clicks */
for (let k = 0; k < 260; k++) {
  const rr = await read()
  const vv = await look()
  if (!started && rr.movie) { started = true; say('*** THE CLOSING STARTED on the press ***') }
  if (!gotTitle && rr.onTitle) { gotTitle = true; await page.waitForTimeout(1600); await shot('trigger-title'); break }
  if (vv.texts.some((t) => TALKING.test(t))) { await page.mouse.click(683, 640); await page.waitForTimeout(420); continue }
  /* PRESSED IN THE PAGE, NOT THROUGH `look()`. The yearbook's cards animate in,
   * and `look()` refuses anything under two percent opacity, so the two planks
   * that turn the page ("That is year one", "That is my first cord") were
   * invisible to this loop on the frames it happened to sample. Measured against
   * the live deploy 2026-09-08: a hand-driven probe with the same clicks reached
   * the title every time and this loop never did. A dispatched click needs no
   * coordinates and no visibility guess. */
  const hit2 = await page.evaluate(() => {
    /* the chrome, which a driver must never press: the corner (Map, Guide, My
       Year, and since 2026-09-08 Wall and You), the skips, and anything that
       would restart the run out from under the thing being proved */
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
