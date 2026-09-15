/* the ten second test on a stopwatch: open the game cold, press nothing, and sample the screen every 250ms for twenty seconds to see whether a student knows what the game is and what to do next inside ten seconds, because a run that walks Thor around tests a player who already understands the game */
import { chromium } from 'playwright'
import fs from 'node:fs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = (arg('base', 'http://localhost:5173')).replace(/\/$/, '')
const map = arg('map', 'hub')
const OUT = 'reference/_archive/build-shots/ten-seconds'
if (has('shots')) { fs.mkdirSync(OUT, { recursive: true }); for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`) }

/* a run that has just begun, the state this test is about: the intro is done, nothing has been earned, and nobody has told the student anything */
const SAVE = {
  v: 2, id: 'r_ten', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
await page.addInitScript((s) => {
  localStorage.setItem('blhs_save_v2', JSON.stringify(s))
  sessionStorage.removeItem('blhs_seen_v1')
}, SAVE)

const t0 = Date.now()
await page.goto(`${base}/?scene=pmap&deep=1&map=${map}`, { waitUntil: 'domcontentloaded' })

const seen = new Map()      // text -> first second it was readable
const frames = []
for (let i = 0; i < 80; i++) {
  const at = (Date.now() - t0) / 1000
  const f = await page.evaluate(() => {
    /* every word a student could read, in DOM order, with the world's own Pixi text asked for separately because it is not in the DOM */
    const words = []
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
      if (!own) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) continue
      words.push(own.replace(/\s+/g, ' ').slice(0, 90))
    }
    const p = window.__pmap
    return {
      words,
      pointing: p ? p.guide : null,
      ready: window.__sceneReady === true,
    }
  }).catch(() => null)
  if (f) {
    for (const w of f.words) if (!seen.has(w)) seen.set(w, at)
    frames.push({ at, ...f })
    if (has('shots') && Math.abs(at - Math.round(at)) < 0.13 && at < 12) {
      await page.screenshot({ path: `${OUT}/t${String(Math.round(at)).padStart(2, '0')}s.png` })
    }
  }
  await page.waitForTimeout(250)
  if ((Date.now() - t0) / 1000 > 20) break
}
await b.close()

console.log(`\nTHE FIRST TWENTY SECONDS ON "${map}", nothing pressed\n${'='.repeat(64)}`)
for (const [w, at] of [...seen].sort((a, c) => a[1] - c[1])) {
  console.log(`  ${at.toFixed(1).padStart(5)}s  ${w}`)
}

const pointedAt = frames.find((f) => f.pointing)
console.log(`\n${'='.repeat(64)}`)
console.log(`  the game points somewhere at   ${pointedAt ? `${pointedAt.at.toFixed(1)}s  (${pointedAt.pointing})` : 'NEVER'}`)

/* the two questions the brief asks, answered against what was really on screen */
const said = (re) => { for (const [w, at] of seen) if (re.test(w)) return at; return null }
const where = said(/^(the |a )?[A-Z]/)                     // a place name, said
const what = said(/go to|go into|year sheet|advisory|is done|not open yet|is starting|caught up/i)
console.log(`  "where am I" answered at       ${where === null ? 'NEVER' : `${where.toFixed(1)}s`}`)
console.log(`  "what do I do next" answered   ${what === null ? 'NEVER' : `${what.toFixed(1)}s`}`)
const pass = what !== null && what <= 10 && pointedAt && pointedAt.at <= 10
console.log(`\n  TEN-SECOND TEST: ${pass ? 'answered' : 'NOT ANSWERED'}\n`)
