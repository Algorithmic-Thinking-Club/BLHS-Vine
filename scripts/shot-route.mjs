import { chromium } from 'playwright'
const SAVE = {
  v: 2, id: 'r_ten', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: Date.now(),
}
const OUT = 'reference/_archive/build-shots/fresh'
const b = await chromium.launch()
async function shot(name, url, save, settle) {
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
  if (save) await page.addInitScript((s) => { localStorage.setItem('blhs_save_v2', JSON.stringify(s)); sessionStorage.removeItem('blhs_seen_v1') }, save)
  else await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  await page.close()
}
await shot('r1-continue-lands-here-islandmap', 'http://localhost:5173/?scene=islandmap', SAVE, 5000)
await shot('r2-boot-cold', 'http://localhost:5173/', null, 3500)
await shot('r3-title-cold', 'http://localhost:5173/?scene=title', null, 3000)
await shot('r4-beach-intro-ts', 'http://localhost:5173/?scene=beach', null, 6000)
await shot('r5-castaway-python', 'http://localhost:5173/?scene=pmap&deep=1&map=castaway&grape=/grapes/castaway/', SAVE, 9000)
await b.close()
console.log('done')
