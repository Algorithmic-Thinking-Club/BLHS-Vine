/* the led walk sampled every animation frame off `window.__pmap.drivenNow`, printing heading flips, the mean and spread of px/s, the largest single frame jump and pixels per walk frame, because a screenshot cannot see jank: the fault is the difference between one frame and the next */
import { boot, BASE, LIVE } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', LIVE)
const headed = process.argv.includes('--headed')

const h = await boot('lead-smooth', {
  save: BASE(),
  url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
  headed,
  dir: arg('dir', 'reference/_archive/build-shots/lead-smooth'),
})
const { page, say, shot, look, finish } = h

/* the sampler runs inside the page on the browser's own animation frames, the same clock the scene ticks on, so one sample is one drawn frame */
await page.waitForFunction(() => !!window.__pmap, null, { timeout: 30000 })
await page.evaluate(() => {
  window.__lead = []
  const tick = () => {
    const now = window.__pmap && window.__pmap.drivenNow
    if (now) {
      for (const [name, d] of Object.entries(now)) {
        window.__lead.push({ t: performance.now(), name, ...d })
      }
    }
    window.__leadRaf = requestAnimationFrame(tick)
  }
  tick()
})

/* press the biggest thing that is not a way back, and the middle of the screen when a line is talking */
const BACKWARD = /^back$|^close$|skip|quit|settings|back to the|back to my|leave this|put back|untick|close for now/i
const CORNER = /^map$|^guide$|^my year$|^\?$/i
const TALKING = /^click, or press space$|^begin the year$/i
const LETTER = { Perseverance: 'P', Ownership: 'O', 'Work Ethic': 'W', Engagement: 'E', Respect: 'R' }
const placed = new Set()

for (let i = 0; i < 200; i++) {
  const v = await look()
  if (v.save?.flags?.includes('maw:railed')) { say('rail done'); break }
  if (v.texts.some((t) => TALKING.test(t))) { await page.mouse.click(683, 640); await page.waitForTimeout(500); continue }
  const anything = v.press.filter((e) => !e.disabled && e.text && !CORNER.test(e.text))
  const movieOn = await page.evaluate(() => document.documentElement.dataset.movie === '1')
  if (movieOn && !anything.length) { await page.waitForTimeout(400); continue }

  const click = async (e) => {
    await page.mouse.click(e.box.x + e.box.w / 2, e.box.y + e.box.h / 2)
    await page.waitForTimeout(500)
  }
  const on = v.press.find((e) => !e.disabled && /^keep going$/i.test(e.text))
  if (on) { placed.clear(); await click(on); continue }
  const bucket = v.press.find((e) => /^Put (.+) in (.)$/.test(e.text)
    && LETTER[e.text.match(/^Put (.+) in (.)$/)[1]] === e.text.match(/^Put (.+) in (.)$/)[2])
  if (bucket) { placed.add(bucket.text.match(/^Put (.+) in/)[1]); await click(bucket); continue }
  const chip = v.press.find((e) => LETTER[e.text] && !placed.has(e.text))
  if (chip) { await click(chip); continue }
  const commit = v.press.find((e) => !e.disabled && /check my answer/i.test(e.text))
  if (commit) { await click(commit); continue }
  const forward = v.press
    .filter((e) => !e.disabled && e.text && !BACKWARD.test(e.text) && !CORNER.test(e.text))
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))
  if (forward[0]) { await click(forward[0]); continue }
  await page.waitForTimeout(350)
}

await shot('after-the-rail')
const samples = await page.evaluate(() => {
  cancelAnimationFrame(window.__leadRaf)
  return window.__lead
})

/* ---- one walk is a run of frames with `moving` true --------------------- */
const byBody = new Map()
for (const s of samples) {
  if (!byBody.has(s.name)) byBody.set(s.name, [])
  byBody.get(s.name).push(s)
}

let worstFlips = 0
let worstSpread = 0
let worstSnap = 0
for (const [name, rows] of byBody) {
  const walks = []
  let cur = null
  for (const r of rows) {
    if (r.moving) { if (!cur) { cur = []; walks.push(cur) } cur.push(r) }
    else cur = null
  }
  say(`${name}: ${walks.length} walk(s), ${rows.length} frames sampled`)
  walks.forEach((w, i) => {
    if (w.length < 6) return
    const steps = []
    let flips = 0
    let snap = 0
    let cycleFrames = 0
    let travelled = 0
    for (let k = 1; k < w.length; k++) {
      const dt = (w[k].t - w[k - 1].t) / 1000
      const d = Math.hypot(w[k].x - w[k - 1].x, w[k].y - w[k - 1].y)
      if (dt > 0 && dt < 0.1) steps.push(d / dt)
      snap = Math.max(snap, d)
      travelled += d
      if (w[k].facing !== w[k - 1].facing) flips++
      if (w[k].frame !== w[k - 1].frame) cycleFrames++
    }
    const mean = steps.reduce((a, b) => a + b, 0) / (steps.length || 1)
    const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / (steps.length || 1))
    const perFrame = cycleFrames ? travelled / cycleFrames : 0
    say(`  walk ${i + 1}: ${w.length} frames · flips ${flips} · speed ${mean.toFixed(1)} px/s`
      + ` (sd ${sd.toFixed(1)}, ${((sd / (mean || 1)) * 100).toFixed(0)}%)`
      + ` · biggest single-frame jump ${snap.toFixed(2)} px`
      + ` · ${perFrame.toFixed(1)} px per walk frame`)
    worstFlips = Math.max(worstFlips, flips)
    worstSpread = Math.max(worstSpread, sd / (mean || 1))
    worstSnap = Math.max(worstSnap, snap)
  })
}
say(`WORST: flips ${worstFlips} · speed spread ${(worstSpread * 100).toFixed(0)}% · jump ${worstSnap.toFixed(2)} px`)
await finish()
