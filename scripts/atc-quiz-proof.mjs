/* a right answer counts however a person gives it: `node scripts/atc-quiz-proof.mjs`, or `--live`; the frame understood only instruction then slot, so pointing at the empty step first landed every answer one step late, and a proof written to match the code instead of a person ships green while broken */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const SETTLE = live ? 11000 : 6500
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

const WANT = ['forward 2', 'turn left', 'forward 3', 'turn right', 'forward 3']

/* the rule is printed on the screen: an instruction goes in the next empty step and pressing a step takes it back out, so pressing a card and then the step it landed in is a person undoing themselves, checked here as nothing moved anywhere it was not put */
const WAYS = [
  { key: 'just the instructions, in order', touchSlots: false },
  { key: 'a stray press on a step in between', touchSlots: true },
  /* as fast as a person really presses: five presses back to back is what a hand does with five buttons, and the 200 ms wait between them meant this proof never once raced React's own batching */
  { key: 'five presses as fast as a hand moves', touchSlots: false, fast: true },
]

for (const way of WAYS) {
  const h = await boot(`quiz-${way.key.replace(/\W+/g, '-')}`, {
    save: STAMPED(), url: `${base}/?scene=pmap&deep=1&map=atc-1`,
    dir: `reference/_archive/build-shots/quiz/${way.key.replace(/\W+/g, '-')}`,
  })
  const { page, look, shot, finish } = h
  /* wait for the scene, not for a clock: `window.__station` only exists once a map has mounted, and the deploy's first frame is slower than the dev server's by however long a cold lambda takes, so a fixed sleep races it */
  await page.waitForFunction(() => {
    try { return !!window.__pmap && window.__pmap.island && window.__pmap.island.started } catch { return false }
  }, null, { timeout: 90000 })
  await page.waitForTimeout(900)
  await page.evaluate(() => window.__station('host'))

  /* through the president's lines to the screen */
  let up = false
  for (let i = 0; i < 70; i++) {
    const v = await look()
    if (v.press.some((e) => /^RUN$/i.test(e.text))) { up = true; break }
    const sure = v.press.find((e) => /(^|\s)Sure$/i.test(e.text))
    if (sure) await page.mouse.click(sure.box.x + sure.box.w / 2, sure.box.y + sure.box.h / 2)
    else await page.mouse.click(683, 640)
    await page.waitForTimeout(280)
  }
  ok(`${way.key}: the screen opens`, up)

  const clickText = async (sel, text) => {
    const box = await page.evaluate(({ s, t }) => {
      const el = [...document.querySelectorAll(s)].find((x) => x.textContent.trim() === t)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    }, { s: sel, t: text })
    if (!box) return false
    await page.mouse.click(box.x, box.y)
    return true
  }
  const clickSlot = async (n) => {
    const box = await page.evaluate((i) => {
      const el = [...document.querySelectorAll('.bt-slotwell')][i]
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    }, n)
    if (!box) return false
    await page.mouse.click(box.x, box.y)
    return true
  }

  if (way.fast) {
    /* every press dispatched inside one evaluate, so they land in the same frame and React gets no chance to re-render between them, which is worse than any hand */
    await page.evaluate((want) => {
      for (const t of want) {
        const c = [...document.querySelectorAll('.bt-card')].find((x) => x.textContent.trim() === t)
        if (c) c.click()
      }
    }, WANT)
    await page.waitForTimeout(400)
  } else {
    for (let i = 0; i < WANT.length; i++) {
      /* a press on an empty step, the click that used to move everything one place along, and it has to do nothing at all now */
      if (way.touchSlots) { await clickSlot(4); await page.waitForTimeout(150) }
      await clickText('.bt-card', WANT[i])
      await page.waitForTimeout(200)
    }
  }

  /* every step holds what he put in it, which is what was really wrong: the answers were right and they were in the wrong wells */
  const wells = await page.evaluate(() => [...document.querySelectorAll('.bt-slotwell')]
    .map((w) => w.textContent.trim()))
  ok(`${way.key}: every step holds the instruction he chose for it`,
    JSON.stringify(wells) === JSON.stringify(WANT), JSON.stringify(wells))

  await shot('01-filled')
  /* through the harness, which reads innerText: the commit plank wraps its word in a span beside the reason, so an exact textContent match never finds it */
  const pressRun = async () => {
    const v = await look()
    const b2 = v.press.find((e) => /^RUN$/i.test(e.text))
    if (!b2) return false
    await page.mouse.click(b2.box.x + b2.box.w / 2, b2.box.y + b2.box.h / 2)
    return true
  }
  ok(`${way.key}: RUN is live once every step is filled`, await pressRun())
  /* watched rather than timed: the body takes one cell every 420ms and the line only comes up when it stops, so a fixed sleep races the length of the answer and lost one run in two */
  let ran = null
  for (let i = 0; i < 40; i++) {
    ran = await page.evaluate(() => document.querySelector('.bt-ran')?.textContent?.trim() ?? null)
    if (ran) break
    await page.waitForTimeout(400)
  }
  ok(`${way.key}: the program runs and reaches the flag`, /reached the flag/i.test(ran ?? ''), ran ?? 'nothing said')

  const press = async (re) => {
    const v = await look()
    const b = v.press.find((e) => re.test(e.text))
    if (!b) return false
    await page.mouse.click(b.box.x + b.box.w / 2, b.box.y + b.box.h / 2)
    return true
  }
  await press(/Keep going/i); await page.waitForTimeout(1000)
  await press(/Show up after school/i); await page.waitForTimeout(800)
  await press(/Keep going|Check/i); await page.waitForTimeout(2400)
  await shot('02-result')

  const marks = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('blhs_save_v2') || 'null')
    const row = s?.ledger?.find((e) => /^atc:the_program(:y\d+)?$/.test(e.id))
    return row ? { grade: row.grade, marks: row.marks } : null
  })
  const full = !!marks && marks.grade === 4
    && JSON.stringify(marks.marks) === JSON.stringify({ 'atc-maze': [5, 5], 'atc-join': [1, 1] })
  ok(`${way.key}: every right answer is marked right`, full, JSON.stringify(marks))
  await finish()
}

console.log(`\n${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
process.exit(fails.length ? 1 : 0)
