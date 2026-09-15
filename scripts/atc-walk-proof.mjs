/* does the figure actually walk or slide across the terrace in a breathing pose, run with `node scripts/atc-walk-proof.mjs` or `--live` against the deploy: a published map once carried the idle in all eight headings and nothing else, so `lead_to` moved a standing body, and this holds the whole chain in one run */
import fs from 'node:fs'
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

/* the two faces, read off the bundle the game is about to load rather than hardcoded, so this proof cannot pass on a map that lost the walk */
const bundle = JSON.parse(fs.readFileSync('public/maps-vendored/atc-1/assets.json', 'utf8'))
const host = bundle.assets.find((a) => a.id === 'a35')
const names = host?.lookNames ?? []
ok('the published map calls the second face "walk"', names[1] === 'walk', JSON.stringify(names))
const rect = (at) => new Set(Object.values(at ?? {}).flat().map((r) => r.join(',')))
const idleRects = rect(host?.dirsAt)
const walkRects = rect(host?.looks?.[0]?.dirsAt)
ok('the two faces are different pictures',
  walkRects.size >= 8 && ![...walkRects].some((r) => idleRects.has(r)),
  `idle ${idleRects.size} rects, walk ${walkRects.size} rects`)
/* the ground line has to line up per heading and not globally, because the sprite hangs from the bottom of its cell and a body drawn standing on one canvas and walking on another hops as it sets off: this character's idle came back on 96 for south and north and 100 for the other six */
const cellOf = (at, k) => {
  const r = (at ?? {})[k]
  return r && r.length ? r[0].slice(2).join('x') : null
}
const HEADS = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const off = HEADS.filter((k) => cellOf(host?.dirsAt, k) !== cellOf(host?.looks?.[0]?.dirsAt, k))
ok("each heading's walk is drawn in the same cell as that heading's idle, so he cannot hop when he sets off",
  off.length === 0,
  off.length ? off.map((k) => `${k} ${cellOf(host?.dirsAt, k)} vs ${cellOf(host?.looks?.[0]?.dirsAt, k)}`).join(', ')
    : HEADS.map((k) => cellOf(host?.dirsAt, k)).join(' '))

/* a student ashore at ATC with the club owed and the president not yet met */
const save = (() => {
  const s = STAMPED()
  s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
  s.completions = [{ programme: 'football', year: 1, grade: 3, at: 1, attempts: 1, firstGrade: 3 }]
  return s
})()

const h = await boot('atc-walk', {
  save,
  url: `${base}/?scene=pmap&deep=1&map=atc-1`,
  dir: 'reference/_archive/build-shots/atc-walk',
})
const { page, say, shot, look, finish } = h
await page.waitForTimeout(live ? 9000 : 6500)

const gait = await page.evaluate(() => window.__pmap.gaits ?? null)
await page.evaluate(() => window.__station('host'))

/* sampled while the body is crossing, because every claim here is about a moving body, and the dialogue is clicked through the way a player would so the walk is the one the real beat runs */
const seen = []
const t0 = Date.now()
while (Date.now() - t0 < 40000) {
  const s = await page.evaluate(() => {
    const d = window.__pmap.drivenNow
    const b = d && (d.a35 ?? Object.values(d)[0])
    return b ? { tex: b.tex, moving: b.moving, frame: b.frame, x: b.x, y: b.y } : null
  })
  if (s) seen.push(s)
  const v = await look()
  if (v.press.some((e) => /^RUN$/i.test(e.text))) break
  await page.mouse.click(683, 640)
  await page.waitForTimeout(180)
}
await shot('the-walk')
const moving = seen.filter((s) => s.moving)
const still = seen.filter((s) => !s.moving)
say(`  ${seen.length} samples, ${moving.length} of them with him moving`)

const isWalk = (t) => {
  const m = /#(\d+),(\d+),(\d+),(\d+)$/.exec(t ?? '')
  return !!m && walkRects.has(m.slice(1).join(','))
}
const isIdle = (t) => {
  const m = /#(\d+),(\d+),(\d+),(\d+)$/.exec(t ?? '')
  return !!m && idleRects.has(m.slice(1).join(','))
}
ok('he was driven across the terrace at all', moving.length >= 3, `${moving.length} moving samples`)
/* measured only on samples where the body has actually travelled: a move is granted inside the handler and the picture is chosen on the next animation frame, so for up to one frame a body carries a move it has not started and is correctly drawn standing, which failed this proof about one time in eight */
const travelled = moving.filter((s) => {
  /* the first sample is not evidence either way, since there is nothing before it to compare against and it is the one most likely to sit inside that one frame window */
  const prev = seen[seen.indexOf(s) - 1]
  return !!prev && (s.x !== prev.x || s.y !== prev.y)
})
ok('every picture drawn while he was crossing ground came from the walk',
  travelled.length > 0 && travelled.every((s) => isWalk(s.tex)),
  travelled.length
    ? `${travelled.filter((s) => isWalk(s.tex)).length}/${travelled.length} · ${travelled[0].tex}`
    : 'never travelled')
ok('his legs changed picture as he went, so it is a walk and not one held frame',
  new Set(travelled.map((s) => s.tex)).size >= 3,
  `${new Set(travelled.map((s) => s.tex)).size} distinct pictures`)
ok('he is handed back to his own idle when he stops',
  still.length > 0 && still.every((s) => isIdle(s.tex)),
  still.length ? `${still.filter((s) => isIdle(s.tex)).length}/${still.length} still samples on the idle` : 'never stopped')
ok('the gait did not come from a folder committed in this repo', gait !== 'art', String(gait))

console.log(`\n${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
await finish()
process.exit(fails.length ? 1 : 0)
