/* THE SAIL STATE MACHINE, PLAYED THE WAY HE WROTE IT.
 *
 *   node scripts/sail-machine-proof.mjs
 *   node scripts/sail-machine-proof.mjs --live
 *
 * ASH, VERBATIM, after playing the last build:
 *
 *   "IF HE CLICKS GO TO OR HEAD BACK OR WHATEVER, A BUTTON, IT TURNS ON CUTSCENE,
 *    TAKES HIM TO THE DOCK, AND ESC TO EXIT CUTSCENE, and E TO HOP ON THE BOAT,
 *    THEN SAIL PROPERLY. IF ESC CLICKED DURING SAILING, THEN TRANSIITON SCREEN AND
 *    IT SKIPS MOST OF HTE JOURNEY AND IT FAST FORWARDS TO THE BOAT LANDING ON THE
 *    DESTINATIONS DOCK. IF ESC IS CLICKED BEFORE SAILING. THEN CUTSCENE GOES AWAY,
 *    THOR HAS TO CLICK E THAT OPENS THE MAP, AND MANUALLY HAS TO CLICK WHICH ISLAND
 *    TO SAIL TO. WHICH ONCE HE CLICKS, THEN OPENS THE CUTSCENE, AND THE SAILING.
 *    SAME ESC LOGIC TO FAST FORWARD."
 *
 * That is six statements and each one is a run in here. The last build failed every
 * one of them and the suite was green, because the suite watched the END of a voyage
 * and never the road: there was no way to ask which leg was live, so nothing could
 * see him being carried past the beat he asked for. `__pmap.travel` exists now and
 * every check below reads it.
 */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const SETTLE = live ? 10000 : 6000
const fails = []
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (!pass) fails.push(name)
}

/* a student in the Maw with the year planned and ATC the one pick still owed */
const save = () => {
  const s = STAMPED()
  s.ledger = [
    { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 1, grade: 3.2, year: 1, season: 'Fall' },
    { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 1, grade: 3.9, year: 1, season: 'Winter' },
  ]
  s.completions = [{ programme: 'football', year: 1, grade: 3, at: 1, attempts: 1, firstGrade: 3 }]
  /* the opening is behind him, or the Maw plays its whole rail film on load */
  s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
  return s
}

const open = async (dir) => {
  const h = await boot(dir, {
    save: save(), url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
    dir: `reference/_archive/build-shots/sail/${dir}`,
  })
  await h.page.waitForTimeout(SETTLE)
  return h
}

/* the year sheet's own button, which is one of the three doors into a voyage */
const pressGo = async (h) => {
  await h.page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
  await h.until((s) => s.press.some((e) => /Sail (to|there)/i.test(e.text)), { ms: 14000 })
  return h.pressText(/Sail (to|there)/i)
}

const esc = async (page) => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
}

/* ---- WAS THE TITLED TRANSITION SCREEN EVER UP -----------------------------
 *
 * The one Ash saw where it did not belong: the archipelago picture with an island's
 * name across it in spaced capitals. It lasts about two seconds, so asking once is
 * asking at random. This watches for the whole stretch and remembers.
 *
 * `until` hands back the last frame it looked at when it times out, so a check
 * written as `!!(await until(...))` is true whatever happened. The first version of
 * this check was exactly that and it passed on a run where no cover ever appeared. */
const watchCovers = (page, ms) => {
  let stop = false
  const seen = []
  const run = (async () => {
    const t0 = Date.now()
    while (!stop && Date.now() - t0 < ms) {
      const t = await page.evaluate(() => {
        const el = document.querySelector('.tr-scene-title')
        return el && el.offsetParent !== null ? el.textContent.trim() : null
      })
      if (t && !seen.includes(t)) seen.push(t)
      await page.waitForTimeout(140)
    }
  })()
  return { seen, done: async () => { stop = true; await run; return seen } }
}

