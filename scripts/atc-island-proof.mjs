/* THE ATC ISLAND, WALKED. The first member-shaped island this game has ever had,
 * and the first scored activity an island brought with it rather than named out of
 * the engine's own table.
 *
 *   node scripts/atc-island-proof.mjs            against the dev server
 *   node scripts/atc-island-proof.mjs --live     against the deploy
 *
 * What it proves, in order, and every one of them is a thing that was not possible
 * before today:
 *
 *   1  the island loads off the roster, by map id, with its four anchors
 *   2  the club president says who he is and when ATC meets, BEFORE the activity
 *   3  the plinth says what the club won
 *   4  pressing the machine pushes the camera in and opens the screen
 *   5  the program can be built, RUN carries it out, and the body reaches the flag
 *   6  the question about ATC is answered
 *   7  the result card lands with a grade out of four and no "0 credit earned"
 *   8  the transcript carries ONE island row, the sticker is on the wall, and the
 *      year's voyage is finished
 */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const MAP = 'atc-1'

/* the save a student would have standing on that terrace: year one planned, ATC
 * committed for winter, and the island already seen so the chart names it */
const save = (() => {
  const s = STAMPED()
  s.exposure = [...s.exposure, { place: 'atc-room', docked: true }]
  return s
})()

const said = (texts) => texts.join(' | ')
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

const h = await boot('atc-island', {
  save,
  /* NO `src=platform` EVEN ON THE DEPLOY. The student's road is the copy vendored
   * at build time, so forcing the platform read would prove a road nobody takes. */
  url: `${base}/?scene=pmap&deep=1&map=${MAP}`,
  dir: 'reference/_archive/build-shots/atc-island',
})
const { page, say, shot, look, state, pressText, until, finish } = h

await page.waitForTimeout(live ? 9000 : 6000)
let v = await state('landed')
await shot('01-ashore')

/* ---- 1. the island is loaded and knows its own names ---------------------- */
const anchors = await page.evaluate(() => {
  try { return JSON.parse(window.__anchors()) } catch { return null }
})
const names = (anchors ?? []).map((a) => a.name).sort()
ok('the island loads with its four anchors',
  ['host', 'the_desk', 'the_lab', 'trophies'].every((n) => names.includes(n)),
  JSON.stringify(names))

ok('the roster made it playable', !!v.save, `plans=${JSON.stringify(v.save?.plans?.[1]?.slots ?? null)}`)

/* ---- 2. the plinth, pressed FIRST -----------------------------------------
 * before the president, because his handler runs the whole conversation through
 * to the activity and an island answers one press at a time. */
const press = async (anchor) => page.evaluate((a) => window.__station(a), anchor)

/* click the dialogue box and poll, rather than waiting a guessed number of
 * milliseconds: `lead_to` walks a body across a terrace and takes as long as it
 * takes. Returns everything that was said on the way. */
const drive = async (stop, ms = 30000) => {
  const seen = []
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = await look()
    for (const t of s.texts) if (!seen.includes(t)) seen.push(t)
    if (stop(s, seen)) return { seen, hit: true }
    /* the choose buttons carry their number, so they read "1 Sure" rather than
     * "Sure": matched loosely on purpose, and anchored on the word so "Not right
     * now" can never be the one that gets pressed. */
    const btn = s.press.find((e) => /(^|\s)Sure$/i.test(e.text))
    if (btn) { await page.mouse.click(btn.box.x + btn.box.w / 2, btn.box.y + btn.box.h / 2) }
    else await page.mouse.click(683, 640)
    await page.waitForTimeout(450)
  }
  return { seen, hit: false }
}

/* AN ISLAND ANSWERS ONE PRESS AT A TIME, so a conversation has to be finished
 * before the next thing is pressed. Seeing the line is not the same as the handler
 * having returned: it is parked on `say` until the box is clicked through, and a
 * press arriving while it is parked is dropped with nothing said. */
