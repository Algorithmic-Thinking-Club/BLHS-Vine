/* CAN A YEAR BE STAMPED AT ALL. Both sheets, because there are two of them.
 *
 *   node scripts/atc-stamp-proof.mjs
 *   node scripts/atc-stamp-proof.mjs --live
 *
 * Ash asked for the stamp to wait until every season is spent. The first attempt at
 * that rule asked YEAR ONE for three picks on a sheet that can only make one: a club
 * with no island is drawn there as an example and refuses the press, and one
 * programme may not take two seasons in a year. So the stamp went dead, year one
 * could not be closed, and a run stopped at the first sheet with nothing on the page
 * saying why. Nothing in the suite could see it, because the rule was tested against
 * `refuseSlot` and the example lock lives in the component.
 *
 * The classes are seeded, so what this exercises is the ACTIVITY gate on its own.
 */
import { boot, BASE, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

const stampState = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null)
    .find((x) => /stamp the year sheet|that is my schedule/i.test(x.textContent || ''))
  const note = [...document.querySelectorAll('.py-notyet, .pl-note-plan, [class*="notyet"]')]
    .filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim())
  return { found: !!b, off: b ? !!b.disabled : null, text: b ? b.textContent.trim() : null, notes: note }
})

/* ---- YEAR ONE: one club on the roster, so one seat on the sheet ----------- */
{
  const s = BASE()
  s.introDone = true
  /* both elective periods already chosen, so the only thing left owing is the club */
  s.plans = { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: false } }
  const h = await boot('stamp-y1', {
    save: s, url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
    dir: 'reference/_archive/build-shots/stamp/y1',
  })
  const { page, shot, finish } = h
  await page.waitForTimeout(6000)
  await page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
  await page.waitForTimeout(2400)
  const before = await stampState(page)
  ok('year one: the stamp waits while the club is still owed', before.found && before.off === true,
    JSON.stringify(before))
  /* press every activity card the sheet will accept, which is the whole point:
   * the sheet must be able to satisfy its own gate */
  let pressed = 0
  for (let i = 0; i < 4; i++) {
    const hit = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.py-card.kit-surface-tab, .py-chip')]
        .find((x) => x.tagName === 'BUTTON' && x.offsetParent !== null)
      if (!c) return null
      c.click()
      return (c.textContent || '').trim().slice(0, 34)
    })
    if (!hit) break
    pressed++
    await page.waitForTimeout(420)
  }
  const after = await stampState(page)
  ok('year one: the sheet offers at least one club to press', pressed > 0, `${pressed} pressed`)
  ok('year one: and the stamp goes live once they are all taken',
    after.found && after.off === false, JSON.stringify(after))
  await shot('01-year-one')
  await finish()
}

/* ---- YEAR TWO: the whole roster is offered, so three seats ---------------- */
{
  const s = STAMPED()
  s.year = 2
  s.plans = { 1: s.plans[1], 2: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: false } }
  s.tokens = ['Fall', 'Winter', 'Spring']
  s.completions = [{ programme: 'atc', year: 1, grade: 4, at: 1, attempts: 1, firstGrade: 4, rank: 'atc' }]
  s.flags = [...s.flags, 'maw:railed', 'maw:handed_over', 'yearbook:y1']
  const h = await boot('stamp-y2', {
    save: s, url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
    dir: 'reference/_archive/build-shots/stamp/y2',
  })
  const { page, shot, finish } = h
  await page.waitForTimeout(6000)
  await page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
  await page.waitForTimeout(2600)
  const before = await stampState(page)
  ok('year two: the stamp waits while seasons are still empty', before.found && before.off === true,
    JSON.stringify(before))
  /* a season is filled by opening its socket and pressing a row in the menu */
  let filled = 0
  for (let i = 0; i < 3; i++) {
    const opened = await page.evaluate(() => {
      const sock = [...document.querySelectorAll('.kit-socket')]
        .find((x) => x.offsetParent !== null && /pick your/i.test(x.textContent || ''))
      if (!sock) return false
      sock.click()
      return true
    })
    if (!opened) break
    await page.waitForTimeout(450)
    const took = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.pl-act')]
        .find((x) => x.getAttribute('aria-disabled') !== 'true' && x.offsetParent !== null)
      if (!row) return null
      row.click()
      return (row.textContent || '').trim().slice(0, 34)
    })
    if (took) filled++
    await page.waitForTimeout(450)
  }
  const after = await stampState(page)
  ok('year two: all three seasons can really be filled', filled === 3, `${filled} filled`)
  ok('year two: and the stamp goes live when they are',
    after.found && after.off === false, JSON.stringify(after))
  await shot('01-year-two')
  await finish()
}

console.log(`\n${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
process.exit(fails.length ? 1 : 0)
