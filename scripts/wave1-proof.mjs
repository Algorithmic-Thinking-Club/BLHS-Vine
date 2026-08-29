/* THE WAVE GATE, driven through a real browser, or it fails loudly.
 *
 * Not a unit test. It opens the Maw stand-in and asks the shipped code for the
 * five things the wave is supposed to have bought:
 *
 *   1. a scripted line and a choice through the REAL dialogue box
 *   2. a guide arrow that paths around a wall
 *   3. a trigger firing on entry, with nobody pressing anything
 *   4. a cutscene playing on a painted map
 *   5. and the thirteen CutsceneStage methods actually doing their jobs
 *
 * Every check goes through the same path a member's Python will: an intent, into
 * `performIntent`, into the scene's `IntentWorld`. The debug hooks are handles on
 * the shipped code and not a second copy of it, which is the only way a proof run
 * proves anything.
 *
 * Run against whichever server is up:
 *   node scripts/wave1-proof.mjs http://localhost:5173     (npm run dev)
 *   node scripts/wave1-proof.mjs http://localhost:4173     (vite preview)
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const tag = process.argv[3] ?? 'dev'
const shots = 'reference/_archive/build-shots/wave1'
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, got, want) => {
  const s = typeof got === 'string' ? got : JSON.stringify(got)
  const ok = want instanceof RegExp ? want.test(s)
    : typeof want === 'function' ? !!want(got)
      : s.includes(String(want))
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${s.slice(0, 190)}`)
  if (!ok) failures++
}

/* a run that has finished the intro and has not seen the founding event, which is
 * the state the Maw's own objective table expects on a first walk in */
const SAVE = {
  v: 2, id: 'r_proof', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => { console.log(`  [pageerror] ${e.message}`); failures++ })