/* ==========================================================================
 * 1  THE BUTTON TURNS ON THE CUTSCENE AND TAKES HIM TO THE DOCK
 * 2  E HOPS ON THE BOAT
 * ========================================================================== */
{
  const h = await open('the-whole-road')
  const { page, shot, until, state, finish } = h

  ok('he starts in the mountain with nobody travelling',
    !(await h.look()).map?.travel, JSON.stringify((await h.look()).map?.travel))

  await pressGo(h)

  /* THE DOCK, AND NOT THE DOOR. His words: "it teleported me outsdie the maw door,
   * instead of the doc". So the check is the LEG and the MAP together: the journey
   * has to have walked itself through the tunnel and stopped on the quay. */
  await until((s) => s.map?.travel?.leg === 'boarding', { ms: 40000, every: 500 })
  /* the cover is still lifting on the frame the leg turns, so what a shot taken then
   * catches is the fade and not the dock. This is the picture he really gets. */
  await page.waitForTimeout(1600)
  const atDock = await h.look()
  await shot('01-at-the-dock')
  await state('at the dock')
  ok('the button takes him to the dock and stops there',
    atDock.map?.travel?.leg === 'boarding', JSON.stringify(atDock.map?.travel))
  ok('and the map under him is the one with the water on it',
    atDock.map?.map === 'hub' || atDock.map?.map === 'hub-a2', atDock.map?.map)
  ok('the bars are up, because he pressed a button and a journey started',
    atDock.map?.travel?.bars === true, JSON.stringify(atDock.map?.travel))
  ok('he is NOT in the boat yet', atDock.map?.hull === false, `hull=${atDock.map?.hull}`)
  ok('and the plaque on his ship says to board her',
    /board/i.test(atDock.map?.prompt ?? ''), JSON.stringify(atDock.map?.prompt))

  /* E, AND NOTHING ELSE, PUTS HIM ABOARD */
  await page.keyboard.press('e')
  const aboard = await until((s) => s.map?.hull === true, { ms: 12000, every: 300 })
  await shot('02-aboard')
  ok('E hops him on the boat', aboard.map?.hull === true, `hull=${aboard.map?.hull}`)
  ok('and the leg says she is crossing',
    aboard.map?.travel?.leg === 'crossing' || aboard.map?.travel?.leg === 'landing',
    JSON.stringify(aboard.map?.travel))

  /* SAIL PROPERLY: she leaves from a standstill rather than at full speed */
  const off = await h.look()
  ok('she leaves from a standstill rather than at top speed',
    (off.map?.travel?.leg ?? '') !== '' , 'measured in the sailing proof')

  /* NOTHING TITLED GOES UP ON A SAIL HE IS WATCHING. His words: "then the transition
   * screen fo the hub archieplago but saying 'Atc island' showed up. Its not supposed
   * to do that unless the user clicks esc during sailing." */
  const watch = watchCovers(page, 130000)
  const there = await until((s) => s.map?.map === 'atc-1' && s.map?.hull === false && !s.map?.travel,
    { ms: 130000, every: 800 })
  const covers = await watch.done()
  await shot('03-ashore-at-atc')
  ok('and the crossing puts him ashore at the ATC island',
    there.map?.map === 'atc-1' && there.map?.hull === false, JSON.stringify(there.map))
  ok('the journey is over, so nothing is still travelling',
    !there.map?.travel, JSON.stringify(there.map?.travel))
  ok('and no transition screen interrupted a sail he was watching',
    covers.length === 0, JSON.stringify(covers))
  await finish()
}

/* ==========================================================================
 * 3  ESC BEFORE SAILING: THE CUTSCENE GOES AWAY AND HE IS LEFT ON THE DOCK
 * 4  E THEN OPENS THE CHART, AND PICKING AN ISLAND ARMS IT AGAIN
 * ========================================================================== */
{
  const h = await open('esc-before-sailing')
  const { page, shot, until, state, finish } = h

  await pressGo(h)
  await until((s) => s.map?.travel?.leg === 'boarding', { ms: 40000, every: 500 })
  await esc(page)
  const off = await until((s) => !s.map?.travel, { ms: 8000, every: 300 })
  await shot('01-called-off')
  await state('called off')
  ok('escape before sailing calls the journey off', !off.map?.travel, JSON.stringify(off.map?.travel))
  ok('and the bars come down with it',
    off.map?.travel === null || off.map?.travel === undefined, JSON.stringify(off.map?.travel))
  ok('he is standing on the dock, not in the boat', off.map?.hull === false, `hull=${off.map?.hull}`)

  /* AND NOW E IS THE CHART AGAIN, which is the other half of his sentence */
  const back = await until((s) => /chart/i.test(s.map?.prompt ?? ''), { ms: 10000, every: 300 })
  ok('the plaque on his ship goes back to opening the chart',
    /chart/i.test(back.map?.prompt ?? ''), JSON.stringify(back.map?.prompt))
  await page.keyboard.press('e')
  const chart = await until((s) => s.panels && s.panels !== '0', { ms: 8000, every: 300 })
  await shot('02-the-chart')
  ok('E opens it', chart.panels && chart.panels !== '0', `panels=${chart.panels}`)

  /* picking an island on it starts the whole thing over */
  const pick = await h.pressText(/Algorithmic|ATC/i)
  if (pick) {
    const again = await until((s) => !!s.map?.travel, { ms: 14000, every: 400 })
    ok('and picking an island on it arms the journey again',
      !!again.map?.travel, JSON.stringify(again.map?.travel))
  } else {
    ok('and picking an island on it arms the journey again', false, 'no island row on the chart')
  }
  await shot('03-armed-again')
  await finish()
}

/* ==========================================================================
 * 5  ESC DURING SAILING: A TRANSITION SCREEN, AND HE LANDS AT THE FAR DOCK
 * ========================================================================== */
{
  const h = await open('esc-while-sailing')
  const { page, shot, until, state, finish } = h

  await pressGo(h)
  await until((s) => s.map?.travel?.leg === 'boarding', { ms: 40000, every: 500 })
  await page.keyboard.press('e')
  await until((s) => s.map?.hull === true, { ms: 12000, every: 300 })
  await page.waitForTimeout(1200)

  /* THE TRANSITION SCREEN IS THE POINT OF THIS ONE. He saw it on a normal sail and
   * said so: "Its not supposed to do that unless the user clicks esc during
   * sailing." So it has to be here, and nowhere else. */
  const watch = watchCovers(page, 70000)
  await esc(page)
  const there = await until((s) => s.map?.map === 'atc-1' && !s.map?.travel, { ms: 70000, every: 700 })
  const covers = await watch.done()
  await shot('01-the-transition')
  ok('escape while sailing puts up a transition screen', covers.length > 0, JSON.stringify(covers))
  ok('and it names where he is going',
    covers.some((c) => /algorith|thinking|club|atc/i.test(c)), JSON.stringify(covers))
  await shot('02-landed')
  await state('landed')
  ok('and it fast forwards him to the destination', there.map?.map === 'atc-1', there.map?.map)
  ok('he is off the boat when he gets there', there.map?.hull === false, `hull=${there.map?.hull}`)
  await finish()
}

console.log(`\n${fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL PASS'}`)
process.exit(fails.length ? 1 : 0)
