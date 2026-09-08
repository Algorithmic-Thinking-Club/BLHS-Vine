/* THE YEAR ENDS, AND IT ENDS AT THE TITLE.
 *
 * REWRITTEN 2026-09-08 for BRIEF-CLOSE-THE-LOOP, and the brief asks for that in
 * as many words: *"update the ending proof to the new ending and say so."*
 *
 * WHAT IT USED TO PROVE, and why none of it is true any more. It drove a cold run
 * to the handover, waited sixty seconds to catch the closing starting on its own,
 * then walked out to the hub and back in to make the ending play. That whole
 * shape came from a year that ended with a student standing in a finished room.
 * Section 2 removes the room: with nothing to sail to, the opening runs straight
 * into the closing, so there is no handover, no free roam, and no door to walk
 * out of and back through.
 *
 * AND IT ASSERTS NOW. The old one printed verdict lines a human read and always
 * exited 0, which is a gate that cannot fail. This one has checks and an exit
 * code, because it is one of the three the brief runs before a deploy.
 *
 *   node scripts/ending-fix.mjs [--base=https://blhs-island-explorer.vercel.app]
 */
import { boot, LIVE } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', LIVE)
const headed = process.argv.includes('--headed')

let pass = 0
const fails = []
const ok = (what, good, detail = '') => {
  const line = `${what}${detail ? '  ' + detail : ''}`
  if (good) { pass++; console.log(`  ok    ${line}`) }
  else { fails.push(line); console.log(`  FAIL  ${line}`) }
}

const h = await boot('ending-fix', {
  save: null, url: base, headed,
  dir: arg('dir', 'reference/_archive/build-shots/ending-fix'),
})
const { page, say, shot, look, finish } = h

/* NEVER PRESSED. The last three are the reason this list is longer than
 * dimwit's: a blind run that opens Settings finds "Restart adventure" and "Yes,
 * erase it all", which are two big planks and no smaller than the way on.
 * Measured against the live deploy on 2026-09-08: the run erased its own save on
 * the beach and then reported that the year never ended, which was true and was
 * this script's fault. */
const BACKWARD = /^back$|^close$|skip|quit|settings|back to the|back to my|leave this|put back|untick|close for now|restart|erase|start over/i
const TALKING = /^click, or press space$|^begin the year$/i
const LETTER = { Perseverance: 'P', Ownership: 'O', 'Work Ethic': 'W', Engagement: 'E', Respect: 'R' }
const forward = (v) => v.press
  .filter((e) => !e.disabled && e.text && !BACKWARD.test(e.text))
  .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))

const read = () => page.evaluate(() => ({
  map: window.__pmap ? window.__pmap.map : null,
  movie: document.documentElement.dataset.movie === '1',
  hull: window.__pmap ? !!window.__pmap.hull : false,
  prompt: window.__pmap ? window.__pmap.prompt : null,
  onTitle: !!document.querySelector('.ti-line2'),
  plank: document.querySelector('.ti-plank')?.innerText.trim().replace(/\s+/g, ' ') ?? null,
  again: !!document.querySelector('.ti-again'),
  bar: document.querySelector('.ob-panel')?.innerText.trim().replace(/\s+/g, ' ') ?? null,
}))

const t0 = Date.now()
const at = () => ((Date.now() - t0) / 1000).toFixed(1)

/* ---- THE WHOLE RUN, COLD, TO THE TITLE ------------------------------------ */
say('THE RUN  cold from the title, all the way back to the title')
const placed = new Set()
let last = null, repeats = 0
let sawHandover = false, sawBoat = false, turned = null, ended = null
const lines = []
let lastLine = null

