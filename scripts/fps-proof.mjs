/* frames per second on the four maps a student sees, with flags --live, --only=<map> and --secs=<n>: each map is sampled twice, unthrottled and at 4x CPU throttle, and the throttle is applied after the scene has loaded so the load is not what gets measured */
import { boot, STAMPED, LIVE } from './play-harness.mjs'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const live = process.argv.includes('--live')
/* measure the production preview, not the dev server, because an unminified module graph with hot reload attached does not measure what a student runs */
const base = arg('base', live ? LIVE : 'http://localhost:4173')
const SECS = Number(arg('secs', 30))
const ONLY = arg('only', null)
const OUT = arg('out', 'reference/_archive/build-shots/fps')
const RATES = [1, 4]

/* a save standing in the middle of year one, which is what every map below wants */
const save = () => {
  const s = STAMPED()
  s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
  s.exposure = [...s.exposure, { place: 'atc-room', docked: true }]
  return s
}

/* sample frame gaps in the page and reduce them to the numbers that matter */
const sample = (page, secs) => page.evaluate((s) => new Promise((done) => {
  const gaps = []
  let last = performance.now()
  const end = last + s * 1000
  const tick = (now) => {
    gaps.push(now - last)
    last = now
    if (now < end) requestAnimationFrame(tick)
    else done(gaps)
  }
  requestAnimationFrame(tick)
}), secs)

const stats = (gaps) => {
  /* the first gap carries the wait before the first frame, so it is not a frame */
  const g = gaps.slice(1).filter((x) => x > 0 && x < 5000)
  if (!g.length) return null
  const sorted = [...g].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  const mean = g.reduce((a, b) => a + b, 0) / g.length
  return {
    frames: g.length,
    fps: 1000 / mean,
    p50: 1000 / at(0.5),
    p95ms: at(0.95),
    worstms: sorted[sorted.length - 1],
    /* a stutter is a frame that took longer than two frames at thirty a second */
    stutters: g.filter((x) => x > 66).length,
    over33: g.filter((x) => x > 33).length,
  }
}

/* the four maps, each with the way in and the wait it needs */
const MAPS = [
  {
    key: 'beach',
    url: `${base}/?scene=beach&deep=1`,
    settle: 9000,
    ready: async () => {},
  },
  {
    key: 'hub',
    url: `${base}/?scene=pmap&deep=1&map=hub`,
    settle: 8000,
    ready: async () => {},
  },
  {
    key: 'atc',
    url: `${base}/?scene=pmap&deep=1&map=atc-1`,
    settle: 8000,
    ready: async () => {},
  },
  {
    key: 'crossing',
    url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
    settle: 7000,
    /* the chart offers the voyage, the quay press boards her, and the hull is what says the crossing has actually begun */
    ready: async (h) => {
      const { page, until, pressText } = h
      await page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
      await until((s) => s.press.some((e) => /Sail (to|there)/i.test(e.text)), { ms: 16000 })
      await pressText(/Sail (to|there)/i)
      await until((s) => s.map?.travel?.leg === 'boarding', { ms: 45000, every: 400 })
      await page.keyboard.press('e')
      await until((s) => s.map?.hull === true, { ms: 20000, every: 200 })
    },
  },
]

const rows = []
const wanted = ONLY ? MAPS.filter((m) => m.key === ONLY) : MAPS

for (const m of wanted) {
  const h = await boot(`fps-${m.key}`, { save: save(), url: m.url, dir: `${OUT}/${m.key}` })
  const { page, say, shot, finish } = h
  try {
    await page.waitForTimeout(m.settle)
    await m.ready(h)
    await page.waitForTimeout(1500)
    await shot(`${m.key}-standing`)

    const cdp = await page.context().newCDPSession(page)
    for (const rate of RATES) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      /* let the throttle take hold before the first frame is counted */
      await page.waitForTimeout(1200)
      say(`${m.key} at ${rate}x for ${SECS}s`)
      const s = stats(await sample(page, SECS))
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      if (!s) { say(`${m.key} at ${rate}x returned no frames`); continue }
      rows.push({ map: m.key, rate, ...s })
      say(`${m.key} ${rate}x: ${s.fps.toFixed(1)} fps, p50 ${s.p50.toFixed(1)}, p95 frame ${s.p95ms.toFixed(1)}ms, worst ${s.worstms.toFixed(0)}ms, ${s.stutters} stutters`)
      await page.waitForTimeout(800)
    }
  } catch (e) {
    console.log(`FAIL  ${m.key} :: ${String(e).slice(0, 300)}`)
  } finally {
    await finish()
  }
}

const table = [
  '| map | throttle | fps | p50 fps | p95 frame | worst frame | frames over 33ms | stutters |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.map} | ${r.rate}x | ${r.fps.toFixed(1)} | ${r.p50.toFixed(1)} | ${r.p95ms.toFixed(1)}ms | ${r.worstms.toFixed(0)}ms | ${r.over33} | ${r.stutters} |`),
].join('\n')

console.log('\n' + table + '\n')
fs.mkdirSync(path.resolve(OUT), { recursive: true })
fs.writeFileSync(path.resolve(OUT, 'fps.md'), table + '\n')
fs.writeFileSync(path.resolve(OUT, 'fps.json'), JSON.stringify(rows, null, 2))

const target = rows.filter((r) => (r.rate === 1 && r.fps < 55) || (r.rate === 4 && r.fps < 29))
console.log(target.length ? `SHORT: ${target.map((r) => `${r.map}@${r.rate}x ${r.fps.toFixed(1)}`).join(', ')}` : 'every map is at target')
process.exit(0)
