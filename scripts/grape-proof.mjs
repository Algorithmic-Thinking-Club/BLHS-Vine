/* browser proof of the grape path, not a unit test: it clicks the SECOND choice on purpose, so only a click that crossed the worker boundary and came back into the if statement can print index 1 into the next line; run it as node scripts/grape-proof.mjs http://localhost:5173 for dev or :4173 for vite preview */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
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
/* the box is a typewriter, so the continue hint only appears once the line has finished drawing and waiting on it is waiting for a settled frame */
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
check('choose rendered both options as buttons', options.join(' | '), 'Pick the second one.')
check('the prompt came from the python side', await line(), 'Pick a button.')
await shot('2-choose')

// the second button on purpose: only a real round trip back into Python can answer with index 1 and take the else branch
await page.click('.dlg-choice:nth-child(2)')
await settled()
const branched = await line()
check('python received the index that was clicked', branched, 'You clicked button 1')
check('python took the else branch, not the if', branched, /other branch/)
await shot('3-branched')

await page.click('.dlg-box')
await settled()
check('the branch continues on the python side', await line(), 'You picked the second button')
await shot('4-next')

// 4. the sandbox: a member's raise stops the island, not the game
console.log('\nbroken.py')
await page.goto(`${base}/?scene=grape&py=broken.py`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForSelector('.cs-dialogue', { timeout: 60000 })
await settled()
await page.click('.dlg-box')
await page.waitForSelector('.dlg-choice', { timeout: 30000 })
await page.click('.dlg-choice:nth-child(1)')

const panel = await page.waitForSelector('text=This island stopped working', { timeout: 30000 })
check('a raise shows the player "This island stopped working"', await panel.textContent(), 'This island stopped working')
const body = await page.textContent('body')
check('the traceback names the member file', body, 'broken.py')
check('the traceback names the line they wrote', body, /line 20/)
check('and says what was actually wrong', body, "unsupported types for __add__: 'int', 'str'")
await shot('5-under-construction')

// the game kept running: the page is still live and can start the island again
await page.click('button:has-text("Load the island again")')
await page.waitForSelector('.cs-dialogue', { timeout: 30000 })
await settled()
check('the engine survived it and reran the island', await line(), 'I am going to break')
await shot('6-still-running')

// a filename the filesystem would refuse must fall back rather than hang the harness on is-running with nothing on screen, and ?py=.. normalises to / and fetches index.html
console.log('\na filename that is not a filename')
await page.goto(`${base}/?scene=grape&py=..`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForSelector('.cs-dialogue', { timeout: 60000 })
await settled()
check('a junk ?py= falls back instead of hanging', await line(), 'running in a worker')

await browser.close()
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} — shots in ${shots}/${tag}-*.png\n`)
process.exit(failures ? 1 : 0)
