/* THE OUTFIT REACHES THE PANTHER THE STUDENT IS DRIVING.
 *
 * ASH, 2026-09-09 item 5: *"The wardrobe. The coats change thors appearence
 * inside the wardrobe panel, but when the user exits out, thors in game
 * character has not changed. i bet its the same for the letter man jacket,
 * googles, cap, etc."*
 *
 * A coat is a recolour of the same forty-eight pictures and an outfit is a
 * different forty-eight, so they fail in different ways and only one of them
 * had ever been drawn. This watches the wire instead of the screen: which files
 * the map really asks for is a claim no screenshot can argue with, and the two
 * sets live at different paths.
 *
 *   node scripts/wear-proof.mjs --base=http://localhost:5173
 */
import { chromium } from 'playwright'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const base = (process.argv.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:5173').slice(7)
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }

let pass = 0
const fails = []
const ok = (n, good, d = '') => {
  if (good) { pass++; console.log(`  ok   ${n}${d ? '  ' + d : ''}`) }
  else { fails.push(`${n}${d ? '  ' + d : ''}`); console.log(`  FAIL ${n}${d ? '  ' + d : ''}`) }
}

const save = (over) => ({
  v: 2, id: 'r_w', handle: 'BraveTide', pronouns: 'they/them', boatName: 'K',
  year: 2, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
  flags: ['maw:founding', 'maw:railed', 'maw:handed_over', 'vignette:y1', 'handbook:granted', 'chart:granted'],
  tokens: [], ranks: {}, islands: {}, exposure: [],
  /* two seasons of one sport is Varsity, which is what the jacket is earned by */
  completions: [
    { programme: 'football', year: 1, grade: 3, rank: 'football', at: 1 },
    { programme: 'football', year: 2, grade: 3, rank: 'football', at: 2 },
  ],
  stickers: [], facts: [], badges: [], ledger: [], savedAt: 1, ...over,
})

const browser = await chromium.launch({ args: GPU })

async function framesFor(over) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  const wear = new Set()
  const bare = new Set()
  page.on('request', (r) => {
    const u = r.url()
    if (u.includes('/art/characters/thor/wear/')) wear.add(u.split('/art')[1])
    else if (u.includes('/art/characters/thor/walk/')) bare.add(u.split('/art')[1])
  })
  await page.addInitScript((s) => {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.clear()
  }, save(over))
  await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw&at=arrive_maw`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__pmap, null, { timeout: 90000 })
  await page.waitForTimeout(5000)
  await page.close()
  return { wear, bare }
}

console.log(`\nthe outfit reaches the panther, against ${base}\n`)

{
  const { wear, bare } = await framesFor({})
  ok('a run wearing nothing draws the bare panther', bare.size >= 8, `${bare.size} bare frames`)
  ok('and asks for no outfit at all', wear.size === 0, `${wear.size} outfit frames`)
}

for (const id of ['letterman', 'goggles', 'cap']) {
  /* each one is given exactly what its own `has` reads and nothing more, rather
   * than a blanket unlock, so a gate that drifts off a real roster id fails here
   * instead of passing on a programme nobody ships. `atc` is a real one. */
  const over = id === 'letterman' ? { thorWear: id }
    : id === 'goggles' ? { thorWear: id, islands: { atc: 'completed' } }
      : { thorWear: id, graduated: true }
  const { wear, bare } = await framesFor(over)
  const mine = [...wear].filter((u) => u.includes(`/wear/${id}/`))
  ok(`${id} is what he is drawn in`, mine.length >= 8, `${mine.length} frames of ${id}`)
  /* AND THE BARE SET IS NOT ALSO LOADED. Both at once is the shape of a fallback
   * quietly winning, which is what "it did not change" looked like. */
  ok(`and the bare panther is not loaded underneath`, bare.size === 0, `${bare.size} bare frames`)
}

await browser.close()
console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
