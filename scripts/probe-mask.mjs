/* reads where the ground is off a bundle's own levels.png the same way PmapScene decodes it, because a coordinate typed by eye off the picture is wrong about half the time and every walk_to against that anchor refuses: node scripts/probe-mask.mjs <bundle> [x y] */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] || 'public/maps-painted/hub-a2'
/* a polyline, as x,y x,y x,y, sampled every four pixels exactly the way paths.ts's own walkFaults samples one, so a route is checked before it goes into a bundle instead of after a body has walked into a wall */
const line = process.argv[3] === '--line'
  ? process.argv.slice(4).map((p) => p.split(',').map(Number))
  : null
const route = process.argv[3] === '--route' ? process.argv.slice(4).map((p) => p.split(',').map(Number)) : null
const px = !line && !route && process.argv[3] !== undefined ? Number(process.argv[3]) : null
const py = !line && process.argv[4] !== undefined ? Number(process.argv[4]) : null
const map = JSON.parse(readFileSync(path.join(dir, 'map.json'), 'utf8'))
const levels = readFileSync(path.join(dir, 'levels.png')).toString('base64')
const scene = readFileSync(path.join(dir, 'scene.png')).toString('base64')

const b = await chromium.launch()
const page = await b.newPage()
await page.setContent('<canvas id=c></canvas>')
const out = await page.evaluate(async ({ levels, scene, W, H, px, py, enc, line, route, ch }) => {
  const decode = async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    return g.getImageData(0, 0, W, H).data
  }
  const L = await decode(levels)
  const S = await decode(scene)
  const lvl = (x, y) => L[((y | 0) * W + (x | 0)) * 4]
  const alpha = (x, y) => S[((y | 0) * W + (x | 0)) * 4 + 3]
  /* the real walk law and not a pixel test, src/game/pmap/walk.ts:77-86 verbatim: the floor is unblocked, both hips clear it, and all three are within the step tolerance, because sampling only the centre pixel passes routes the game then refuses */
  const HIP = ch.hip ?? 2, HIPDY = ch.hipDY ?? 1, TOL = enc.stepTolerance ?? 10
  const nearv = (a, b) => Math.abs(a - b) <= TOL
  const stands = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    const f = lvl(x, y)
    if (f === 0) return false
    const h1 = lvl(x - HIP, y - HIPDY), h2 = lvl(x + HIP, y - HIPDY)
    return h1 > 0 && h2 > 0 && nearv(h1, f) && nearv(h2, f)
  }

  if (line) {
    const bad = []
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4))
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * (k / n), y = ay + (by - ay) * (k / n)
        if (!stands(Math.round(x), Math.round(y))) { bad.push({ leg: i, x: Math.round(x), y: Math.round(y) }); break }
      }
    }
    return { line: bad, ends: line.map(([x, y]) => ({ x, y, ok: stands(x, y) })) }
  }

  /* the route is found rather than guessed: a breadth-first walk over standable pixels, thinned to the fewest waypoints whose straight legs are all standable, under the same law the body will obey */
  if (route) {
    const [sx, sy] = route[0], [gx, gy] = route[1]
    const prev = new Int32Array(W * H).fill(-1)
    const seen = new Uint8Array(W * H)
    const q = [sy * W + sx]
    seen[sy * W + sx] = 1
    let hit = -1
    for (let qi = 0; qi < q.length && hit < 0; qi++) {
      const c = q[qi], cx = c % W, cy = (c / W) | 0
      if (Math.abs(cx - gx) <= 2 && Math.abs(cy - gy) <= 2) { hit = c; break }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx
        if (seen[n] || !stands(nx, ny)) continue
        seen[n] = 1; prev[n] = c; q.push(n)
      }
    }
    if (hit < 0) return { route: null, from: stands(sx, sy), to: stands(gx, gy) }
    const full = []
    for (let c = hit; c !== -1; c = prev[c]) full.push({ x: c % W, y: (c / W) | 0 })
    full.reverse()
    /* sampled at one pixel and every point standable with a one pixel margin on both axes, because the game checks a route at a 6 pixel sample and a thinning done at 2 handed back a leg that grazed a wall between its own samples: `the_long_way` passed here and `route` refused it at 353,238 */
    const clear = (x, y) => stands(x, y)
    const legOk = (a, b2) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b2.x - a.x, b2.y - a.y)))
      for (let k = 0; k <= n; k++)
        if (!clear(Math.round(a.x + (b2.x - a.x) * (k / n)), Math.round(a.y + (b2.y - a.y) * (k / n)))) return false
      return true
    }
    const thin = [full[0]]
    let i = 0
    while (i < full.length - 1) {
      let j = full.length - 1
      while (j > i + 1 && !legOk(full[i], full[j])) j--
      thin.push(full[j]); i = j
    }
    return { route: thin, len: full.length }
  }
  if (px !== null) {
    return { one: { x: px, y: py, level: lvl(px, py), alpha: alpha(px, py), blocked: lvl(px, py) === enc.blocked } }
  }
  const hist = {}
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = lvl(x, y)
    hist[v] = (hist[v] || 0) + 1
    if (alpha(x, y) > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  /* a coarse map of where a body may stand, one character per block, so the shape of the island can be read out of a terminal */
  const rows = []
  for (let y = 0; y < H; y += 12) {
    let s = String(y).padStart(4, ' ') + ' '
    for (let x = 0; x < W; x += 12) s += lvl(x, y) === enc.blocked ? '.' : (lvl(x, y) === enc.L0 ? '#' : String(Math.floor(lvl(x, y) / 10)))
    rows.push(s)
  }
  /* the spine is the middle of the standable run on every row, which is where a waypoint belongs, because a strip twelve pixels wide is invisible at the coarse map's twelve pixel sample and every route authored off the picture missed it */
  const spine = []
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1, n = 0
    for (let x = 0; x < W; x++) if (lvl(x, y) !== enc.blocked) { if (lo < 0) lo = x; hi = x; n++ }
    if (n > 0) spine.push({ y, lo, hi, n, mid: Math.round((lo + hi) / 2) })
  }
  return { hist, painted: { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }, rows, spine }
}, { levels, scene, W: map.w, H: map.h, px, py, enc: map.encoding, line, route, ch: map.character })
await b.close()

