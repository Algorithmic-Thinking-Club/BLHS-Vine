/* THE SAIL INTO ATC ENDS ASHORE, AND NEVER TELLS HIM IT CANNOT DOCK.
 *
 *   node scripts/atc-dock-proof.mjs          against the dev server
 *   node scripts/atc-dock-proof.mjs --live   against the deploy
 *
 * The one that left a player frozen. Measured two runs in three: the boat came down
 * the line, grounded 46px from a berth drawn a little inside the coast, stopped 33
 * degrees across the dock, and four seconds later the watchdog handed the helm back
 * and said "The boat cannot dock from here. Back away and try again." with the bars
 * still up and nothing to press. It is intermittent, so this runs the whole voyage
 * and fails on the sentence as well as on the outcome.
 */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'

const save = (() => {
  const s = STAMPED()
  s.completions = [{ programme: 'football', year: 1, grade: 3, at: 1, attempts: 1, firstGrade: 3 }]
  s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
  return s
})()
const h = await boot('tmp-dockcheck', {
  save, url: base + '/?scene=pmap&deep=1&map=panther-maw',
  dir: 'reference/_archive/build-shots/dockcheck',
})
const { page, look, shot, finish } = h
let refused = false
page.on('console', (m) => {
  const t = m.text()
  if (/berthing_gave_up|cannot dock|voyage_gave_up/i.test(t)) { refused = true; console.log('  !! ' + t.slice(0, 140)) }
})
await page.waitForTimeout(6000)
await page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
await page.waitForTimeout(2200)
const v = await look()
const b = v.press.find((e) => /Sail (to|there)/i.test(e.text))
await page.mouse.click(b.box.x + b.box.w / 2, b.box.y + b.box.h / 2)
/* AND HE PRESSES E AT HIS OWN DOCK, which is the game now: the button carries him to
 * the quay with the bars up and waits for him to get in the boat. */
for (let i = 0; i < 90; i++) {
  const leg = await page.evaluate(() => { try { return window.__pmap.travel?.leg ?? null } catch { return null } })
  if (leg === 'boarding') { await page.keyboard.down('e'); await page.waitForTimeout(140); await page.keyboard.up('e'); break }
  await page.waitForTimeout(400)
}

let ashore = false
const trail = []
let said = ''
for (let i = 0; i < 200; i++) {
  const s = await page.evaluate(() => {
    const p = window.__pmap
    return { map: p.map, movie: p.movie, berthing: p.berthing,
      hull: p.hull ? { x: Math.round(p.hull.x), y: Math.round(p.hull.y), speed: +p.hull.speed.toFixed(0),
        heading: +p.hull.heading.toFixed(2), aground: p.hull.aground } : null }
  })
  const texts = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .map((e) => (e.textContent || '')).join(' | '))
  if (s.berthing) trail.push(JSON.stringify({ h: s.hull, b: s.berthing }))
  if (trail.length > 8) trail.shift()
  if (/cannot dock from here/i.test(texts) && !refused) {
    refused = true; said = 'it told him he cannot dock'
    console.log('  THE LAST EIGHT TICKS BEFORE IT GAVE UP:')
    for (const l of trail) console.log('    ' + l)
  }
  if (s.map === 'atc-1' && !s.hull && i > 30) { ashore = true; console.log('ASHORE at t+' + (i * 0.3).toFixed(1) + 's, bars ' + (s.movie ? 'still up' : 'down')); break }
  await page.waitForTimeout(300)
}
await shot('the-end')
const ok = (name, pass, detail = '') =>
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
ok('the crossing never tells him the boat cannot dock', !refused, said || 'nothing was refused')
ok('and it ends with him ashore on the island he asked for', ashore, ashore ? 'ashore' : 'still afloat or elsewhere')
console.log(`
${!refused && ashore ? 'ALL PASS' : 'FAILED'}`)
await finish()
process.exit(!refused && ashore ? 0 : 1)
