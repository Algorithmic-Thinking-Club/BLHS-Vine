/* AN ISLAND'S OWN TASK LIST, AND THE WAY OFF IT WHEN THEY ARE ALL DONE.
 *
 *   node scripts/atc-tasks-proof.mjs
 *
 * Ash asked for two things and this holds both: *"islands should constantly have
 * tasks to do, and thats how it should be layed out"*, and *"when all tasks in an
 * island are complete, a button at the bottom middle should show up saying 'Island
 * Finished - Head back'. once clicked, the user gets teleported to the dock."*
 *
 * The list is declared in the island's own Python, the ticks live in the save, and
 * the sheet that draws them is the one the year's tasks already use.
 */
import { boot, STAMPED } from './play-harness.mjs'

const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

const h = await boot('atc-tasks', {
  save: STAMPED(), url: 'http://localhost:5173/?scene=pmap&deep=1&map=atc-1',
  dir: 'reference/_archive/build-shots/repro/tasks',
})
const { page, look, shot, finish } = h
await page.waitForTimeout(6500)

const sheet = async () => {
  /* the sheet opens off the objective bar */
  await page.evaluate(() => {
    const b = document.querySelector('.ob-panel')
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(400)
  return page.evaluate(() => {
    const s = document.querySelector('.ob-sheet')
    if (!s) return null
    const head = s.querySelector('.ob-sheet-head')?.textContent?.trim() ?? ''
    const rows = [...s.querySelectorAll('.ob-task')].map((li) => ({
      mark: li.querySelector('.ob-mark')?.textContent ?? '',
      name: li.querySelector('.ob-task-name')?.textContent ?? '',
      note: li.querySelector('.ob-task-note')?.textContent ?? '',
      done: li.className.includes('is-done'),
    }))
    return { head, rows }
  })
}
const first = await sheet()
ok("the sheet is the island's and names it", !!first && /Algorithmic Thinking Club/.test(first.head), first?.head)
ok('the heading counts the ISLAND and not the year', !!first && /0 of 2 done/.test(first.head), first?.head)
/* THE ISLAND'S ROWS COME FIRST AND THE YEAR STAYS UNDER THEM. One sheet carries both,
 * because it is the only task sheet there is: an island list that replaced the year's
 * would hide Advisory and every pick, and in the home base it would hide the very rows
 * that room exists for. */
const mineRows = !!first && first.rows.slice(0, 2)
ok("the island's own rows are first, each with its note",
  !!mineRows && mineRows.length === 2 && mineRows.every((r) => r.name && r.note && !r.done),
  JSON.stringify(mineRows))
ok('and the year is still on the sheet under them',
  !!first && first.rows.length > 2 && first.rows.some((r) => /Advisory/.test(r.name)),
  String(first?.rows.length) + ' rows')
await shot('01-sheet')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

await page.evaluate(() => window.__station('host'))
for (let i = 0; i < 70; i++) {
  const v = await look()
  if (v.press.some((e) => /^RUN$/i.test(e.text))) break
  const sure = v.press.find((e) => /(^|\s)Sure$/i.test(e.text))
  if (sure) await page.mouse.click(sure.box.x + sure.box.w / 2, sure.box.y + sure.box.h / 2)
  else await page.mouse.click(683, 640)
  await page.waitForTimeout(260)
}
const WANT = ['forward 2', 'turn left', 'forward 3', 'turn right', 'forward 3']
for (let i = 0; i < WANT.length; i++) {
  await page.evaluate((label) => {
    const c = [...document.querySelectorAll('.bt-card')].find((x) => x.textContent.trim() === label)
    if (c) c.click()
  }, WANT[i])
  await page.waitForTimeout(140)
  await page.evaluate((slot) => {
    const w = [...document.querySelectorAll('.bt-slotwell')]
    if (w[slot]) w[slot].click()
  }, i)
  await page.waitForTimeout(160)
}
const press = async (re) => {
  const v = await look()
  const b = v.press.find((e) => re.test(e.text))
  if (b) await page.mouse.click(b.box.x + b.box.w / 2, b.box.y + b.box.h / 2)
  return !!b
}
await press(/^RUN$/i)
await page.waitForTimeout(9000)
await press(/Keep going/i); await page.waitForTimeout(900)
await press(/Show up after school/i); await page.waitForTimeout(700)
await press(/Keep going/i); await page.waitForTimeout(1800)
await press(/Back to the game|Back|Done/i); await page.waitForTimeout(1500)
/* let the island finish speaking */
for (let i = 0; i < 20; i++) {
  const busy = await page.evaluate(() => (window.__pmap ? window.__pmap.island.busy : false))
  if (!busy) break
  await page.mouse.click(683, 640)
  await page.waitForTimeout(400)
}
await page.waitForTimeout(1200)
const after = await sheet()
ok("both of the island's rows tick once the work is really done",
  !!after && /2 of 2 done/.test(after.head) && after.rows.slice(0, 2).every((r) => r.done),
  after ? after.head + ' :: ' + JSON.stringify(after.rows.slice(0, 2)) : 'no sheet')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
const back = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Head back/i.test(x.textContent || ''))
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { text: b.textContent.trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y), w: Math.round(r.width) }
})
ok('the way back appears, at the bottom middle, in his words',
  !!back && /Island finished\. Head back\./.test(back.text), JSON.stringify(back))
ok('and it really is centred', !!back && Math.abs(back.x - 683) < 24, back ? String(back.x) : 'none')
await shot('02-finished')
let walked = null
let refused = null
let moved = null
if (back) {
  const before = await page.evaluate(() => {
    const p = window.__pmap
    return { at: { x: Math.round(p.x), y: Math.round(p.y) }, walk: p.walkLabel, map: p.map }
  })
  console.log('  standing at ' + JSON.stringify(before.at))
  /* ask the bus directly as well, so a missed click is told apart from a refusal */
  const said = await page.evaluate(async () => {
    const el = [...document.querySelectorAll('button')].find((x) => /Head back/i.test(x.textContent || ''))
    const r = el.getBoundingClientRect()
    el.click()
    return { clicked: true, box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  })
  void said
  for (let i = 0; i < 26; i++) {
    const s2 = await page.evaluate(() => {
      const p = window.__pmap
      const why = document.querySelector('.hb-back-why')
      return {
        at: { x: Math.round(p.x), y: Math.round(p.y) }, walk: p.walkLabel, map: p.map,
        why: why ? why.textContent.trim() : null,
      }
    })
    if (s2.walk) walked = s2.walk
    if (s2.why) refused = s2.why
    moved = s2.at
    await page.waitForTimeout(300)
  }
  ok('pressing it is not refused', !refused, refused ?? 'no refusal')
  /* THE DOCK AND NOT JUST SOMEWHERE ELSE. The berth on this island is down at the
   * bottom of the painting and the terrace is at the top, so anything that has not
   * crossed most of the map has not arrived. */
  ok('and he is at the dock, not part of the way to it',
    !!moved && !!before.at && moved.y - before.at.y > 180,
    JSON.stringify({ from: before.at, to: moved }))
  await shot('03-at-the-dock')
}
console.log(`
${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
await finish()
process.exit(fails.length ? 1 : 0)