if (out.route !== undefined) {
  if (!out.route) console.log(`${dir}: no walkable route (start standable: ${out.from}, goal standable: ${out.to})`)
  else console.log(`${dir}: ${out.len} px route, ${out.route.length} waypoints:
  ` + out.route.map((p) => `[${p.x}, ${p.y}]`).join(', '))
} else if (out.line) {
  if (!out.line.length) console.log(`${dir}: the line is standable end to end`)
  else for (const f of out.line) console.log(`${dir}: leg ${f.leg} leaves the floor near ${f.x},${f.y}`)
} else if (out.one) {
  console.log(`${dir} ${out.one.x},${out.one.y}: level ${out.one.level}, alpha ${out.one.alpha}, ${out.one.blocked ? 'BLOCKED' : 'standable'}`)
} else {
  console.log(`${dir}: canvas ${map.w}x${map.h}`)
  console.log(`  painted extent (alpha > 8): ${out.painted.w}x${out.painted.h} at ${out.painted.minX},${out.painted.minY}`)
  console.log('  levels:', Object.entries(out.hist).map(([k, v]) => `${k}=${v}`).join(' '))
  console.log('  ' + '     ' + Array.from({ length: Math.ceil(map.w / 12) }, (_, i) => (i * 12) % 60 === 0 ? '|' : ' ').join(''))
  for (const r of out.rows) console.log('  ' + r)
  console.log('  standable run per row (y: first..last, count, middle):')
  for (const s of out.spine) if (s.y % 8 === 0) console.log(`    ${String(s.y).padStart(3)}: ${String(s.lo).padStart(3)}..${String(s.hi).padStart(3)}  n=${String(s.n).padStart(4)}  mid=${s.mid}`)
}
