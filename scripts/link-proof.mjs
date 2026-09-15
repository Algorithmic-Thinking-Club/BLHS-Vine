/* the address bar: a copied link like /?scene=pmap&map=panther-maw pasted into a browsing context that has never played must give the starting screen, not drop somebody into the middle of a sailing or the hub intro cutscene. The rule and its unit tests are in src/app/entry.ts; this covers the half no unit test can reach. */
import { chromium } from 'playwright'
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:5173'
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
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
  /* a deep link is allowed to be slow: the map comes off the platform, so a cold fetch on the live deploy beats a fixed sample, and this waits for the scene then falls through on the roads meant to land on the title */
  await p.waitForFunction(() => !!window.__pmap, null, { timeout: 25000 }).catch(() => {})
  await p.waitForTimeout(2500)
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
  /* the address as the engine really writes it, with the hatch taken off the way a copy from the bar would have it */
  await p.evaluate(() => history.replaceState(null, '', '/?scene=pmap&map=panther-maw'))
  await p.reload({ waitUntil: 'domcontentloaded' })
  /* the map comes off the platform, so a cold fetch on the live deploy takes longer than a fixed sample: wait for the scene the way the checks above do */
  await p.waitForFunction(() => !!window.__pmap, null, { timeout: 25000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const st = await p.evaluate(() => ({
    pmap: !!window.__pmap, url: location.search,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 90),
  }))
  check('a refresh in the tab that got there keeps the map', st.pmap, JSON.stringify(st))
  await p.close()
}

await b.close()
console.log(`\n${bad ? bad + ' failed' : 'all pass'}\n`)
process.exit(bad ? 1 : 0)
