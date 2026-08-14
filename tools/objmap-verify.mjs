// Verify ?scene=objmap in a real browser: console errors, object/collision counts, and a
// walk test that proves the measured footprints actually stop the character.
import { chromium } from 'playwright'
import fs from 'fs'

const BASE = process.env.BASE || 'http://localhost:5188'
const OUT = 'c:/Users/ashcy/AdventureGame/.tmp_objmap'
fs.mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(`${BASE}/?scene=objmap`, { waitUntil: 'load' })
await page.waitForFunction(() => typeof window.__objdebug === 'function', { timeout: 60000 })
await page.waitForTimeout(2500)

const dbg = await page.evaluate(() => window.__objdebug())
console.log('OBJDEBUG', JSON.stringify(dbg, null, 2))

// probe a few authored points: open sea, the promenade, and dead centre of the pavilion
const probes = {}
for (const [k, [x, y]] of Object.entries({
  seaOpen: [800, 200], promenade: [700, 742], pavilion: [598, 528],
  tavern: [1262, 700], statue: [842, 616], laneB: [900, 800], laneC: [392, 700],
  boulderLaneC: [346, 822], marketFloor: [502, 600], backLane: [1470, 700],
})) probes[k] = await page.evaluate(([x, y]) => window.__probe(x, y), [x, y])
console.log('PROBES', JSON.stringify(probes, null, 2))

// --- walk test: put Thor just up-screen of the panther statue and push down into it ---
async function walkTest(name, from, key, ms) {
  await page.evaluate(([x, y]) => window.__warp(x, y), from)
  await page.waitForTimeout(150)
  const a = await page.evaluate(() => window.__objdebug().thor)
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
  await page.waitForTimeout(200)
  const b = await page.evaluate(() => window.__objdebug().thor)
  console.log(`WALK ${name}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}  d=(${(b.x - a.x).toFixed(1)}, ${(b.y - a.y).toFixed(1)})`)
  return { a, b }
}
// free walk on the promenade (should move a lot)
await walkTest('free-east', [640, 745], 'd', 1400)
// into the panther statue from below (should be stopped short)
await walkTest('into-statue', [842, 700], 'w', 1600)
// into the tavern facade from below
await walkTest('into-tavern', [1262, 800], 'w', 1600)
// into the sea from the beach (ground walkability)
await walkTest('into-sea', [700, 560], 'w', 2200)

// screenshots
await page.evaluate(([x, y]) => window.__warp(x, y), [860, 720])
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/plaza.png` })
await page.evaluate(([x, y]) => window.__warp(x, y), [300, 700])
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/fish-quarter.png` })
await page.evaluate(([x, y]) => window.__warp(x, y), [1250, 800])
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/tavern.png` })

// wide shot
const wide = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
wide.on('pageerror', (e) => errors.push('pageerror(wide): ' + e.message))
await wide.goto(`${BASE}/?scene=objmap&zoom=0.85&spawn=800,700`, { waitUntil: 'load' })
await wide.waitForFunction(() => typeof window.__objdebug === 'function', { timeout: 60000 })
await wide.waitForTimeout(3000)
await wide.screenshot({ path: `${OUT}/wide.png` })

// debug overlay
const dbgPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
dbgPage.on('pageerror', (e) => errors.push('pageerror(dbg): ' + e.message))
await dbgPage.goto(`${BASE}/?scene=objmap&dbg=1&zoom=0.85&spawn=800,700`, { waitUntil: 'load' })
await dbgPage.waitForFunction(() => typeof window.__objdebug === 'function', { timeout: 60000 })
await dbgPage.waitForTimeout(3000)
await dbgPage.screenshot({ path: `${OUT}/dbg.png` })

console.log('CONSOLE ERRORS', errors.length, JSON.stringify(errors.slice(0, 20), null, 2))
await browser.close()