const settle = async (ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const busy = await page.evaluate(() => (window.__pmap ? window.__pmap.island.busy : false))
    if (!busy) return true
    await page.mouse.click(683, 640)
    await page.waitForTimeout(400)
  }
  say('  ISLAND STILL BUSY')
  return false
}

await press('trophies')
const medals = await drive((s, seen) => seen.some((t) => /Nationals/.test(t)), 10000)
await shot('02-medals')
ok('the plinth says what the club won', medals.hit, JSON.stringify(medals.seen.slice(-4)))
await settle()

/* ---- 3. the club president, and everything his handler chains into --------- */
const zBefore = await page.evaluate(() => (window.__pmap ? window.__pmap.camZ : null))
await press('host')
const talk = await drive(
  (s) => !!s.press.find((e) => /^RUN$/i.test(e.text)),
  45000,
)
await shot('03-through-to-the-screen')
const heard = talk.seen.join(' | ')
ok('he says who he is', /I.m Ashwath/.test(heard), heard.slice(0, 160))
ok('he says WHEN and HOW before anything is scored',
  /303/.test(heard) && /form/i.test(heard), heard.slice(0, 200))
ok('he names the club and the game', /game we.re building/.test(heard), heard.slice(0, 200))

/* ---- 4. the push-in and the screen ---------------------------------------- */
const zAfter = await page.evaluate(() => (window.__pmap ? window.__pmap.camZ : null))
ok('sitting down pushes the camera into the monitor',
  typeof zBefore === 'number' && typeof zAfter === 'number' && zAfter > zBefore * 1.5,
  `z ${zBefore} -> ${zAfter}`)

const crt = await page.evaluate(() => !!document.querySelector('.bt-crt'))
const board = await page.evaluate(() => document.querySelectorAll('.bt-cell').length)
await shot('04-the-screen')
ok('the screen opens inside the monitor frame', crt)
ok('the board is drawn', board === 24, `${board} cells, want 24`)

/* ---- 5. build the program and RUN it --------------------------------------
 * Pressed the way a student does: a card, then a slot. The correct program is
 * forward 2, turn left, forward 3, turn right, forward 3. */
const WANT = ['forward 2', 'turn left', 'forward 3', 'turn right', 'forward 3']
for (let i = 0; i < WANT.length; i++) {
  /* TWO CLICKS WITH A BREATH BETWEEN THEM, which is also how a student does it.
   * Fired in one evaluate, the well's handler still closes over the previous
   * render's `held`, so the card is picked up and dropped nowhere and the next
   * card lands in the last card's slot. */
  const tookIt = await page.evaluate((label) => {
    const card = [...document.querySelectorAll('.bt-card')].find((c) => c.textContent.trim() === label)
    if (!card) return false
    card.click()
    return true
  }, WANT[i])
  if (!tookIt) say(`  no card ${WANT[i]}`)
  await page.waitForTimeout(160)
  const dropped = await page.evaluate((slot) => {
    const wells = [...document.querySelectorAll('.bt-slotwell')]
    if (!wells[slot]) return false
    wells[slot].click()
    return true
  }, i)
  if (!dropped) say(`  no slot ${i}`)
  await page.waitForTimeout(200)
}
await shot('06-program-built')
const filled = await page.evaluate(() =>
  [...document.querySelectorAll('.bt-slotwell')].map((w) => w.textContent.trim()))
ok('all five steps are filled by hand', filled.every((t) => t && t !== 'empty'), JSON.stringify(filled))

await pressText(/^RUN$/i)
/* THE BODY WALKS ONE CELL AT A TIME and the line only lands when it stops, so
 * this waits for the walk rather than for a number of milliseconds somebody
 * guessed. Twelve cells at 420ms is five seconds before it has anything to say. */
const ranIt = await until((s) => said(s.texts).includes('reached the flag'), { ms: 15000 })
await shot('07-it-ran')
ok('the program ran and the body reached the flag',
  said(ranIt.texts).includes('reached the flag'), said(ranIt.texts).slice(0, 200))

