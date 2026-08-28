import fs from 'fs'
import { decodePNG, encodePNG } from 'file:///C:/Users/ashcy/MAPVIS-next/server/sheet.mjs'
const T = 'C:/Users/ashcy/AdventureGame/.tmp-walkaudit/'
const W = 688, H = 640, N = W * H
const buf = fs.readFileSync(T + 'planes.bin')
const lvl = buf.subarray(0, N), cut = buf.subarray(2 * N, 3 * N), L = buf.subarray(3 * N, 4 * N)
const rb = fs.readFileSync(T + 'reach.bin')
const reach = rb.subarray(0, N), stand = rb.subarray(N, 2 * N)

const sc = decodePNG(fs.readFileSync(T + 'pub_scene.png'))
console.log('scene.png', sc.w + 'x' + sc.h)
const A_MIN = 40
const alpha = (i) => sc.data[i * 4 + 3]

let opaque = 0, walkOnTransparent = 0, standOnTransparent = 0, opaqueNoMask = 0
const bad = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x
  const op = alpha(i) > A_MIN
  if (op) opaque++
  if (L[i] && !op) { walkOnTransparent++; if (stand[i]) { standOnTransparent++; if (bad.length < 40) bad.push([x, y, L[i]]) } }
  if (op && !L[i]) opaqueNoMask++
}
console.log(`scene opaque px ${opaque}`)
console.log(`WALKABLE MASK OVER TRANSPARENT PAINTING: ${walkOnTransparent} px  (a BODY can stand on ${standOnTransparent} of them)`)
console.log(' sample coords', JSON.stringify(bad.slice(0, 20)))
console.log(`opaque painting with no mask: ${opaqueNoMask} px (normal: roofs, cliffs, sea wall)`)

// where is the walkable band?
let x0 = W, y0 = H, x1 = -1, y1 = -1
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[y * W + x]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
console.log(`walkable bbox ${x0},${y0} .. ${x1},${y1}  = ${x1 - x0 + 1}x${y1 - y0 + 1}`)
let ax0 = W, ay0 = H, ax1 = -1, ay1 = -1
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha(y * W + x) > A_MIN) { if (x < ax0) ax0 = x; if (y < ay0) ay0 = y; if (x > ax1) ax1 = x; if (y > ay1) ay1 = y }
console.log(`painting alpha bbox ${ax0},${ay0} .. ${ax1},${ay1} = ${ax1 - ax0 + 1}x${ay1 - ay0 + 1}`)

// ---- render an overlay for the eye ----
const out = new Uint8Array(N * 4)
for (let i = 0; i < N; i++) {
  let r = sc.data[i * 4], g = sc.data[i * 4 + 1], b = sc.data[i * 4 + 2]
  const a = sc.data[i * 4 + 3]
  if (a <= A_MIN) { r = 8; g = 20; b = 34 }
  if (L[i]) {
    // green where a body can stand, yellow where the pixel is levelled but the body cannot
    if (stand[i]) { r = (r * 0.35 + 40) | 0; g = (g * 0.35 + 190) | 0; b = (b * 0.35 + 60) | 0 }
    else { r = (r * 0.35 + 220) | 0; g = (g * 0.35 + 200) | 0; b = (b * 0.35 + 20) | 0 }
    // magenta if it is walkable over nothing
    if (a <= A_MIN) { r = 255; g = 0; b = 255 }
  }
  out[i * 4] = Math.min(255, r); out[i * 4 + 1] = Math.min(255, g); out[i * 4 + 2] = Math.min(255, b); out[i * 4 + 3] = 255
}
fs.writeFileSync(T + 'overlay.png', encodePNG(W, H, out))
console.log('wrote overlay.png')
