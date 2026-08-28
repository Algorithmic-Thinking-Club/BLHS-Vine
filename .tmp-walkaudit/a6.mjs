import fs from 'fs'
import { cleanLife, lifeAt } from './life.mjs'
const T = 'C:/Users/ashcy/AdventureGame/.tmp-walkaudit/'
const W = 688, H = 640, N = W * H
const buf = fs.readFileSync(T + 'planes.bin')
const L = buf.subarray(3 * N, 4 * N)
const HIP = 2, HIPDY = 1, TOL = 10
const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0; return L[yi * W + xi] }
const near = (a, b) => Math.abs(a - b) <= TOL
const csf = (x, y, f0) => { const f = at(x, y); if (f === 0 || !near(f, f0)) return false; const h1 = at(x - HIP, y - HIPDY), h2 = at(x + HIP, y - HIPDY); return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f) }
const canStand = (x, y) => csf(x, y, at(x, y))

const aj = JSON.parse(fs.readFileSync(T + 'pub_assets.json', 'utf8'))
const rows = []
for (const a of aj.assets || []) {
  const lf = cleanLife(a.life)
  if (!lf) continue
  const home = { x: a.x, y: a.y }
  const DT = 1 / 20 // 20 samples a second
  const FR = 20 * 900 // 15 minutes
  let px = null, py = null, run = 0, longest = 0, longestAt = 0, path = 0
  const runs = []
  for (let k = 0; k < FR; k++) {
    const t = k * DT
    const s = lifeAt(lf, t, home, canStand)
    const x = home.x + s.dx, y = home.y + s.dy
    if (px !== null) {
      const d = Math.hypot(x - px, y - py)
      path += d
      if (d < 0.02) { run += DT; if (run > longest) { longest = run; longestAt = t } }
      else { if (run > 0.5) runs.push(run); run = 0 }
    }
    px = x; py = y
  }
  // the same life with no floor at all, to see what the floor costs it
  const lf2 = { ...lf, walkOnly: false }
  let qx = null, qy = null, path2 = 0
  for (let k = 0; k < FR; k++) {
    const s = lifeAt(lf2, k * DT, home, null)
    const x = home.x + s.dx, y = home.y + s.dy
    if (qx !== null) path2 += Math.hypot(x - qx, y - qy)
    qx = x; qy = y
  }
  rows.push({ id: a.id, kind: lf.kind, walkOnly: !!lf.walkOnly, home: [a.x, a.y],
    longestStill: +longest.toFixed(1), at: +longestAt.toFixed(0),
    stillOver5s: runs.filter((r) => r >= 5).length, stillOver15s: runs.filter((r) => r >= 15).length,
    travel: +path.toFixed(0), travelNoFloor: +path2.toFixed(0),
    floorCost: +(100 * (1 - path / (path2 || 1))).toFixed(0) })
}
rows.sort((a, b) => b.longestStill - a.longestStill)
console.log('id | kind | walkOnly | home | longest still (s) | at t | stills>=5s | >=15s | travel | travel with no floor | floor costs %')
for (const r of rows) console.log(`${r.id} | ${r.kind} | ${r.walkOnly} | ${r.home} | ${r.longestStill} | ${r.at} | ${r.stillOver5s} | ${r.stillOver15s} | ${r.travel} | ${r.travelNoFloor} | ${r.floorCost}`)
const wo = rows.filter(r => r.walkOnly)
console.log(`\nwalkOnly n=${wo.length}: median longest-still ${wo.map(r=>r.longestStill).sort((a,b)=>a-b)[wo.length>>1]}s, worst ${Math.max(...wo.map(r=>r.longestStill))}s`)
console.log(`walkOnly mean floor cost ${(wo.reduce((s,r)=>s+r.floorCost,0)/wo.length).toFixed(0)}% of the distance the same behaviour covers unfenced`)