page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console.error] ${m.text()}`) })
await page.addInitScript((s) => { localStorage.setItem('blhs_save_v2', JSON.stringify(s)) }, SAVE)

const shot = (n) => page.screenshot({ path: `${shots}/${tag}-${n}.png` })
const line = () => page.textContent('.cs-dialogue-text').catch(() => '')
const settled = () => page.waitForSelector('.cs-continue-hint, .dlg-choice', { timeout: 20000 })
const json = (fn, ...a) => page.evaluate(([f, args]) => JSON.parse(window[f](...args)), [fn, a])

console.log(`\n=== wave 1 · ${tag}: ${base} ===\n`)
await page.goto(`${base}/?scene=pmap&map=panther-maw&src=local`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 60000 })

const anchors = await json('__anchors')
check('the Maw stand-in loaded with its anchors', anchors.map((a) => a.name).join(','), 'principal_desk')
check('and the stand-in carries a trigger, which no anchor kind ever fired',
  anchors.filter((a) => a.kind === 'trigger').map((a) => a.name).join(','), 'hall_step')

// ---------------------------------------------------------------- 3. a trigger
console.log('\n3 · a trigger fires on entry, with nobody pressing anything')
await page.keyboard.down('ArrowUp')
await page.waitForFunction(() => JSON.parse(window.__zones()).fired.includes('hall_step'), null, { timeout: 20000 })
await page.keyboard.up('ArrowUp')
await settled()
check('walking in fired hall_step by ENTRY, not by a prompt', await line(), 'The bridge ends')
check('and the zone set says which one is inside and which has fired', await json('__zones'), 'hall_step')
await shot('1-trigger')
await page.click('.cs-dialogue')
await page.waitForFunction(() => !document.querySelector('.cs-dialogue'), null, { timeout: 10000 })

// -------------------------------------------------- 1. a line and a choice
console.log('\n1 · a scripted line and a choice through the real box')
check('the counselor station started', await page.evaluate(() => window.__station('counselor')), 'fired')
await settled()
check('a station body put a line in the one dialogue box', await line(), /cape|settled|of 5|of 2|of 4/)
await shot('2-say')
// click through the counselor's lines until the choice is on screen
for (let i = 0; i < 8; i++) {
  if (await page.$('.dlg-choice')) break
  await page.click('.cs-dialogue')
  await settled().catch(() => {})
}
const options = await page.$$eval('.dlg-choice', (b) => b.map((x) => x.textContent.trim()))
check('choose rendered every option as a real button', options.join(' | '), 'Show me the board')
check('and printed the number key beside it, so a keyboard can answer too', options.join(' | '), /1.*Show me/)
await shot('3-choose')
await page.click('.dlg-choice:nth-child(2)')            // "Not now": no panel, back to the world
await page.waitForFunction(() => !document.querySelector('.dlg-choice'), null, { timeout: 10000 })

// ------------------------------------------------------------ 2. the guide
console.log('\n2 · a guide arrow that paths around a wall')
// back onto the bridge, where the only way to the chart table is up and then left
await page.evaluate(() => window.__warp(256, 430))
await page.evaluate(() => window.__intent({ kind: 'guide_to', anchor: 'chart_table' }))
await page.waitForTimeout(400)
const guide = await json('__guide')
check('guide_to found a real route rather than pointing through the rock', guide, (g) => g.reached === true)
check('and the route has waypoints, which a straight line does not', guide, (g) => g.route > 3)
/* the wall: from the bridge at x=256 the chart table at x=170 is behind the pit,
 * so a straight line leaves the floor. The arrow leads UP the bridge first. */
check('the arrow leads up the bridge, not across the pit', guide, (g) => g.lead && g.lead.y < 420 && Math.abs(g.lead.x - 256) < 60)
await shot('4-guide')

// --------------------------------------------------------- 4 + 5. the stage
console.log('\n4 · a cutscene playing on the Maw stand-in, and the stage under it')
const before = await json('__cs')
check('nothing is running before it is asked for', before, (c) => c.running === false)
check('the principal station started', await page.evaluate(() => window.__station('principal_desk')), 'fired')
await page.waitForFunction(() => JSON.parse(window.__cs()).running === true, null, { timeout: 20000 })
/* the first steps are a letterbox, a vignette and a 900ms camera push, and the
 * camera step BLOCKS, so a fixed wait here samples the scene before it speaks */
await page.waitForFunction(() => !!JSON.parse(window.__cs()).line, null, { timeout: 20000 })
const mid = await json('__cs')
check('the runtime is running a script on a PAINTED map', mid, (c) => c.running === true)
check('letterbox is a stage-owned bar and it is up', mid, (c) => c.letterbox > 0.2)
check('the vignette closed on the desk', mid, (c) => c.vignette > 0.2)
check('cameraSet took the camera off the follow law, at the anchor and zoomed in',
  mid, (c) => !!c.cam && c.cam.zoom > 1 && Math.abs(c.cam.x - 196) < 40)
check('the script is speaking', mid, (c) => !!c.line && c.line.length > 0)
/* AND IT IS THE SAME BOX. The cutscene used to draw its own plaque and its own
 * text node; a line from a script and a line from the counselor are one picture
 * now, so the class the station's line was found in is the class this one is in. */
await page.waitForSelector('.cs-dialogue-text', { timeout: 10000 })
check('the script draws into THE ONE dialogue box, the same one the station used',
  await line(), (t) => t.length > 0)
check('and the name plaque is the same component too', await page.textContent('.cs-nameplaque'), 'Principal Panther')
/* NOTHING ELSE IS ON SCREEN OVER IT. The year vignette's own rule is "only while
 * the world is quiet" and it used to check this component's own panels alone, so
 * a cutscene mid-shot counted as quiet and the year's opening lines mounted
 * straight over it. One box on screen means one box on screen. */
check('exactly one dialogue box is on screen during the script',
  await page.$$eval('.cs-dialogue', (n) => n.length), (n) => n === 1)
await settled()                                   // let the typewriter finish drawing it
check('and the line on it is the script, not the year vignette',
  await line(), (t) => /made it inside|Maw|chart table/.test(t))
await shot('5-cutscene')

// click the script through its lines; the gate at the end hands control back
for (let i = 0; i < 14; i++) {
  const st = await json('__cs')
  if (!st.running) break
  await page.evaluate(() => window.__advance())
  await page.waitForTimeout(320)
}
// the last step is a walkTo gate: the runtime auto-walks him after its idle clock
await page.waitForFunction(() => JSON.parse(window.__cs()).running === false, null, { timeout: 30000 })
const after = await json('__cs')
check('the script finished and gave the camera back', after, (c) => c.running === false && c.cam === null)
const flag = await page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2')).flags)
check('and the flag was written from a REAL completion, not from a call that always resolved', flag.join(','), 'maw:founding')
await shot('6-after')

// the world is walkable again: nothing held the controls after the script
await page.keyboard.down('ArrowLeft')
await page.waitForTimeout(700)
await page.keyboard.up('ArrowLeft')
const walk = await page.evaluate(() => window.__walk)
check('the controls came back: he moves after the cutscene', walk, /thor \d+/)
await shot('7-walkable')

await browser.close()
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} — shots in ${shots}/${tag}-*.png\n`)
process.exit(failures ? 1 : 0)
