/* what the ship is actually doing, measured rather than watched: samples the hull twenty times a second for the whole crossing and prints the four numbers behind the complaints, the speed she holds, how fast the bow comes round, how straight the line is, and whether she finishes on the heading the berth asks for */
import { boot, STAMPED } from './play-harness.mjs'

const base = 'http://localhost:5173'
const h = await boot('sailing-measure', {
  save: (() => {
    const s = STAMPED()
    s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
    return s
  })(),
  url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
  dir: 'reference/_archive/build-shots/sailing',
})
const { page, shot, until, finish } = h
await page.waitForTimeout(6000)

await page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
await until((s) => s.press.some((e) => /Sail (to|there)/i.test(e.text)), { ms: 14000 })
await h.pressText(/Sail (to|there)/i)
await until((s) => s.map?.travel?.leg === 'boarding', { ms: 40000, every: 400 })
await page.keyboard.press('e')
/* boarding is a beat, so the hull does not exist on the frame after the press, the camera goes to the ship while he is still on the quay and he steps in after it, and a sampler that gives up before then measures a crossing that has not started */
await until((s) => s.map?.hull === true, { ms: 15000, every: 200 })

/* every sample the sea reports, at 20Hz, for the whole crossing */
const rows = []
const t0 = Date.now()
let shots = 0
while (Date.now() - t0 < 120000) {
  const r = await page.evaluate(() => {
    const p = window.__pmap
    if (!p) return null
    let s = null
    try { s = window.__sea ? JSON.parse(window.__sea()) : null } catch { s = null }
    return {
      t: Math.round(performance.now()),
      map: p.map,
      hull: !!p.hull,
      travel: p.travel ? p.travel.leg : null,
      sea: s ? { x: Math.round(s.at.x), y: Math.round(s.at.y), speed: s.speed, head: s.headingRad, aground: s.aground, berthing: s.berthing, wake: s.wake } : null,
    }
  })
  if (!r) break
  rows.push(r)
  if (r.hull && shots < 8 && rows.length % 26 === 0) { await shot(`sail-${String(++shots).padStart(2, '0')}`); }
  if (!r.travel && rows.filter((x) => x.hull).length > 6) break
  await page.waitForTimeout(50)
}

const sail = rows.filter((r) => r.hull && r.sea)
const speeds = sail.map((r) => r.sea.speed)
const unwrap = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d }
/* not across a map change: she is one hull on the hub sea and another on the far island's, born pointed at a different berth, so the two headings are unrelated, and measured across the boundary this read 287 deg/s over the 562ms the cover was down and called it the worst turn in the crossing */
const sameSea = (i) => sail[i].map === sail[i - 1].map
const turns = []
for (let i = 1; i < sail.length; i++) {
  const dt = (sail[i].t - sail[i - 1].t) / 1000
  if (dt <= 0 || !sameSea(i)) continue
  turns.push(Math.abs(unwrap(sail[i - 1].sea.head, sail[i].sea.head)) / dt)
}
const sum = (a) => a.reduce((x, y) => x + y, 0)
const mean = (a) => (a.length ? sum(a) / a.length : 0)
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }

console.log('\n---- the crossing, measured ----')
console.log(`samples with a hull: ${sail.length} over ${((sail.at(-1)?.t - sail[0]?.t) / 1000).toFixed(1)}s`)
console.log(`speed   mean ${mean(speeds).toFixed(1)}  median ${pct(speeds, 0.5).toFixed(1)}  top ${Math.max(...speeds).toFixed(1)} ocean px/s`)
console.log(`turn    mean ${(mean(turns) * 57.3).toFixed(1)}  p90 ${(pct(turns, 0.9) * 57.3).toFixed(1)}  worst ${(Math.max(...turns) * 57.3).toFixed(1)} deg/s`)
console.log(`hard turns over 60 deg/s: ${turns.filter((x) => x * 57.3 > 60).length} of ${turns.length}`)
/* WHERE the hard turns are, because "some frames turn fast" is not actionable */
const hard = []
for (let i = 1; i < sail.length; i++) {
  const dt = (sail[i].t - sail[i - 1].t) / 1000
  if (dt <= 0 || !sameSea(i)) continue
  const r = Math.abs(unwrap(sail[i - 1].sea.head, sail[i].sea.head)) / dt * 57.3
  if (r > 60) hard.push({ deg: Math.round(r), speed: Math.round(sail[i].sea.speed), where: `${sail[i].map}/${sail[i].sea.berthing ?? 'under-way'}`, dt: Math.round(dt * 1000) })
}
for (const h2 of hard.slice(0, 10)) console.log(`  hard ${h2.deg} deg/s at speed ${h2.speed} in ${h2.where} over ${h2.dt}ms`)
console.log(`aground frames: ${sail.filter((r) => r.sea.aground).length}`)
console.log(`wake points: mean ${mean(sail.map((r) => r.sea.wake)).toFixed(0)}`)
/* how straight the line was: the path length against the straight-line distance */
if (sail.length > 2) {
  let run = 0
  for (let i = 1; i < sail.length; i++) run += Math.hypot(sail[i].sea.x - sail[i - 1].sea.x, sail[i].sea.y - sail[i - 1].sea.y)
  const a = sail[0].sea, b = sail.at(-1).sea
  const line = Math.hypot(b.x - a.x, b.y - a.y)
  console.log(`path ${run.toFixed(0)} against a straight ${line.toFixed(0)}: ${(run / Math.max(1, line)).toFixed(2)}x`)
}
/* where she is when she is in trouble, because aground for a fifth of it is not actionable until you know which stretch of the crossing that fifth is */
const by = {}
for (const r of sail) {
  const k = `${r.map}/${r.sea.berthing ?? 'under-way'}`
  by[k] = by[k] ?? { n: 0, aground: 0, speed: 0 }
  by[k].n++
  by[k].aground += r.sea.aground ? 1 : 0
  by[k].speed += r.sea.speed
}
console.log(String.fromCharCode(10) + 'by stretch:')
for (const [k, v] of Object.entries(by))
  console.log(`  ${k.padEnd(24)} ${String(v.n).padStart(4)} frames  aground ${String(v.aground).padStart(3)}  mean speed ${(v.speed / v.n).toFixed(0)}`)

const legs = [...new Set(rows.map((r) => r.travel))]
console.log(`legs seen: ${JSON.stringify(legs)}  maps: ${JSON.stringify([...new Set(rows.map((r) => r.map))])}`)
await finish()
