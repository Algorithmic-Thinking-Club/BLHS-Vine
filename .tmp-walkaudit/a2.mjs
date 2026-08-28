import fs from 'fs'
const W = 688, H = 640, N = W * H
const buf = fs.readFileSync('C:/Users/ashcy/AdventureGame/.tmp-walkaudit/planes.bin')
const lvl = buf.subarray(0, N), cut = buf.subarray(2 * N, 3 * N), L = buf.subarray(3 * N, 4 * N)

const HIP = 2, HIPDY = 1, TOL = 10
const lvlAt = (P) => (x, y) => {
  const xi = Math.round(x), yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
  return P[yi * W + xi]
}
const mk = (P) => {
  const at = lvlAt(P)
  const near = (a, b) => Math.abs(a - b) <= TOL
  const canStandFrom = (x, y, from) => {
    const f = at(x, y)
    if (f === 0 || !near(f, from)) return false
    const h1 = at(x - HIP, y - HIPDY), h2 = at(x + HIP, y - HIPDY)
    return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
  }
  return { at, canStandFrom, canStand: (x, y) => canStandFrom(x, y, at(x, y)) }
}
const G = mk(L)

// 1. how many walkable pixels survive the BODY test
let walk = 0, stands = 0
const standMask = new Uint8Array(N)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x
  if (!L[i]) continue
  walk++
  if (G.canStand(x, y)) { stands++; standMask[i] = 1 }
}
console.log(`walkable px ${walk}  of which a BODY can stand ${stands} (${(100 * stands / walk).toFixed(1)}%)  lost to the hip probes ${walk - stands}`)

// 2. reach flood from spawn using canStandFrom
const spawn = [557, 508]
console.log('spawn lvl', G.at(spawn[0], spawn[1]), 'canStand', G.canStand(spawn[0], spawn[1]))
const D = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
function flood(sx, sy) {
  const seen = new Uint8Array(N)
  const q = [[sx, sy]]
  seen[sy * W + sx] = 1
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h]
    const cur = G.at(x, y)
    for (const [dx, dy] of D) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      if (seen[ny * W + nx]) continue
      if (!G.canStandFrom(nx, ny, cur)) continue
      seen[ny * W + nx] = 1
      q.push([nx, ny])
    }
  }
  return { seen, n: q.length }
}
const r = flood(spawn[0], spawn[1])
console.log(`reached from spawn ${r.n} px  = ${(100 * r.n / stands).toFixed(1)}% of the standable ${stands}`)

// 3. orphan components
const orphan = new Uint8Array(N)
const out = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x
  if (r.seen[i] || orphan[i] || !standMask[i]) continue
  let n = 0, minx = x, maxx = x, miny = y, maxy = y
  const s = [[x, y]]; orphan[i] = 1
  for (let h = 0; h < s.length; h++) {
    const [cx, cy] = s[h]; n++
    minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy)
    for (const [dx, dy] of D) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (orphan[j] || r.seen[j] || !standMask[j]) continue
      orphan[j] = 1; s.push([nx, ny])
    }
  }
  out.push({ px: n, rect: [minx, miny, maxx, maxy], level: L[i] })
}
out.sort((a, b) => b.px - a.px)
console.log(`ORPHAN islands (standable but unreachable from spawn): ${out.length} components, ${out.reduce((s,o)=>s+o.px,0)} px total`)
for (const o of out.slice(0, 15)) console.log('   ', JSON.stringify(o))

// 4. per level value: standable and reached
const byLvl = {}
for (let i = 0; i < N; i++) {
  const v = L[i]; if (!v) continue
  byLvl[v] = byLvl[v] || { px: 0, stand: 0, reach: 0 }
  byLvl[v].px++; if (standMask[i]) byLvl[v].stand++; if (r.seen[i]) byLvl[v].reach++
}
console.log('per level value  px / standable / reached-from-spawn')
for (const v of Object.keys(byLvl).sort((a,b)=>a-b)) console.log('   ', v, JSON.stringify(byLvl[v]))
fs.writeFileSync('C:/Users/ashcy/AdventureGame/.tmp-walkaudit/reach.bin', Buffer.concat([Buffer.from(r.seen), Buffer.from(standMask)]))
