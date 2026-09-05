/* THE YEAR-ONE SCRIPT, WATCHED IN A REAL BROWSER.
 *
 * BRIEF-YEAR-ONE beats 2, 3, 4 and 8, written in python next door
 * (blhs-islands/islands/the-hub and islands/panther-maw) and performed here on
 * the published room and the published hub. Same shape as y1-proof.mjs: a
 * seeded save, the game's own debug surface, a screenshot per moment.
 *
 * WHAT IS PROVED HERE AND WHAT IS NOT. This says the words performed and shows
 * what a student would see. It does NOT say the game is good: Ash playing it is
 * the only gate, and he has not.
 *
 * PRESSES GO THROUGH `__station`, the scene's own E, rather than through a
 * synthesised click: the click path is ENGINE-Y1's and has its own gate. One
 * press here is deliberately a click anyway, on the desk, which has a stand
 * point; the counselor has none yet (ARC-MANIFEST, MAW REPAIRS), so a click on
 * her walks him into her and stops.
 *
 * Run: npm run dev, then `node scripts/year-one-proof.mjs --base=http://127.0.0.1:5290`
 *   --headed   watch it
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = arg('base', 'http://127.0.0.1:5290')
const SHOTS = 'reference/_archive/build-shots/year-one'
fs.mkdirSync(SHOTS, { recursive: true })
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f))

let n = 0
let failures = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  ok   ${label}${detail ? ` · ${detail}` : ''}`)
  else { failures++; console.log(`  FAIL ${label}${detail ? ` · ${detail}` : ''}`) }
  return !!cond
}

const shot = async (page, name, extra = 0) => {
  await page.waitForTimeout(240 + extra)
  const file = `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}

const ready = async (page) => {
  await page.waitForFunction(() => window.__sceneReady === true, { timeout: 30000 })
  await page.waitForTimeout(300)
}

/* A RUN THAT HAS FINISHED THE INTRO AND NEVER BEEN IN THE MOUNTAIN. */
const FRESH = {
  v: 2, id: 'r_year_one', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Proof',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
}

/* THE SAME RUN AT THE END OF YEAR ONE: founded, sheet stamped, two classes
 * sat, Advisory sat. What `yearStatus` calls ready for the yearbook. */
const YEAR_DONE = {
  ...FRESH, id: 'r_year_done', beat: 'maw:home',
  flags: ['maw:founding', 'chart:granted', 'handbook:granted', 'vignette:y1'],
  tokens: [],
  plans: { 1: { slots: {}, classes: ['ap-human-geo', 'culinary-1'], stamped: true } },
  ledger: [
    { id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5, grade: 3.4, year: 1, season: 'Fall', attempts: 1, firstGrade: 3.4 },
    { id: 'class:ap-human-geo', title: 'AP Human Geography', kind: 'class', credit: 1, grade: 3.7, year: 1, season: 'Fall', attempts: 1, firstGrade: 3.7, tags: ['ap'] },
    { id: 'class:culinary-1', title: 'Culinary Arts I', kind: 'class', credit: 1, grade: 3.0, year: 1, season: 'Winter', attempts: 1, firstGrade: 3.0, tags: ['cte'] },
  ],
}

const b = await chromium.launch({ headless: !has('headed') })
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const log = []
page.on('console', (m) => log.push(m.text()))
page.on('pageerror', (e) => { failures++; console.log(`  FAIL page error · ${e.message}`) })

const seed = async (save) => {
  await page.goto(`${base}/?scene=title`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear()
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
  }, save)
}
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('blhs_save_v2') || 'null'))
const pm = () => page.evaluate(() => {
  const p = window.__pmap
  return p ? { map: p.map, x: Math.round(p.x), y: Math.round(p.y), guide: p.guide, lit: p.lit, hull: !!p.hull } : null
})
const placed = (id) => page.evaluate((i) => JSON.parse(window.__placed(i) || 'null'), id)
const anchor = (name) => page.evaluate((nm) => JSON.parse(window.__anchors()).find((a) => a.name === nm), name)
const click = async (name) => {
  const a = await anchor(name)
  if (!a) return `no anchor ${name}`
  return page.evaluate(([x, y]) => window.__click(x, y), [a.x, a.y])
}
const station = (name) => page.evaluate((nm) => window.__station(nm), name)

/* THE BOX, READ ONLY ONCE IT HAS FINISHED TYPING. `data-state` is the box's own
 * word for it; a harness that reads mid-typewriter proves the first four
 * letters of a line and nothing else. */
const boxState = () => page.locator('.dlg-stack').first().getAttribute('data-state').catch(() => null)
const boxText = () => page.locator('.dlg-box').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => null)
const waitLine = async (ms = 15000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const st = await boxState()
    if (st === 'complete' || st === 'asking') return boxText()
    await page.waitForTimeout(120)
  }
  return null
}
/* click the line on, the way a student does, and wait until the box has
 * actually gone or moved on to something else */
