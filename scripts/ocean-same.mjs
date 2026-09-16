/* proves a change to the water draws the same picture, by pinning the clock and diffing
 *
 *   node scripts/ocean-same.mjs before      capture the reference frames
 *   node scripts/ocean-same.mjs after       capture again and diff against them
 *
 * The sea never stops, so two captures a millisecond apart differ everywhere. Every
 * shot here is taken with performance.now frozen, which makes the swell, the tide and
 * the foam pure functions of one number and the frame reproducible.
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import fs from 'node:fs'
import path from 'node:path'

const MODE = process.argv[2] === 'after' ? 'after' : 'before'
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const BASE = arg('base', 'http://localhost:4173')
const DIR = path.resolve('reference/_archive/build-shots/ocean-same')
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

/* the save the beach opens in free roam on, and three fixed places to stand */
const SAVE = {
  v: 2, id: 'r_same', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, plans: {},
  flags: ['read_the_bottle'], tokens: ['Fall', 'Winter', 'Spring'], ledger: [], ranks: {},
  islands: {}, exposure: [{ place: 'home-island', docked: true }], completions: [],
  stickers: [], facts: ['the_bottle'], badges: [], savedAt: 1,
}

/* how many drawn frames each shot is taken after, which is what fixes the wave */
const PINNED = [300, 420, 540]
const SPOTS = ['52,58', '40,70', '64,50']

fs.mkdirSync(DIR, { recursive: true })

const shots = []
let hidFailure = false
for (let i = 0; i < SPOTS.length; i++) {
  const browser = await chromium.launch({ headless: true, args: GPU })
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.addInitScript((save) => {
    try { localStorage.clear(); localStorage.setItem('blhs_save_v2', JSON.stringify(save)) } catch {}
    /* a clock that only moves when a frame is drawn, so the same number of frames
     * always lands on the same picture however fast the machine ran them. freezing a
     * real clock after the fact is not enough: the state at the moment of freezing
     * still depends on how many frames happened to run before it. */
    let vnow = 0
    let step = 1000 / 60
    const raf = window.requestAnimationFrame.bind(window)
    let frames = 0
    window.requestAnimationFrame = (cb) => raf(() => { vnow += step; frames++; cb(vnow) })
    performance.now = () => vnow
    const realDate = Date.now()
    Date.now = () => realDate + Math.round(vnow)
    Object.defineProperty(window, '__frames', { get: () => frames })
    /* once the clock stops, every further frame redraws the same state, so the shot
     * cannot land a few frames later than it did on the other run */
    window.__freeze = () => { step = 0 }
  }, SAVE)
  await page.goto(`${BASE}/?scene=beach&deep=1&spawn=${SPOTS[i]}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__thor, null, { timeout: 60000 })
  /* wait for a fixed count of DRAWN frames rather than a fixed number of milliseconds */
  await page.waitForFunction((n) => window.__frames >= n, PINNED[i], { timeout: 120000 })
  await page.evaluate(() => window.__freeze())
  await page.waitForTimeout(400)
  /* the exact claim the cull makes, checked rather than eyeballed: no tile that the
   * window can reach was hidden. a screenshot can only ever agree with this. */
  const g = await page.evaluate(() => (window.__ground ? JSON.parse(window.__ground()) : null))
  if (g) {
    console.log(`${g.hiddenOnScreen === 0 ? 'PASS' : 'FAIL'}  frame ${i}: ${g.visible} of ${g.total} ground tiles drawn, ${g.swelling} swelling, ${g.hiddenOnScreen} hidden while on screen`)
    if (g.hiddenOnScreen !== 0) hidFailure = true
  }
  const file = path.join(DIR, `${MODE}-${i}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  console.log(`shot ${path.basename(file)}`)
  await browser.close()
}

if (hidFailure) console.log('A TILE THE WINDOW COULD REACH WAS HIDDEN')

if (MODE === 'before') {
  console.log('\nreference frames captured. make the change, rebuild, then run: node scripts/ocean-same.mjs after')
  process.exit(0)
}

let worst = 0
let failed = false
for (let i = 0; i < shots.length; i++) {
  const a = PNG.sync.read(fs.readFileSync(path.join(DIR, `before-${i}.png`)))
  const b = PNG.sync.read(fs.readFileSync(path.join(DIR, `after-${i}.png`)))
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`FAIL  frame ${i}: ${a.width}x${a.height} became ${b.width}x${b.height}`)
    failed = true
    continue
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.05 })
  fs.writeFileSync(path.join(DIR, `diff-${i}.png`), PNG.sync.write(diff))
  const pct = (n / (a.width * a.height)) * 100
  worst = Math.max(worst, pct)
  console.log(`${n === 0 ? 'PASS' : 'DIFF'}  frame ${i}: ${n} pixels changed (${pct.toFixed(4)}% of ${a.width}x${a.height})`)
  if (n !== 0) failed = true
}
console.log(`\nworst frame differs by ${worst.toFixed(4)}%`)
process.exit(failed || hidFailure ? 1 : 0)
