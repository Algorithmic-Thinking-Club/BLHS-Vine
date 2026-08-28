/* Drive the grape proof through a real browser and prove it, or fail loudly.
 *
 * Not a unit test. It opens the app, waits for the real dialogue box, clicks
 * the SECOND choice on purpose, and checks that Python printed the number 1
 * back into the next line. A default, a stub or a hard-coded string cannot pass
 * that, because index 1 only exists if the click crossed the worker boundary
 * and came back into the member's if statement.
 *
 * Run against whichever server is up:
 *   node scripts/grape-proof.mjs http://localhost:5173     (npm run dev)
 *   node scripts/grape-proof.mjs http://localhost:4173     (vite preview)
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const tag = process.argv[3] ?? 'dev'
const shots = 'reference/_archive/build-shots/grape'
mkdirSync(shots, { recursive: true })

let failures = 0
const check = (name, got, want) => {
  const ok = typeof want === 'string' ? got.includes(want) : want.test(got)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${JSON.stringify(got).slice(0, 150)}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => { console.log(`  [pageerror] ${e.message}`); failures++ })
page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console.error] ${m.text()}`) })

const line = () => page.textContent('.cs-dialogue-text')
/* the box is a typewriter: the hint only appears once the line has finished
 * drawing, so waiting on it is waiting for a settled frame */
const settled = () => page.waitForSelector('.cs-continue-hint', { timeout: 30000 })
const shot = (n) => page.screenshot({ path: `${shots}/${tag}-${n}.png` })

console.log(`\n=== ${tag}: ${base} ===\n\nhello.py`)
await page.goto(`${base}/?scene=grape`, { waitUntil: 'domcontentloaded', timeout: 30000 })

// 1. a .py file made the real dialogue box show a line
await page.waitForSelector('.cs-dialogue', { timeout: 60000 })
await settled()
check('a line from hello.py is in the real dialogue box', await line(), 'running in a worker')
await shot('1-say')

// 2. it presents a choice
await page.click('.dlg-box')
await page.waitForSelector('.dlg-choice', { timeout: 30000 })
const options = await page.$$eval('.dlg-choice', (b) => b.map((x) => x.textContent.trim()))
check('choose rendered both options as buttons', options.join(' | '), 'I believe you.')
check('the prompt came from the python side', await line(), 'Which way?')
await shot('2-choose')

// 3. the chosen index arrives back in Python and changes the next line.
//    Deliberately the SECOND button: only a real round trip can say "1".
await page.click('.dlg-choice:nth-child(2)')
await settled()
const branched = await line()
check('python received the index that was clicked', branched, 'You clicked button 1')
check('python took the else branch, not the if', branched, /other branch/)
await shot('3-branched')

await page.click('.dlg-box')
await settled()
check('the branch continues on the python side', await line(), 'Same file, different line')
await shot('4-next')

// 4. the sandbox: a member's raise stops the island, not the game
console.log('\nbroken.py')
await page.goto(`${base}/?scene=grape&py=broken.py`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForSelector('.cs-dialogue', { timeout: 60000 })
await settled()
await page.click('.dlg-box')
await page.waitForSelector('.dlg-choice', { timeout: 30000 })
await page.click('.dlg-choice:nth-child(1)')

const panel = await page.waitForSelector('text=island under construction', { timeout: 30000 })
check('a raise shows the player "island under construction"', await panel.textContent(), 'island under construction')
const body = await page.textContent('body')
check('the traceback names the member file', body, 'broken.py')
check('the traceback names the line they wrote', body, /line 20/)
check('and says what was actually wrong', body, "unsupported types for __add__: 'int', 'str'")
await shot('5-under-construction')

// the game kept running: the page is still live and can start the island again
await page.click('button:has-text("run it again")')
await page.waitForSelector('.cs-dialogue', { timeout: 30000 })
await settled()
check('the engine survived it and reran the island', await line(), 'I am going to break')
await shot('6-still-running')

// 5. a filename the filesystem would refuse used to hang the harness on
//    "is running" with nothing on screen, which is the one failure the sandbox
//    exists to prevent. ?py=.. normalises to / and fetches index.html.
console.log('\na filename that is not a filename')
await page.goto(`${base}/?scene=grape&py=..`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForSelector('.cs-dialogue', { timeout: 60000 })
await settled()
check('a junk ?py= falls back instead of hanging', await line(), 'running in a worker')

await browser.close()
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} — shots in ${shots}/${tag}-*.png\n`)
process.exit(failures ? 1 : 0)
