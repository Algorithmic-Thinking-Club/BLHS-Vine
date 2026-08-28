import fs from 'fs'
import { cleanLife } from './life.mjs'
const T = 'C:/Users/ashcy/AdventureGame/.tmp-walkaudit/'
const W = 688, H = 640, N = W * H
const buf = fs.readFileSync(T + 'planes.bin')
const L = buf.subarray(3 * N, 4 * N)
const HIP = 2, HIPDY = 1, TOL = 10
const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0; return L[yi * W + xi] }
const near = (a, b) => Math.abs(a - b) <= TOL
const csf = (x, y, f0) => { const f = at(x, y); if (f === 0 || !near(f, f0)) return false; const h1 = at(x - HIP, y - HIPDY), h2 = at(x + HIP, y - HIPDY); return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f) }
const canStand = (x, y) => csf(x, y, at(x, y))
const clearPath = (ax, ay, bx, by) => {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 2))
  for (let i = 1; i <= n; i++) { const u = i / n; if (!canStand(ax + (bx - ax) * u, ay + (by - ay) * u)) return false }
  return true
}
const aj = JSON.parse(fs.readFileSync(T + 'pub_assets.json', 'utf8'))
console.log('id | box wxh | pause range | box px standable% | random target standable% | clearPath pass% (both ends standable) | refusal odds of all 13 tries')
let sumRef = 0, nRef = 0
for (const a of aj.assets || []) {
  const lf = cleanLife(a.life)
  if (!lf || !lf.walkOnly) continue
  const b = lf.bounds
  const range = lf.range ?? 40
  const halfW = b ? b.w / 2 : range, halfH = b ? b.h / 2 : range * 0.35
  const cx = b ? b.x + b.w / 2 : a.x, cy = b ? b.y + b.h / 2 : a.y
  let boxStand = 0, boxN = 0
  if (b) for (let y = Math.round(b.y); y < b.y + b.h; y++) for (let x = Math.round(b.x); x < b.x + b.w; x++) { boxN++; if (canStand(x, y)) boxStand++ }
  // uniform targets, as the wander draws them
  let tgt = 0, tries = 0, clear = 0, clearTries = 0
  let rng = 12345
  const R = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff }
  for (let k = 0; k < 20000; k++) {
    const tx = cx + (R() * 2 - 1) * halfW, ty = cy + (R() * 2 - 1) * halfH
    tries++
    if (!canStand(tx, ty)) continue
    tgt++
    // a start drawn the same way, standable
    let sx, sy, ok = false
    for (let z = 0; z < 60; z++) { sx = cx + (R() * 2 - 1) * halfW; sy = cy + (R() * 2 - 1) * halfH; if (canStand(sx, sy)) { ok = true; break } }
    if (!ok) continue
    clearTries++
    if (clearPath(sx, sy, tx, ty)) clear++
  }
  const pLegOk = (tgt / tries) * (clear / Math.max(1, clearTries))
  const refuseAll = Math.pow(1 - pLegOk, 13) // first pick plus 12 retries
  sumRef += refuseAll; nRef++
  console.log(`${a.id} | ${b ? Math.round(b.w) + 'x' + Math.round(b.h) : 'none'} | ${(lf.pauseMin ?? 1.2)}-${(lf.pauseMax ?? 4.7)}s | ${boxN ? (100 * boxStand / boxN).toFixed(1) : '-'} | ${(100 * tgt / tries).toFixed(1)} | ${(100 * clear / Math.max(1, clearTries)).toFixed(1)} | ${(100 * refuseAll).toFixed(1)}%`)
}
console.log(`\nmean chance a wander leg is refused outright (all 13 candidates fail) on this map: ${(100 * sumRef / nRef).toFixed(1)}%`)
console.log('a refused leg is dist 0, so its whole duration is one pause; consecutive refusals concatenate pauses')