/* ---- 6. the question about the club ---------------------------------------- */
await pressText(/Keep going/i)
await page.waitForTimeout(900)
v = await state('the atc question')
await shot('08-how-you-join')
ok('the second item asks about ATC', said(v.texts).includes('How do you join'), said(v.texts).slice(0, 140))
await pressText(/Show up after school/i)
await page.waitForTimeout(500)
await pressText(/Check my answer/i)
await page.waitForTimeout(900)
await pressText(/Keep going/i)
await page.waitForTimeout(1400)

/* ---- 7. the result card ---------------------------------------------------- */
v = await state('the result')
await shot('09-result')
const card = said(v.texts)
ok('the result card names the activity', card.includes('program'), card.slice(0, 200))
ok('it does NOT stamp "0 credit earned"', !card.includes('0 credit'), card.slice(0, 200))

await pressText(/Back|Done|Close|Keep going/i)
await page.waitForTimeout(1500)
/* AND THE ISLAND IS STILL TALKING. `play()` hands the grade back to Python, which
 * then says one line and only THEN writes the award. Reading the save before that
 * line has been clicked through reads it half written. */
await settle()
await page.waitForTimeout(900)
await shot('10-back-on-the-island')

/* ---- 8. what it wrote down ------------------------------------------------- */
const wrote = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('blhs_save_v2') || 'null')
  if (!s) return null
  return {
    ledger: s.ledger.map((e) => ({ id: e.id, kind: e.kind, credit: e.credit, grade: e.grade })),
    completions: s.completions,
    stickers: s.stickers,
    islands: s.islands,
    flags: s.flags.filter((f) => f.startsWith('atc:')),
  }
})
say(`  wrote: ${JSON.stringify(wrote)}`)

/* TWO ROWS AND EXACTLY ONE OF THEM CARRIES CREDIT, which is the whole reason the
 * activity has an id of its own. Share one id with the programme's award and
 * `recordGrade` keys on it, so one sitting writes the row twice: attempts goes to
 * two with a first grade recorded, and the student's own yearbook prints "2 tries,
 * first A" for something they sat once. Two credit-bearing rows would also weight
 * the GPA twice over. */
const rows = (wrote?.ledger ?? []).filter((e) => e.kind === 'island')
const paid = rows.filter((e) => e.credit > 0)
ok('exactly one credit-bearing island row', paid.length === 1, JSON.stringify(rows))
ok('the activity itself carries no credit',
  rows.some((e) => e.id.endsWith(':the_program') && e.credit === 0), JSON.stringify(rows))
ok('it carries a grade out of four', paid[0] && typeof paid[0].grade === 'number' && paid[0].grade > 0,
  JSON.stringify(paid[0] ?? null))
const done = (wrote?.completions ?? []).find((c) => c.programme === 'atc')
ok('it was sat once and recorded once', done && done.attempts === 1, JSON.stringify(done ?? null))
ok('the sticker is on the wall', (wrote?.stickers ?? []).includes('first-program'),
  JSON.stringify(wrote?.stickers))
ok('the programme is marked completed',
  (wrote?.completions ?? []).some((c) => c.programme === 'atc'), JSON.stringify(wrote?.completions))
ok('the island reads as completed on the chart', wrote?.islands?.atc === 'completed',
  JSON.stringify(wrote?.islands))
ok('the island wrote its own scoped flags', (wrote?.flags ?? []).length > 0, JSON.stringify(wrote?.flags))
/* AND THE DONE-FLAG CARRIES THE YEAR. Without the year on it, finishing ATC once
 * marks it finished for the whole run: a student re-slotting it in year two, which
 * the rank ladder REQUIRES, sails there, presses the machine, is told where the
 * form is, and the year hangs open with nothing on screen saying why. */
ok('the done-flag is scoped to the year, so it can be done again next year',
  (wrote?.flags ?? []).some((f) => /built:y\d+$/.test(f)), JSON.stringify(wrote?.flags))

console.log(`\n${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
await finish()
process.exit(fails.length ? 1 : 0)
