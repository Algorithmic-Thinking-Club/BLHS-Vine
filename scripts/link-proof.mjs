/* THE ADDRESS BAR: what a copied link does when somebody else opens it.
 *
 * ASH, 2026-09-08: *"When I copy the link it comes out like
 * `.../?scene=pmap&map=panther-maw`... I can start a fresh private window and
 * paste that, and instead of giving me the starting screen it puts me in the
 * middle of the island sailing or the hub island intro cutscene."*
 *
 * `src/app/entry.ts` has the rule and its unit tests. This is the half no unit
 * test can reach: a real browsing context that has never played, opening a real
 * address the engine really wrote.
 *
 *   node scripts/link-proof.mjs --base=http://localhost:5173
 */
import { chromium } from 'playwright'
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:5173'
const b = await chromium.launch()
const say = (n, ok, d='') => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  ' + d : ''}`)
let bad = 0
const check = (n, ok, d) => { if (!ok) bad++; say(n, ok, d) }

/* a run that has already been played, so there is something to be dropped into */
const SAVE = {
  v: 2, id: 'r_paste', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
  flags: ['maw:founding', 'maw:railed', 'maw:handed_over', 'maw:wall_shown', 'vignette:y1', 'chart:granted', 'handbook:granted'],
  tokens: [], ranks: {}, islands: {}, exposure: [], completions: [], stickers: [], facts: [], badges: [],
  ledger: [{ id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 4, year: 1, season: 'Fall' }],
  savedAt: Date.now(),
}

async function land(url, seed = true) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  if (seed) await p.addInitScript((s) => localStorage.setItem('blhs_save_v2', JSON.stringify(s)), SAVE)
  await p.goto(url, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3500)
  const st = await p.evaluate(() => ({
    url: location.search,
    pmap: !!window.__pmap,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
  }))
  return { p, st }
}

console.log('\npasting the address the game writes\n')

{
  const { p, st } = await land(`${base}/?scene=pmap&map=panther-maw`)
  check('a pasted map opens the title, not the map', !st.pmap, JSON.stringify(st.text))
  check('and the address is tidied for the next copy', st.url === '', JSON.stringify(st.url))
  check('with the run still there to continue', /continue/i.test(st.text), JSON.stringify(st.text))
  await p.close()
}
{
  const { p, st } = await land(`${base}/?scene=pmap&map=hub&aboard=1`)
  check('the same for the crossing he named', !st.pmap, JSON.stringify(st.url))
  await p.close()
}
{
  const { p, st } = await land(`${base}/?scene=pmap&map=panther-maw&skin=plain`)
  check('a teacher’s skin pin survives the tidy', st.url === '?skin=plain', JSON.stringify(st.url))
  await p.close()
}
{
  const { p, st } = await land(`${base}/?scene=pmap&deep=1&map=panther-maw`)
  check('a deep link that says it means it still lands in the map', st.pmap, JSON.stringify(st.url))
  await p.close()
}
{
  /* the tab that is having the run keeps its place across a refresh */
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.addInitScript((s) => localStorage.setItem('blhs_save_v2', JSON.stringify(s)), SAVE)
  await p.goto(`${base}/?scene=pmap&deep=1&map=panther-maw`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => !!window.__pmap, null, { timeout: 60000 })
  await p.waitForTimeout(1500)
  /* the address as the engine really writes it, with the hatch taken off the way
     a copy from the bar would have it */
  await p.evaluate(() => history.replaceState(null, '', '/?scene=pmap&map=panther-maw'))
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3500)
  const st = await p.evaluate(() => ({ pmap: !!window.__pmap, url: location.search }))
  check('a refresh in the tab that got there keeps the map', st.pmap, JSON.stringify(st.url))
  await p.close()
}

await b.close()
console.log(`\n${bad ? bad + ' failed' : 'all pass'}\n`)
process.exit(bad ? 1 : 0)
