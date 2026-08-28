import fs from 'fs'
import { cleanLife, lifeAt } from './life.mjs'

const W = 688, H = 640, N = W * H
const buf = fs.readFileSync('C:/Users/ashcy/AdventureGame/.tmp-walkaudit/planes.bin')
const L = buf.subarray(3 * N, 4 * N)
const HIP = 2, HIPDY = 1, TOL = 10
const at = (x, y) => {
  const xi = Math.round(x), yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
  return L[yi * W + xi]
}
const near = (a, b) => Math.abs(a - b) <= TOL
const canStandFrom = (x, y, from) => {
  const f = at(x, y)
  if (f === 0 || !near(f, from)) return false
  const h1 = at(x - HIP, y - HIPDY), h2 = at(x + HIP, y - HIPDY)
  return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
}
const canStand = (x, y) => canStandFrom(x, y, at(x, y))

const aj = JSON.parse(fs.readFileSync('C:/Users/ashcy/AdventureGame/.tmp-walkaudit/pub_assets.json', 'utf8'))
const list = aj.assets || []
console.log('placements', list.length, 'atlas', aj.atlas || '(none)')

const withLife = list.filter((a) => cleanLife(a.life))
console.log('with life', withLife.length)

// classify
const rows = []
for (const a of withLife) {
  const lf = cleanLife(a.life)
  const home = { x: a.x, y: a.y }
  const homeStands = canStand(a.x, a.y)
  const homeLvl = at(a.x, a.y)
  // walk 20 minutes of clock at 1/10 s, measure travel
  let px = null, py = null, path = 0, frozen = 0, samples = 0
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
  let offFloor = 0
  const FR = 6000 // 600 s at 0.1 s
  for (let k = 0; k < FR; k++) {
    const t = k * 0.1
    const s = lifeAt(lf, t, home, canStand)
    const x = home.x + s.dx, y = home.y + s.dy
    if (px !== null) { const d = Math.hypot(x - px, y - py); path += d; if (d < 1e-9) frozen++ }
    px = x; py = y; samples++
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y)
    if (lf.walkOnly && !canStand(x, y)) offFloor++
  }
  rows.push({
    id: a.id, kind: lf.kind, walkOnly: !!lf.walkOnly, states: lf.states ? lf.states.length : 0,
    home: [a.x, a.y], homeStands, homeLvl,
    bounds: lf.bounds ? [lf.bounds.x, lf.bounds.y, lf.bounds.w, lf.bounds.h] : null,
    travel: +path.toFixed(1), span: [+(maxx - minx).toFixed(1), +(maxy - miny).toFixed(1)],
    frozenPct: +(100 * frozen / (samples - 1)).toFixed(1),
    offFloorPct: +(100 * offFloor / samples).toFixed(1),
  })
}
rows.sort((a, b) => a.travel - b.travel)
console.log('\n=== every life placement, 600 s of clock at 0.1 s ===')
console.log('id | kind | walkOnly | home | homeStands | lvl | travel px | span | frozen% | offFloor%')
for (const r of rows) console.log(`${r.id} | ${r.kind}${r.states ? '+' + r.states + 'st' : ''} | ${r.walkOnly} | ${r.home} | ${r.homeStands} | ${r.homeLvl} | ${r.travel} | ${r.span} | ${r.frozenPct} | ${r.offFloorPct}`)

const dead = rows.filter((r) => r.travel < 1)
const walkers = rows.filter((r) => r.walkOnly)
console.log(`\nTOTALLY FROZEN (travel < 1px over 600 s): ${dead.length} of ${rows.length}`)
for (const d of dead) console.log('   ', d.id, d.kind, 'home', d.home, 'stands', d.homeStands)
console.log(`walkOnly placements: ${walkers.length}, of which home not standable: ${walkers.filter(r=>!r.homeStands).length}`)
for (const w of walkers.filter(r=>!r.homeStands)) console.log('   OFF-FLOOR HOME:', w.id, w.home, 'lvl', w.homeLvl, 'travel', w.travel)