for (let i = 0; i < 460; i++) {
  const v = await look()
  const r = await read()

  const box = v.texts.some((t) => /click, or press space/i.test(t))
    ? v.texts.filter((t) => !TALKING.test(t) && !/^(Map|Guide|My Year|\?)$/.test(t)).join(' | ')
    : null
  if (box && box !== lastLine) { lastLine = box; lines.push(box) }

  /* the two things that must NEVER happen once the year is closing */
  if (r.prompt && /get in the boat/i.test(r.prompt) && turned) sawBoat = true
  if (v.save?.flags?.includes('maw:handed_over')) sawHandover = true
  if (!turned && v.save?.flags?.includes('yearbook:y1')) {
    turned = at(); say(`*** THE PAGE TURNED at ${turned}s ***`); await shot('page-turned')
  }
  if (!ended && turned && r.onTitle) {
    ended = at(); say(`*** THE TITLE at ${ended}s ***`)
    await page.waitForTimeout(1800); await shot('the-title'); break
  }
  if (i % 12 === 0) {
    await shot(`${at()}s-${(v.texts[0] ?? r.map ?? 'blank').slice(0, 20)}`)
    say(`  t=${at()}s map=${r.map} movie=${r.movie ? 1 : 0} bar=${JSON.stringify(r.bar)}`)
  }

  if (v.texts.some((t) => TALKING.test(t))) { await page.mouse.click(683, 640); await page.waitForTimeout(420); continue }
  const hit = async (e) => { await page.mouse.click(e.box.x + e.box.w / 2, e.box.y + e.box.h / 2); await page.waitForTimeout(620) }
  const keep = v.press.find((e) => !e.disabled && /^keep going$/i.test(e.text))
  if (keep) { placed.clear(); await hit(keep); continue }
  const bucket = v.press.find((e) => /^Put (.+) in (.)$/.test(e.text)
    && LETTER[e.text.match(/^Put (.+) in (.)$/)[1]] === e.text.match(/^Put (.+) in (.)$/)[2])
  if (bucket) { placed.add(bucket.text.match(/^Put (.+) in/)[1]); await hit(bucket); continue }
  const chip = v.press.find((e) => LETTER[e.text] && !placed.has(e.text))
  if (chip) { await hit(chip); continue }
  const commit = v.press.find((e) => !e.disabled && /check my answer/i.test(e.text))
  if (commit) { await hit(commit); continue }
  /* the one-control fallback obeys the same refusal: a screen whose only button
   * is "Yes, erase it all" is a screen to walk away from, not to press */
  const only = v.press.filter((e) => !e.disabled && e.text && !BACKWARD.test(e.text))
  if (!forward(v).length && only.length === 1) { await hit(only[0]); continue }
  const pick = forward(v)[0]
  if (pick) {
    if (pick.text === last) repeats++; else { last = pick.text; repeats = 0 }
    if (repeats > 4) { const alt = forward(v).find((e) => e.text !== pick.text); if (alt) { last = alt.text; repeats = 0; await hit(alt); continue } }
    await hit(pick); continue
  }
  if (v.map?.lit) { await page.mouse.click(v.map.lit.at.x, v.map.lit.at.y); await page.waitForTimeout(700); continue }
  await page.waitForTimeout(700)
}

const end = await read()
const endV = await look()

say('')
say('---- BRIEF-CLOSE-THE-LOOP, checked ----')
/* section 3: the ending ends at the title */
ok('the yearbook page turns', !!turned, turned ? `at ${turned}s` : 'it never did')
ok('and the run ends at the title', !!ended, ended ? `at ${ended}s` : `still on ${end.map ?? 'no map'}`)
/* section 3: never "Continue, Fall, Year 1" */
ok('the title says the year is done', /year one is done/i.test(end.plank ?? ''), JSON.stringify(end.plank))
ok('and never offers Continue over a season', !/continue/i.test(end.plank ?? '') && !/fall|winter|spring/i.test(end.plank ?? ''))
ok('the yearbook opens from it', /yearbook/i.test(end.plank ?? ''))
ok('and there is still a way back to the island', end.again)
/* section 2: with nothing to sail to, nobody is left in an empty room */
ok('no handover plaques on a year with nothing to sail to', !sawHandover,
  sawHandover ? 'maw:handed_over was written' : 'the opening ran into the closing')
ok('and the panel never says Explore', !lines.some((l) => /Explore\. Talk to anyone/i.test(l)))
/* section 3: the berth is quiet from the moment the closing starts */
ok('the boat is never offered once the year has closed', !sawBoat)
/* section 4: no seasons anywhere a student reads */
const said = [...lines, end.plank ?? '', end.bar ?? '', ...endV.texts].join(' | ')
ok('and no student read the word Fall, Winter or Spring', !/\b(Fall|Winter|Spring)\b/.test(said))

/* section 3: a reload lands on that same title state */
say('')
say('RELOAD  a student who closes the tab and comes back')
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4200)
const again = await read()
await shot('after-a-reload')
ok('a reload lands on the title, not back in the room', again.onTitle && !again.map,
  `onTitle=${again.onTitle} map=${again.map}`)
ok('and it still says the year is done', /year one is done/i.test(again.plank ?? ''), JSON.stringify(again.plank))

say('')
say('every line anybody said, in order:')
lines.forEach((l, i) => say(`${String(i + 1).padStart(3)}  ${JSON.stringify(l.slice(0, 120))}`))

say('')
say(`${pass} of ${pass + fails.length} checks pass`)
if (fails.length) { say('failed:'); for (const f of fails) say(`  ${f}`) }
await finish()
process.exitCode = fails.length ? 1 : 0