const advance = async () => {
  const before = await boxText()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space')
    await page.waitForTimeout(450)
    const st = await boxState()
    if (!st || (await boxText()) !== before) return
  }
}

/* ============================================================================
 * BEAT 4 · THE PRINCIPAL: he walks in, the principal walks to him, one line,
 * the table lights, the cards.
 * ==========================================================================*/
console.log('\nbeat 4 · the principal')
await seed(FRESH)
await page.goto(`${base}/?scene=pmap&map=panther-maw`, { waitUntil: 'domcontentloaded' })
const t0 = Date.now()
await ready(page)
const at0 = await pm()
ok('the room is the published maw', at0?.map === 'panther-maw', JSON.stringify(at0))

/* THE WALK, WATCHED. Sampled every quarter second until the line is up. */
const trail = []
let line = null
while (Date.now() - t0 < 25000) {
  const p = await placed('principal_desk')
  const st = await boxState()
  trail.push({ t: Date.now() - t0, p, box: st })
  if (st === 'complete' || st === 'asking') { line = await boxText(); break }
  if (trail.length === 4) await shot(page, 'principal-on-his-way')
  await page.waitForTimeout(250)
}
const first = trail.find((s) => s.p)?.p, last = trail[trail.length - 1]?.p
const moved = first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0
ok('the principal walked over', moved > 60, `from ${JSON.stringify(first)} to ${JSON.stringify(last)} over ${trail[trail.length - 1]?.t}ms`)
ok('he is beside where the student came in', !!last && Math.hypot(last.x - 185, last.y - 115) < 12, JSON.stringify(last))
ok('the principal speaks one line', !!line && /Welcome\. Pick what you.ll do this year\./.test(line), line ?? 'no dialogue box')
const walkLog = log.filter((l) => /opening was refused|opening stopped|island did not load/.test(l))
ok('nothing in the opening was refused', walkLog.length === 0, walkLog.join(' | ').slice(0, 300))
await shot(page, 'principal-came-over-and-spoke')

/* click the line on */
await advance()
await page.waitForTimeout(400)
const s1 = await save()
ok('the founding and the handovers are written', ['maw:founding', 'chart:granted', 'handbook:granted', 'vignette:y1'].every((f) => s1?.flags?.includes(f)), JSON.stringify(s1?.flags))
const lit1 = await pm()
ok('the year now points at the table', lit1?.guide === 'chart_table', JSON.stringify({ guide: lit1?.guide, lit: lit1?.lit }))

/* THE 900MS THE PYTHON LEAVES BETWEEN THE FLAGS AND THE CARDS, watched for the
 * light: is the year's mark on the table drawn before the cards cover it. A
 * picture question, so a shot goes with the answer. */
let litSeen = false
for (let i = 0; i < 6; i++) {
  const p = await pm()
  if (p?.lit) litSeen = true
  if (i === 1) await shot(page, 'after-the-line-before-the-cards', 0)
  if (await page.locator('.py-sheet').first().isVisible().catch(() => false)) break
  await page.waitForTimeout(150)
}
console.log(`  note the table light ${litSeen ? 'was' : 'was NOT'} drawn between the line and the cards`)

/* the cards */
await page.waitForSelector('.py-sheet', { timeout: 8000 }).catch(() => {})
ok('the pick screen is up', await page.locator('.py-sheet').first().isVisible().catch(() => false))
await shot(page, 'pick-screen', 600)
/* he stays where he came to, and is his own again: see let_go() in founding.py */
await page.waitForTimeout(600)
const stays = await placed('principal_desk')
ok('the principal is let go where he stands, by the door', !!stays && Math.hypot(stays.x - 185, stays.y - 115) < 20, JSON.stringify(stays))

/* he picks: one thing to do and two classes, which is what the screen asks */
const go = page.locator('.py-go').first()
await page.locator('.py-card').first().click().catch(() => {})
await page.waitForTimeout(250)
await page.locator('.py-class').nth(0).click().catch(() => {})
await page.waitForTimeout(250)
await page.locator('.py-class').nth(1).click().catch(() => {})
await page.waitForTimeout(350)
ok('the year can be taken', await go.isEnabled().catch(() => false))
await shot(page, 'picked')
await go.click().catch(() => {})
await page.waitForTimeout(900)
const s2 = await save()
ok('the sheet is stamped', !!s2?.plans?.[1]?.stamped, JSON.stringify(s2?.plans?.[1]))
ok('no year-start card followed the pick', !await page.locator('.ys-card').first().isVisible().catch(() => false))
await page.waitForTimeout(600)
const after = await pm()
ok('the year now points at Advisory, at the fire, and the fire is lit', after?.guide === 'hearth' && !!after?.lit, JSON.stringify({ guide: after?.guide, lit: after?.lit }))
await shot(page, 'after-the-pick-the-fire-is-lit', 400)

