import fs from 'fs'
import { encodePNG } from 'file:///C:/Users/ashcy/MAPVIS-next/server/sheet.mjs'
const T = 'C:/Users/ashcy/AdventureGame/.tmp-walkaudit/'
const W = 688, H = 640, N = W * H
const buf = fs.readFileSync(T + 'planes.bin')
const L = buf.subarray(3 * N, 4 * N)
const rb = fs.readFileSync(T + 'reach.bin')
const stand = rb.subarray(N, 2 * N)
const HIP = 2, HIPDY = 1, TOL = 10
const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0; return L[yi * W + xi] }
const near = (a, b) => Math.abs(a - b) <= TOL
const csf = (x, y, f0) => { const f = at(x, y); if (f === 0 || !near(f, f0)) return false; const h1 = at(x - HIP, y - HIPDY), h2 = at(x + HIP, y - HIPDY); return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f) }
const canStand = (x, y) => csf(x, y, at(x, y))

// 1. horizontal run widths of the DRAWN band
const bins = new Map()
let underFive = 0, drawn = 0
for (let y = 0; y < H; y++) {
  let x = 0
  while (x < W) {
    if (!L[y * W + x]) { x++; continue }
    let e = x
    while (e < W && L[y * W + e]) e++
    const wdt = e - x
    bins.set(wdt, (bins.get(wdt) || 0) + wdt)
    drawn += wdt
    if (wdt < 5) underFive += wdt
    x = e
  }
}
const widths = [...bins.entries()].sort((a, b) => a[0] - b[0])
console.log(`drawn walkable px ${drawn}; in a horizontal run NARROWER THAN 5 px (the body span, feet + hips at +-2): ${underFive} px`)
console.log('run widths 1..12 px, px of ground in each:', JSON.stringify(widths.filter(([w]) => w <= 12)))

// 2. drawn but never standable
let lost = 0
const lostMask = new Uint8Array(N)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (L[i] && !stand[i]) { lost++; lostMask[i] = 1 } }
console.log(`drawn ground no body can ever stand on: ${lost} px = ${(100 * lost / drawn).toFixed(1)}% of what the editor paints as walkable`)

// components of lost ground that touch NO standable pixel: paths drawn that nothing can use
const seen = new Uint8Array(N)
const dead = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x
  if (!lostMask[i] || seen[i]) continue
  const st = [i]; seen[i] = 1
  let n = 0, touches = false, minx = x, maxx = x, miny = y, maxy = y
  for (let h = 0; h < st.length; h++) {
    const j = st[h]; n++
    const jx = j % W, jy = (j / W) | 0
    minx = Math.min(minx, jx); maxx = Math.max(maxx, jx); miny = Math.min(miny, jy); maxy = Math.max(maxy, jy)
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = jx + dx, ny = jy + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const k = ny * W + nx
      if (stand[k]) touches = true
      if (lostMask[k] && !seen[k]) { seen[k] = 1; st.push(k) }
    }
  }
  if (!touches && n > 12) dead.push({ px: n, rect: [minx, miny, maxx, maxy] })
}
dead.sort((a, b) => b.px - a.px)
console.log(`ISLANDS OF DRAWN GROUND THAT TOUCH NO STANDABLE PIXEL AT ALL: ${dead.length} (over 12 px each), ${dead.reduce((s,d)=>s+d.px,0)} px`)
for (const d of dead.slice(0, 12)) console.log('   ', JSON.stringify(d))

// 3. what settle() (site Walk page) does with the hub spawn vs findGround (game)
const roomy = (x, y) => canStand(x, y) && canStand(x - 1, y) && canStand(x + 1, y) && canStand(x, y - 1) && canStand(x, y + 1)
const settle = (x, y, reach = 96) => {
  if (roomy(x, y)) return [x, y, 'roomy at once']
  let any = null
  for (let r = 1; r <= reach; r++) for (let a = 0; a < 360; a += 5) {
    const nx = Math.round(x + Math.cos(a * Math.PI / 180) * r), ny = Math.round(y + Math.sin(a * Math.PI / 180) * r)
    if (roomy(nx, ny)) return [nx, ny, 'roomy at r=' + r]
    if (!any && canStand(nx, ny)) any = [nx, ny, 'only standable at r=' + r]
  }
  return any || [x, y, 'nothing found']
}
const findGround = (sx, sy) => {
  if (canStand(sx, sy)) return [sx, sy, 'standable at once']
  for (let r = 8; r <= 400; r += 8) for (let a = 0; a < 16; a++) {
    const x = sx + Math.cos(a / 16 * 6.283) * r, y = sy + Math.sin(a / 16 * 6.283) * r
    if (canStand(x, y)) return [x, y, 'r=' + r]
  }
  return [sx, sy, 'GAVE UP, returns a blocked spawn']
}
console.log('\nspawn 557,508: canStand', canStand(557, 508), 'roomy', roomy(557, 508))
console.log('  site Walk.tsx settle() ->', JSON.stringify(settle(557, 508)))
console.log('  game findGround()      ->', JSON.stringify(findGround(557, 508)))

// picture of the lost rim
const out = new Uint8Array(N * 4)
for (let i = 0; i < N; i++) {
  let r = 10, g = 16, b = 26
  if (stand[i]) { r = 40; g = 150; b = 60 }
  if (lostMask[i]) { r = 250; g = 210; b = 40 }
  out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255
}
fs.writeFileSync(T + 'rim.png', encodePNG(W, H, out))
