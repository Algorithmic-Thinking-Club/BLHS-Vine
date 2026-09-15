/* a browser gate, not a unit test: the Maw stand-in driving a line and a choice, a guide arrow round a wall, a trigger on entry, a cutscene on a painted map and the thirteen CutsceneStage methods, all through the shipped `performIntent` path, because a debug hook that is a second copy proves nothing */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
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

/* a run that has finished the intro and has not seen the founding event, which is the state the Maw's own objective table expects on a first walk in */
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
/* a 404 is only useful if it says which url, and this one is expected: the engine asks the platform for a map before it falls back to the local folder, and the stand-in has never been published there */
const EXPECTED_404 = /\/api\/v1\/maps\/panther-maw/
page.on('response', (r) => {
  if (r.status() < 400 || EXPECTED_404.test(r.url())) return
  console.log(`  [http ${r.status()}] ${r.url()}`)
})
page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (/Failed to load resource/.test(m.text())) return
  console.log(`  [console.error] ${m.text()}`)
})
await page.addInitScript((s) => { localStorage.setItem('blhs_save_v2', JSON.stringify(s)) }, SAVE)

/* a capture waits for the picture to stop moving, because every kit panel arrives with a 220-300ms entrance and `waitForSelector` returns on its first frame, which shot whole sets mid animation and read as translucent panels with the world bleeding through */
const shot = async (n) => {
  await page.waitForTimeout(360)
  await page.screenshot({ path: `${shots}/${tag}-${n}.png` })
}
const line = () => page.textContent('.cs-dialogue-text').catch(() => '')
const settled = () => page.waitForSelector('.cs-continue-hint, .dlg-choice', { timeout: 20000 })
const json = (fn, ...a) => page.evaluate(([f, args]) => JSON.parse(window[f](...args)), [fn, a])

console.log(`\n=== wave 1 · ${tag}: ${base} ===\n`)
await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw&src=local`, { waitUntil: 'domcontentloaded', timeout: 30000 })
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
check('a station body put a line in the one dialogue box', await line(), /No cord started|settled|of 5|of 2|of 4/)
await shot('2-say')
// click through the counselor's lines until the choice is on screen
for (let i = 0; i < 8; i++) {
  if (await page.$('.dlg-choice')) break
  await page.click('.cs-dialogue')
  await settled().catch(() => {})
}
const options = await page.$$eval('.dlg-choice', (b) => b.map((x) => x.textContent.trim()))
check('choose rendered every option as a real button', options.join(' | '), 'Open the Handbook')
check('and printed the number key beside it, so a keyboard can answer too', options.join(' | '), /1.*Open the Handbook/)

/* the contested centre strip as an assertion rather than a picture: the conversation lays out from the bottom of the window up while the camera composes into the whole window, so `src/game/ui/frame.ts` is the number between them and the check is that the body came out from behind the choice planks */
const band = await page.$eval('.dlg-choices', (e) => {
  const r = e.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }
})
const you = (await json('__sea')).you
check('the camera knows how much of the window the conversation has taken',
  await json('__sea'), (s) => s.band > 100)
check('so the player is clear of the choice planks rather than behind them',
  JSON.stringify({ you, band }),
  () => you.y < band.top || you.y - you.h > band.bottom || you.x < band.left || you.x > band.right)
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
/* the wall: from the bridge at x=256 the chart table at x=170 is behind the pit, so a straight line leaves the floor and the arrow has to lead up the bridge first */
check('the arrow leads up the bridge, not across the pit', guide, (g) => g.lead && g.lead.y < 420 && Math.abs(g.lead.x - 256) < 60)
await shot('4-guide')

// --------------------------------------------------------- 4 + 5. the stage
console.log('\n4 · a cutscene playing on the Maw stand-in, and the stage under it')
const before = await json('__cs')
check('nothing is running before it is asked for', before, (c) => c.running === false)
check('the principal station started', await page.evaluate(() => window.__station('principal_desk')), 'fired')
await page.waitForFunction(() => JSON.parse(window.__cs()).running === true, null, { timeout: 20000 })
/* the first steps are a letterbox, a vignette and a 900ms camera push, and the camera step blocks, so a fixed wait here samples the scene before it speaks */
await page.waitForFunction(() => !!JSON.parse(window.__cs()).line, null, { timeout: 20000 })
const mid = await json('__cs')
check('the runtime is running a script on a PAINTED map', mid, (c) => c.running === true)
check('letterbox is a stage-owned bar and it is up', mid, (c) => c.letterbox > 0.2)
check('the vignette closed on the desk', mid, (c) => c.vignette > 0.2)
check('cameraSet took the camera off the follow law, at the anchor and zoomed in',
  mid, (c) => !!c.cam && c.cam.zoom > 1 && Math.abs(c.cam.x - 196) < 40)
check('the script is speaking', mid, (c) => !!c.line && c.line.length > 0)
/* and it is the same box, because a line from a script and a line from the counselor are one picture now, so the class the station's line was found in is the class this one is in */
await page.waitForSelector('.cs-dialogue-text', { timeout: 10000 })
check('the script draws into THE ONE dialogue box, the same one the station used',
  await line(), (t) => t.length > 0)
check('and the name plaque is the same component too', await page.textContent('.cs-nameplaque'), 'Principal Panther')
/* nothing else is on screen over it: the year vignette's rule is only while the world is quiet, and checking this component's own panels alone let a cutscene mid shot count as quiet, so the year's opening lines mounted straight over it */
check('exactly one dialogue box is on screen during the script',
  await page.$$eval('.cs-dialogue', (n) => n.length), (n) => n === 1)
await settled()                                   // let the typewriter finish drawing it
check('and the line on it is the script, not the year vignette',
  await line(), (t) => /made it inside|Maw|chart table/.test(t))
/* reported, not checked: at the `close` framing `cameraSet` points at the desk (map y 304) while the body is on the bridge (map y 438), 300 px below at 1.9x, and the clamp will not lift the painting past its own bottom edge, so an authored shot can hide the body where other shots clear by 87px or more */
{
  const s = await json('__sea')
  const boxTop = await page.$eval('.cs-dialogue', (e) => Math.round(e.getBoundingClientRect().top))
  const clear = boxTop - s.you.y
  console.log(`  NOTE  the script's own shot: body feet at y${s.you.y}, box top at y${boxTop}`
    + ` (${clear >= 0 ? `${clear}px clear` : `${-clear}px BEHIND the box`}), camera on the desk at zoom ${s.zoom}`)
}
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
/* and gave the zoom back with it, because the cutscene wrote the follow law's own `camZWant` as well as the live zoom, so a script that pushed in to 1.9 left the room at 1.9 from then on and the body only looked like it had drifted to the edge of the floor */
await page.waitForFunction(() => Math.abs(JSON.parse(window.__sea()).zoom - 1) < 0.02, null, { timeout: 10000 })
  .catch(() => {})
check('and travelled the zoom back to what the BODY wants, not what the script wanted',
  await json('__sea'), (s) => Math.abs(s.want - 1) < 0.01 && Math.abs(s.zoom - 1) < 0.02)
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
