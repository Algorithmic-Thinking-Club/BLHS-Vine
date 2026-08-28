/* Continuous-space reachability: what a REAL walker can get to, against what
 * the editor's checkReach (1 px, 8-way flood) says is connected. */
import fs from 'fs'
import { encodePNG } from 'file:///C:/Users/ashcy/MAPVIS-next/server/sheet.mjs'
const T = 'C:/Users/ashcy/AdventureGame/.tmp-walkaudit/'
const W = 688, H = 640, N = W * H
const buf = fs.readFileSync(T + 'planes.bin')
const L = buf.subarray(3 * N, 4 * N)
const rb = fs.readFileSync(T + 'reach.bin')
const floodReach = rb.subarray(0, N), stand = rb.subarray(N, 2 * N)

const HIP = 2, HIPDY = 1, TOL = 10, YSCALE = 0.72
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

const DIRS = []
for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (dx || dy) {
  const m = Math.hypot(dx, dy); DIRS.push([dx / m, dy / m])
}

const Q = 4 // visited grid, quarter pixel
const GW = W * Q, GH = H * Q

function run(speed, dt, label) {
  const seen = new Uint8Array(GW * GH)
  const px = [], py = []
  const sx = 557, sy = 508
  px.push(sx); py.push(sy)
  seen[Math.round(sy * Q) * GW + Math.round(sx * Q)] = 1
  const hitPx = new Uint8Array(N)
  hitPx[sy * W + sx] = 1
  for (let h = 0; h < px.length; h++) {
    const x = px[h], y = py[h]
    const cur = at(x, y)
    const stuck = cur === 0
    for (const [ux, uy] of DIRS) {
      const nx = x + ux * speed * dt
      const ny = y + uy * speed * dt * YSCALE
      let rx, ry
      if (canStandFrom(nx, ny, cur) || stuck) { rx = nx; ry = ny }
      else if (canStandFrom(nx, y, cur)) { rx = nx; ry = y }
      else if (canStandFrom(x, ny, cur)) { rx = x; ry = ny }
      else continue
      const gi = Math.round(ry * Q) * GW + Math.round(rx * Q)
      if (gi < 0 || gi >= seen.length || seen[gi]) continue
      seen[gi] = 1
      px.push(rx); py.push(ry)
      const pi = Math.round(ry) * W + Math.round(rx)
      if (pi >= 0 && pi < N) hitPx[pi] = 1
    }
    if (px.length > 40e6) { console.log('bailed, too many states'); break }
  }
  let pxs = 0; for (let i = 0; i < N; i++) if (hitPx[i]) pxs++
  let missed = 0, missedStand = 0
  for (let i = 0; i < N; i++) if (floodReach[i] && !hitPx[i]) { missed++; if (stand[i]) missedStand++ }
  console.log(`${label}: speed ${speed} dt ${dt.toFixed(4)} step ${(speed*dt).toFixed(3)}px  states ${px.length}  pixels touched ${pxs}  flood-reachable pixels NEVER touched ${missed}`)
  return hitPx
}

const g60 = run(68, 1 / 60, 'GAME 60fps')
const g30 = run(68, 1 / 30, 'GAME 30fps')
const g20 = run(68, 1 / 20, 'GAME 20fps')
const e60 = run(34 * 1.9, 1 / 60, 'EDITOR walk test 60fps')

// where the game at 60fps never gets but the flood says connected
const out = new Uint8Array(N * 4)
let comp = 0
for (let i = 0; i < N; i++) {
  let r = 10, g = 16, b = 26
  if (L[i]) { r = 60; g = 60; b = 60 }
  if (stand[i]) { r = 30; g = 120; b = 40 }
  if (stand[i] && !g60[i]) { r = 255; g = 40; b = 40; comp++ }
  if (g60[i]) { r = 90; g = 230; b = 120 }
  out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255
}
console.log(`standable pixels the 60fps walker never touches: ${comp}`)
fs.writeFileSync(T + 'reachdiff.png', encodePNG(W, H, out))

// disagreement between 60 and 20 fps
let only60 = 0, only20 = 0
for (let i = 0; i < N; i++) { if (g60[i] && !g20[i]) only60++; if (g20[i] && !g60[i]) only20++ }
console.log(`pixels reachable at 60fps but not at 20fps: ${only60};  at 20fps but not 60fps: ${only20}`)
let onlyGame = 0, onlyEd = 0
for (let i = 0; i < N; i++) { if (g60[i] && !e60[i]) onlyGame++; if (e60[i] && !g60[i]) onlyEd++ }
console.log(`game-only pixels ${onlyGame}, editor-walk-test-only pixels ${onlyEd}`)
