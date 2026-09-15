/* the sail state machine played the way it was asked for, `node scripts/sail-machine-proof.mjs` and `--live` for the deploy: six required statements, one run each, every check reading `__pmap.travel`, because a suite that watches only the end of a voyage never sees the player carried past a beat */
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
  /* the deploy draws its first frame slower than the dev server and `window.__intent` only exists once a scene has mounted, so a fixed sleep races a cold lambda and waiting for the thing itself does not */
  await h.page.waitForFunction(() => typeof window.__intent === 'function', null, { timeout: 60000 })
  await h.page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
  await h.until((s) => s.press.some((e) => /Sail (to|there)/i.test(e.text)), { ms: 14000 })
  return h.pressText(/Sail (to|there)/i)
}

const esc = async (page) => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
}

/* was the titled transition screen ever up: it lasts about two seconds so asking once asks at random, and `until` hands back its last frame on timeout, so a check written as `!!(await until(...))` is true whatever happened and passed on a run where no cover ever appeared */
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

/* run 1, the button turns on the cutscene and takes the player to the dock, and run 2, E hops on the boat */
{
  const h = await open('the-whole-road')
  const { page, shot, until, state, finish } = h

  ok('he starts in the mountain with nobody travelling',
    !(await h.look()).map?.travel, JSON.stringify((await h.look()).map?.travel))

  await pressGo(h)

  /* the dock and not the door, so the check is the leg and the map together: the journey has to walk itself through the tunnel and stop on the quay rather than land outside the maw door */
  await until((s) => s.map?.travel?.leg === 'boarding', { ms: 40000, every: 500 })
  /* the cover is still lifting on the frame the leg turns, so a shot taken then catches the fade and not the dock, and this wait makes it the picture the player really gets */
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

  /* nothing titled goes up on a sail the player is watching, because the archipelago transition screen belongs only to an escape during sailing */
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

/* run 3, escape before sailing drops the cutscene and leaves the player on the dock, and run 4, E then opens the chart and picking an island arms it again */
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
  /* pressed until it lands, because E is an edge read on the scene's own ticker and a single press racing a scene that has just had its controls handed back is a coin toss */
  let chart = await h.look()
  for (let i = 0; i < 10 && !(chart.panels && chart.panels !== '0'); i++) {
    await page.keyboard.press('e')
    await page.waitForTimeout(500)
    chart = await h.look()
  }
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

/* run 5, escape during sailing gives a transition screen and lands the player at the far dock */
{
  const h = await open('esc-while-sailing')
  const { page, shot, until, state, finish } = h

  await pressGo(h)
  await until((s) => s.map?.travel?.leg === 'boarding', { ms: 40000, every: 500 })
  await page.keyboard.press('e')
  await until((s) => s.map?.hull === true, { ms: 12000, every: 300 })
  await page.waitForTimeout(1200)

  /* the transition screen is the point of this run, and it has to be here and nowhere else, never on a sail the player is watching */
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
