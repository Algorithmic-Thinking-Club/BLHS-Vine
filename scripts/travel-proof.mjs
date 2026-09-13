/* THE VOYAGE GATE (BRIEF-TRAVEL). One word, `sail_to`, and the engine does the
 * whole journey: Thor walks himself out of the Maw, down the quay to the dock,
 * hops aboard, the ship sails herself out behind the bars, and he steps off on
 * the far island. A member writes nothing about any of it.
 *
 * Proved on the stand-in with nothing at the far end: `castaway` carries no
 * island python, so everything that happens on the far side is the engine's own
 * landing rather than a script somebody wrote for that map.
 *
 *   node scripts/travel-proof.mjs
 *     --base=http://localhost:5173
 *     --to=castaway            the island to sail to
 *     --from=panther-maw       the map to start on
 *     --headed
 */
import { boot, STAMPED } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const to = arg('to', 'castaway')
const from = arg('from', 'panther-maw')

let pass = 0
const fails = []
const ok = (what, good, detail = '') => {
  const line = `${what}${detail ? '  ' + detail : ''}`
  if (good) { pass++; console.log(`  ok    ${line}`) } else { fails.push(line); console.log(`  FAIL  ${line}`) }
}

/* A STUDENT WHO CAN SAIL HAS ALREADY ARRIVED ONCE, so the hub's own arrival is
 * behind him and `hub:crossed` is set. Without it the hub island replays the
 * whole docking scene on the way home, which is a real thing it should do for a
 * first arrival and the wrong state to measure a return trip in. */
const save = STAMPED()
save.flags = [...save.flags, 'hub:crossed']

const h = await boot('travel', {
  save,
  url: `${base}/?scene=pmap&deep=1&map=${from}&at=arrive_maw&world=local`,
  headed: has('headed'),
  dir: 'reference/_archive/build-shots/travel',
})

await h.page.waitForTimeout(6000)
const start = await h.state('before')
ok('the run starts on the map it was asked for', start.map?.map === from, `map=${start.map?.map}`)
await h.shot('01-before-the-voyage')

/* the word a member would write, said through the same bus a member's python
 * reaches. Nothing else is touched. */
const said = await h.page.evaluate(async (map) => {
  if (!window.__intent) return { ok: false, why: 'no __intent hook on this build' }
  try { return await window.__intent({ kind: 'sail_to', map }) } catch (e) { return { ok: false, why: String(e) } }
}, to)
h.say(`sail_to(${to}) answered ${JSON.stringify(said)}`)

/* the journey, watched. Everything below is read off the scene's own live state
 * rather than asserted from a function having been called. */
const trail = []
let sawHull = false
let sawBars = false
let leftHome = false
let landed = false
const t0 = Date.now()
let n = 1
while (Date.now() - t0 < 90000) {
  const v = await h.look()
  const bars = await h.page.evaluate(() => document.documentElement.dataset.movie === '1')
  const covered = await h.page.evaluate(() => !!document.querySelector('.tr-root'))
  const here = v.map?.map ?? (covered ? '(cover)' : 'none')
  const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${here} hull=${v.map?.hull} bars=${bars}`
  if (line.slice(6) !== (trail[trail.length - 1] ?? '').slice(6)) {
    trail.push(line)
    h.say(`  ${line}`)
    await h.shot(`${String(++n).padStart(2, '0')}-${here}-${v.map?.hull ? 'aboard' : 'afoot'}`)
  }
  /* ---- AND HE PRESSES E WHEN THE JOURNEY OFFERS HIM THE BOAT -------------
   *
   * Ash: *"IT TURNS ON CUTSCENE, TAKES HIM TO THE DOCK, AND ESC TO EXIT CUTSCENE, and
   * E TO HOP ON THE BOAT."* `sail_to` gets him to his own quay and stops there now, so
   * a watcher that only watches waits for ever. This is the one press a person makes
   * on the whole journey. */
  if (v.map?.travel?.leg === 'boarding' && !v.map?.hull) {
    await h.page.keyboard.press('e')
    await h.page.waitForTimeout(500)
  }
  if (bars) sawBars = true
  if (v.map?.hull) sawHull = true
  if (v.map && v.map.map !== from) leftHome = true
  if (v.map?.map === to && !v.map.hull && landed) break
  if (v.map?.map === to && v.map.hull) landed = true
  await h.page.waitForTimeout(500)
}

await h.page.waitForTimeout(2500)
const end = await h.state('after')
await h.shot('zz-landed')

ok('the walk out of the room happened without the island saying anything about it', leftHome)
ok('the bars were up for the journey', sawBars)
ok('Thor got aboard the ship', sawHull)
ok(`the ship arrived at ${to}`, end.map?.map === to, `map=${end.map?.map}`)
ok('he stepped off on the far side', end.map?.map === to && !end.map.hull, `hull=${end.map?.hull}`)
ok('the ship really crossed, rather than him appearing on the far spawn', landed)

/* ---- AND THE WAY BACK -----------------------------------------------------
 * The same word said the other way. Coming home ends at the tunnel rather than
 * on the dock, so this waits to be standing inside the Maw again. */
h.say('')
h.say('sail_to(hub) — the way home')
const said2 = await h.page.evaluate(async () => {
  try { return await window.__intent({ kind: 'sail_to', map: 'hub' }) } catch (e) { return { ok: false, why: String(e) } }
})
h.say(`  answered ${JSON.stringify(said2)}`)

const back = []
let backHome = false
const t1 = Date.now()
while (Date.now() - t1 < 120000) {
  const v = await h.look()
  const here = v.map?.map ?? 'none'
  const line = `${((Date.now() - t1) / 1000).toFixed(1)}s ${here} hull=${v.map?.hull}`
  if (line.slice(6) !== (back[back.length - 1] ?? '').slice(6)) {
    back.push(line); h.say(`  ${line}`)
    await h.shot(`${String(++n).padStart(2, '0')}-home-${here}`)
  }
  /* the same one press home as out */
  if (v.map?.travel?.leg === 'boarding' && !v.map?.hull) {
    await h.page.keyboard.press('e')
    await h.page.waitForTimeout(500)
  }
  if (here === 'panther-maw') { backHome = true; break }
  await h.page.waitForTimeout(500)
}
await h.page.waitForTimeout(1500)
const home = await h.state('home')
await h.shot('zzz-home')
ok('the way home was accepted', !!said2 && said2.ok !== false, JSON.stringify(said2))
ok('the return trip ends inside the Maw, not on the dock', backHome && home.map?.map === 'panther-maw', `map=${home.map?.map}`)

console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL ${f}`)
console.log('\ntrail out:')
for (const t of trail) console.log('  ' + t)
console.log('trail home:')
for (const t of back) console.log('  ' + t)
await h.finish()
process.exit(fails.length ? 1 : 0)
