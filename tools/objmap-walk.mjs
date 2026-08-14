// Walk + collision proof for ?scene=objmap.
// Screen directions on a 2:1 iso lattice are key PAIRS: up = W+A, down = S+D, right = W+D, left = A+S.
//
// The real invariants (not a distance threshold):
//   I1  pushing into painted art never leaves the character standing INSIDE a measured footprint
//   I2  the character never ends on a non-walkable cell (sea, or a cell the art took out)
//   I3  open lanes are genuinely open (he covers real distance)
import { chromium } from 'playwright'

const BASE = 'http://localhost:5188'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
p.on('pageerror', (e) => errs.push('PE: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text()) })
await p.goto(`${BASE}/?scene=objmap`, { waitUntil: 'load' })
await p.waitForFunction(() => typeof window.__objdebug === 'function', { timeout: 60000 })
await p.waitForTimeout(2000)

const DIR = { up: ['w', 'a'], down: ['s', 'd'], right: ['w', 'd'], left: ['a', 's'] }
const hold = async (dir, ms) => {
  for (const k of DIR[dir]) await p.keyboard.down(k)
  await p.waitForTimeout(ms)
  for (const k of DIR[dir]) await p.keyboard.up(k)
  await p.waitForTimeout(200)
}
const where = () => p.evaluate(() => {
  const t = window.__objdebug().thor
  return { ...t, ...window.__probe(t.x, t.y) }
})

let pass = 0, total = 0
const check = (ok, msg) => { total++; if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`) }

// --- I3: the composed walking lanes are open ---
for (const [name, from, dir] of [
  ['Lane A promenade, east', [560, 760], 'right'],
  ['Lane A promenade, west', [1000, 780], 'left'],
  ['Lane B pier approach', [830, 980], 'up'],
  ['Lane C market lane', [400, 840], 'up'],
  ['Lane D back lane', [1470, 800], 'up'],
  ['open foreground', [700, 800], 'down'],
]) {
  await p.evaluate(([x, y]) => window.__warp(x, y), from)
  await p.waitForTimeout(180)
  const a = await where()
  await hold(dir, 2400)
  const c = await where()
  const dist = Math.hypot(c.x - a.x, c.y - a.y)
  check(dist > 55, `open lane  ${name.padEnd(24)} moved ${dist.toFixed(0)}px  (${a.x},${a.y}) -> (${c.x},${c.y})`)
}

// --- I1 + I2: push hard into every anchor object; he must stop clean and legal ---
for (const [name, from] of [
  ['panther statue', [842, 700]],
  ['tavern facade', [1262, 812]],
  ['pavilion', [598, 612]],
  ['harbor shed (fish quarter)', [186, 552]],
  ['harbor shed (right)', [1476, 680]],
  ['house-v5', [1392, 600]],
  ['crane works freight', [1150, 640]],
  ['gate arch post', [930, 630]],
  ['bottom-left palm', [86, 1040]],
  ['net rack (foreground)', [1108, 1110]],
  ['boulder, Lane C mouth', [346, 900]],
  ['market stall row', [468, 640]],
]) {
  await p.evaluate(([x, y]) => window.__warp(x, y), from)
  await p.waitForTimeout(180)
  await hold('up', 3000)
  const c = await where()
  check(c.insideFootprints === 0 && c.walkable,
    `blocked    ${name.padEnd(24)} stopped at (${c.x},${c.y})  inside=${c.insideFootprints} walkable=${c.walkable} cell=${c.cell}`)
}

// --- ground walkability: the sea refuses him ---
await p.evaluate(() => window.__warp(1000, 620))
await p.waitForTimeout(180)
const seaA = await where()
await hold('up', 3500)
const seaB = await where()
check(seaB.cell === 'sand' && Math.hypot(seaB.x - seaA.x, seaB.y - seaA.y) < 200,
  `sea edge   held at the waterline: (${seaA.x},${seaA.y}) -> (${seaB.x},${seaB.y}) cell=${seaB.cell}`)

// --- depenetration: warp him INTO the measured footprint (the collider sits at the base-band
// CENTROID, i.e. up-screen of the sprite's front corner, so aim ~20-40px above the feet point)
// and confirm the scene resolves him back out instead of wedging. ---
for (const [name, feet] of [
  ['statue', [842, 620]], ['tavern', [1262, 706]], ['pavilion', [598, 532]],
  ['house-v5', [1392, 520]], ['harbor shed', [186, 470]], ['foreground palm', [86, 968]],
  ['crane', [1150, 486]], ['gate arch', [930, 548]], ['net rack fg', [1108, 1040]],
]) {
  // walk up from the feet contact point until we find a spot genuinely inside the footprint
  const at = await p.evaluate(([fx, fy]) => {
    for (let dy = 0; dy <= 60; dy += 3) {
      for (const dx of [0, -18, 18, -36, 36]) {
        if (window.__probe(fx + dx, fy - dy).insideFootprints > 0) return [fx + dx, fy - dy]
      }
    }
    return [fx, fy]
  }, feet)
  const before = await p.evaluate(([x, y]) => window.__probe(x, y).insideFootprints, at)
  await p.evaluate(([x, y]) => window.__warp(x, y), at)
  await p.waitForTimeout(1400)
  const c = await where()
  check(before > 0 && c.insideFootprints === 0,
    `depenetrate ${name.padEnd(23)} dropped inside ${before} footprint(s) -> escaped to (${c.x},${c.y}) inside=${c.insideFootprints}`)
}

// --- stress: 70s of random walking. He may never end a step inside art or off the ground. ---
await p.evaluate(() => window.__warp(760, 760))
let violations = 0, samples = 0, minX = 9e9, maxX = -9e9, minY = 9e9, maxY = -9e9
const dirs = ['up', 'down', 'left', 'right']
for (let i = 0; i < 70; i++) {
  await hold(dirs[Math.floor(Math.random() * 4)], 900 + Math.random() * 700)
  const c = await where()
  samples++
  if (c.insideFootprints > 0 || !c.walkable) { violations++; if (violations < 4) console.log('  violation at', c.x, c.y, c.insideFootprints, c.walkable, c.cell) }
  minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y)
}
check(violations === 0, `stress     ${samples} random walks, ${violations} violations; roamed x[${minX.toFixed(0)}..${maxX.toFixed(0)}] y[${minY.toFixed(0)}..${maxY.toFixed(0)}]`)

console.log(`\n${pass}/${total} assertions passed.  console errors: ${errs.length}`)
if (errs.length) console.log(errs.slice(0, 10))
await b.close()
