/* THE CORNER IS HANDED OVER, ONE SIGN AT A TIME.
 *
 * ASH, twice: *"literally nothing changed. the advisory ends. and the cutscene
 * abruptly goes away... just a few dialogues saying 'Map, Guide, My year' that a
 * freshman wont even connect."*
 *
 * The reason, found 2026-09-09: `hudGrants` was computed on every render and used
 * for exactly one thing, the arrival wobble. The class that HIDES an un-handed
 * plaque came from `plaqueShown`, which is `!armed || shown.has(which)`, and
 * nothing in the shipped game has ever called `armHandover`. So all three signs
 * were on screen from the first frame of the first map and the film's
 * `set_flag(HANDBOOK)` / `set_flag(CHART)` granted things he was already looking
 * at.
 *
 * This holds the three states apart: nothing handed over, the binder handed over,
 * and the chart handed over. It is a state check rather than a drive of the whole
 * film on purpose: the film stops at the year sheet and waits for a student to
 * fill it in, and a harness that filled it in would be testing the sheet.
 *
 *   node scripts/handover-proof.mjs --base=http://localhost:5173
 */
import { chromium } from 'playwright'

const base = (process.argv.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:5173').slice(7)
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }

let pass = 0
const fails = []
const ok = (n, good, d = '') => {
  if (good) { pass++; console.log(`  ok   ${n}${d ? '  ' + d : ''}`) }
  else { fails.push(`${n}${d ? '  ' + d : ''}`); console.log(`  FAIL ${n}${d ? '  ' + d : ''}`) }
}

const save = (flags) => ({
  v: 2, id: 'r_h', handle: 'BraveTide', pronouns: 'they/them', boatName: 'K',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  /* stamped and railed, so the founding film is over and the corner is all there
   * is left to look at. The FLAGS are the variable. */
  plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
  flags: ['maw:founding', 'maw:railed', 'maw:handed_over', 'vignette:y1', ...flags],
  tokens: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], ledger: [], savedAt: 1,
})

const browser = await chromium.launch()

async function cornerWith(flags) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.addInitScript((s) => {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.clear()
  }, save(flags))
  await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw&at=arrive_maw`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__pmap, null, { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 3500))
  const got = await page.evaluate(() => [...document.querySelectorAll('.hud-stack .hud-plaque')].map((e) => ({
    label: e.getAttribute('aria-label')?.split('.')[0] ?? '?',
    shown: !e.classList.contains('hud-plaque-waiting'),
    reachable: e.getAttribute('aria-hidden') !== 'true' && e.tabIndex !== -1,
  })))
  await page.close()
  return got
}

console.log(`\nthe corner is handed over, against ${base}\n`)

{
  const c = await cornerWith([])
  ok('there are three doors in the corner', c.length === 3, c.map((x) => x.label).join(', '))
  ok('and none of them is there before the handover', c.every((x) => !x.shown),
    JSON.stringify(c.map((x) => `${x.label}:${x.shown}`)))
  /* a hidden sign must be out of the tab order too, or a keyboard player reaches
   * a control the game has not given him */
  ok('nor reachable by a keyboard', c.every((x) => !x.reachable))
}

{
  /* what `set_flag(HANDBOOK)` does: the binder and the year sheet together,
   * which is the one moment §4.10 hands both over */
  const c = await cornerWith(['handbook:granted'])
  const by = Object.fromEntries(c.map((x) => [x.label, x.shown]))
  ok('the binder brings the Guide', by.Guide === true, JSON.stringify(by))
  ok('and the year sheet with it', by['My Year'] === true)
  ok('and the Map is still to come', by.Map === false)
}

{
  const c = await cornerWith(['handbook:granted', 'chart:granted'])
  ok('and the chart brings the Map', c.every((x) => x.shown),
    JSON.stringify(c.map((x) => `${x.label}:${x.shown}`)))
}

{
  /* ---- AND ARRIVING SOMEWHERE IS NOT BEING GIVEN A CHART ----------------
   *
   * `PmapScene` writes an exposure row for the map it is standing on the moment
   * any map mounts, and the chart's grant used to accept that. So the Map sign
   * was handed over by walking into the hub, minutes before the principal hands
   * it over in the Maw. */
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.addInitScript((s) => {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.clear()
  }, save([]))
  await page.goto(`${base}/?scene=pmap&deep=1&map=panther-maw&at=arrive_maw`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__pmap, null, { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 3500))
  const st = await page.evaluate(() => ({
    exposure: (JSON.parse(localStorage.getItem('blhs_save_v2')).exposure ?? []).length,
    map: [...document.querySelectorAll('.hud-stack .hud-plaque')]
      .find((e) => /^Map/.test(e.getAttribute('aria-label') ?? ''))
      ?.classList.contains('hud-plaque-waiting'),
  }))
  ok('standing on a map does not hand over the chart', st.exposure > 0 && st.map === true,
    `${st.exposure} exposure row(s), Map hidden: ${st.map}`)
  await page.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
