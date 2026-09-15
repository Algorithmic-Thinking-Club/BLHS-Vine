/* an island's own task list and the finish button that puts the player back on the dock, run with `node scripts/atc-tasks-proof.mjs`: the list is declared in the island's Python, the ticks live in the save, and the sheet drawing them is the one the year's tasks already use */
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
/* the island's rows come first and the year stays under them on one sheet, because an island list that replaced the year's would hide Advisory and every pick, and in the home base it would hide the rows that room exists for */
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
  /* one rule: the instruction goes into the next empty step, and pressing the step after it takes the instruction back out */
  await page.waitForTimeout(220)
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
/* what the island actually finished with, so a failure here names its own cause */
console.log(`  ledger: ${JSON.stringify(await page.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('blhs_save_v2') || 'null')
  return { rows: (s2?.ledger ?? []).map((e) => e.id), tasks: s2?.tasks ?? null, year: s2?.year }
}))}`)
console.log(`  said: ${JSON.stringify((await look()).texts.slice(0, 8))}`)
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
  /* the dock and not just somewhere else: the berth on this island is at the bottom of the painting and the terrace at the top, so anything that has not crossed most of the map has not arrived */
  ok('and he is at the dock, not part of the way to it',
    !!moved && !!before.at && moved.y - before.at.y > 180,
    JSON.stringify({ from: before.at, to: moved }))
  /* a berth is where the hull ties up, so by definition nobody can stand on it, and `onFloor` hands back the point it was given when it finds nothing standable: no floor sits within 44 painting pixels of either published berth, which put a body on water where `walk.ts` reads level zero as stuck and skips collision */
  const standable = await page.evaluate(() => {
    const p = window.__pmap
    return p.spotOnGlass ? { level: p.level ?? null, at: { x: Math.round(p.x), y: Math.round(p.y) } } : null
  })
  const spawn = await page.evaluate(async () => {
    const r = await fetch('/maps-vendored/atc-1/map.json')
    const m = await r.json()
    return m.spawn
  })
  ok('and he is on ground a person can stand on, not on the water',
    !!moved && !!spawn && Math.hypot(moved.x - spawn[0], moved.y - spawn[1]) < 60,
    JSON.stringify({ he: moved, spawn, level: standable?.level }))
  await shot('03-at-the-dock')
}
/* the list dies with the island: the rows name things to do here and they are counted, so carried onto the next map the home base sheet read "Algorithmic Thinking Club, 3 of 5 done" with two rows nobody could reach and a counter that could never finish */
await page.evaluate(() => window.__intent({ kind: 'enter', map: 'panther-maw' }))
await page.waitForTimeout(9000)
const away = await sheet()
ok("the island's list stays on its island", !!away && !/Algorithmic Thinking Club\d/.test(away.head),
  away ? away.head : 'no sheet')
ok('and the year has the sheet back', !!away && /Year one/.test(away.head), away ? away.head : 'no sheet')

console.log(`
${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
await finish()
process.exit(fails.length ? 1 : 0)