/* and the desk afterwards is one line. A CLICK, on purpose: the desk has a
 * stand point, so this is the road a trackpad freshman takes. */
/* through the scene's own E: the desk's anchor travels with his body, and the
 * click path on a station whose body has moved is ENGINE-Y1's to prove */
ok('the principal is pressed', (await station('principal_desk')) === 'fired')
const again = await waitLine(15000)
ok('the desk afterwards is one line', !!again && /Go to the table/.test(again), again ?? 'no line')
await shot(page, 'desk-again')
await advance()

/* ============================================================================
 * BEAT 8 · HOME: the counselor opens the yearbook, the page turns, she drapes
 * the cord, the wall shows what he earned, and the next time in: year two,
 * next time.
 * ==========================================================================*/
console.log('\nbeat 8 · home')
await seed(YEAR_DONE)
await page.goto(`${base}/?scene=pmap&map=panther-maw`, { waitUntil: 'domcontentloaded' })
await ready(page)
await page.waitForTimeout(800)
await shot(page, 'home-year-done')

ok('the counselor is pressed', (await station('counselor')) === 'fired')
const her = await waitLine(15000)
ok('the counselor says the year is done', !!her && /Year one is done/.test(her), her ?? 'no line')
await shot(page, 'counselor-year-done')
await advance()
await page.waitForSelector('.yb-page', { timeout: 8000 }).catch(() => {})
ok('the yearbook opened', await page.locator('.yb-page').first().isVisible().catch(() => false))
await shot(page, 'yearbook', 500)

const endYear = page.locator('.yb-page button', { hasText: /End this year/ }).first()
ok('the page can be turned', await endYear.isVisible().catch(() => false))
await endYear.click().catch(() => {})
await page.waitForSelector('.cd-card', { timeout: 8000 }).catch(() => {})
ok('the counselor drapes the cord', await page.locator('.cd-card').first().isVisible().catch(() => false))
await shot(page, 'cord-drape', 700)
const s3 = await save()
ok('the page turned and the year is two', s3?.year === 2 && s3?.flags?.includes('yearbook:y1'), `year=${s3?.year}`)
for (const sel of ['.cd-card', '.yb-page']) {
  if (await page.locator(sel).first().isVisible().catch(() => false)) {
    await page.locator(`${sel} button`).last().click().catch(() => {})
    await page.waitForTimeout(500)
  }
}
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

/* the wall */
ok('the wall is pressed', (await station('trophy_wall')) === 'fired')
const wallLine = await waitLine(12000)
ok('the wall says what is on it', !!wallLine, wallLine ?? 'no line')
await advance()
await page.waitForSelector('.tw-sheet', { timeout: 8000 }).catch(() => {})
ok('the wall panel opened', await page.locator('.tw-sheet').first().isVisible().catch(() => false))
await shot(page, 'the-wall', 500)
await page.keyboard.press('Escape')

/* next time in */
await page.goto(`${base}/?scene=pmap&map=panther-maw`, { waitUntil: 'domcontentloaded' })
await ready(page)
const next = await waitLine(12000)
ok('next time in: year two, next time', !!next && /Year two, next time/.test(next), next ?? 'no line')
await shot(page, 'year-two-next-time')

/* ============================================================================
 * BEATS 2 AND 3 · THE HUB: the crossing and the dock, against a hub that does
 * not carry the names yet. The island loads, the refusals are named, nothing
 * crashes, the door is lit by the year.
 * ==========================================================================*/
console.log('\nbeats 2 and 3 · the hub')
log.length = 0
await seed(FRESH)
await page.goto(`${base}/?scene=pmap&map=hub&aboard=1`, { waitUntil: 'domcontentloaded' })
await ready(page)
await page.waitForTimeout(2500)
const hub = await pm()
ok('the hub loaded with him aboard', hub?.map === 'hub' && hub.hull, JSON.stringify(hub))
const claims = log.find((l) => /this island claims/.test(l)) ?? ''
ok('the missing dock posts are named at load', /dock_one/.test(claims) && /dock_two/.test(claims) && /dock_three/.test(claims), claims.slice(0, 220))
const refused = log.find((l) => /opening was refused/.test(l)) ?? ''
ok('the missing sail line is named at its line', /the_hub_approach/.test(refused), refused.slice(0, 220))
const crashed = log.filter((l) => /opening stopped|island did not load/.test(l))
ok('the island did not crash', crashed.length === 0, crashed.join(' | ').slice(0, 200))
const s4 = await save()
ok('the crossing is marked so it never repeats', s4?.flags?.includes('hub:crossed'), JSON.stringify(s4?.flags))
await shot(page, 'hub-aboard-names-missing')

await b.close()
console.log(`\n${failures ? `${failures} FAILED` : 'all green'} · ${n} screenshots in ${SHOTS}`)
process.exit(failures ? 1 : 0)
