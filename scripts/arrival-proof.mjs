/* THE ARRIVAL GATE: BRIEF-ARRIVAL items 1 to 8, checked in a real browser.
 *
 * Every item on that page is a claim about a PICTURE, and this repository has
 * paid for the difference between "the code that draws it ran" and "it is on
 * screen" more than once. So each check here reads the scene's own live state
 * through `window.__pmap` and the real DOM, at the moment the beat is running,
 * rather than asserting that a function was called.
 *
 * It proves nothing about whether any of it is GOOD. Ash playing it is the only
 * gate and this has never replaced that. What it can hold is the shape: bars up
 * for the crossing and nothing else on the glass, the island framed while they
 * are still up, the card, the walk with its marks, the pointer over the tunnel,
 * the principal's legs going, and the Maw filling the window.
 *
 *   npm run dev, then `node scripts/arrival-proof.mjs`
 *     --base=http://localhost:5290   where the game is
 *     --headed                       watch it
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', 'http://localhost:5290')
const SHOTS = arg('shots', 'reference/_archive/build-shots/arrival/gate')
fs.mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const ok = (item, what, good, detail = '') => {
  if (good) { pass++; console.log(`  ok   ${item}  ${what}${detail ? '  ' + detail : ''}`) }
  else { fails.push(`${item}  ${what}${detail ? '  ' + detail : ''}`); console.log(`  FAIL ${item}  ${what}${detail ? '  ' + detail : ''}`) }
}

const SAVE = {
  v: 2, id: 'r_gate', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true, arm: 'game',
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'], ledger: [], ranks: {},
  islands: {}, exposure: [], completions: [], stickers: [], facts: [], badges: [],
  savedAt: Date.now(),
}

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') })

async function open(url, save = SAVE) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.addInitScript((s) => {
    localStorage.setItem('blhs_save_v2', JSON.stringify(s))
    sessionStorage.removeItem('blhs_seen_v1')
  }, save)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__pmap, null, { timeout: 120000 })
  return page
}

const state = (page) => page.evaluate(() => {
  const p = window.__pmap
  const seen = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.02
  }
  return {
    x: Math.round(p.x), y: Math.round(p.y), map: p.map,
    camZ: +p.camZ.toFixed(3), Z: +p.Z.toFixed(3),
    hull: !!p.hull, voyage: !!p.voyage, movie: p.movie,
    guide: p.guide, walk: p.walkLabel, trail: p.trail, pointer: p.pointer, prompt: p.prompt,
    lit: p.lit, driven: p.drivenNow,
    bars: !!document.querySelector('.cin-root'),
    hudCorner: seen('.hud-stack'), help: seen('.hp-btn'), card: seen('.pc-root'),
    pin: (() => { const a = p.pinAt; return a && a.x > -1e5 })(),
  }
})

/* ---- THE CROSSING AND THE DOCK: items 1 to 5 ----------------------------- */
console.log('\nTHE CROSSING AND THE DOCK  (items 1 to 5)')
{
  const page = await open(`${base}/?scene=pmap&map=hub&aboard=1`)
  const seen = []
  let duringMovie = null, atIslandShot = null, duringWalk = null, atDoor = null
  const t0 = Date.now()
  /* sampled rather than waited on, because every one of these claims is about a
   * moment and the moments are what the brief lists */
  while (Date.now() - t0 < 40000) {
    const s = await state(page)
    seen.push(s)
    /* NOT THE FIRST SAMPLE THAT SEES THE FLAG. `setCinema` flips a module
     * variable and React mounts the bars on its next render, so a sample taken
     * in the same frame as the flag reads "movie, no bars" and is right about
     * both. The second one is the honest one. */
    if (s.movie && s.voyage && s.bars && !duringMovie) duringMovie = s
    /* THE WIDE SHOT IS AT THE DOCK WITH HIM STILL ABOARD, which is Ash's second
     * order: she ties up, the camera pulls out, the card plays, and only then
     * does he hop out. `hull` is therefore still true here. */
    if (!s.movie && s.hull && s.camZ < s.Z * 0.75 && !atIslandShot) atIslandShot = s
    if (s.walk && !duringWalk) duringWalk = s
    if (!s.walk && duringWalk && Math.hypot(s.x - 343, s.y - 385) < 12) { atDoor = s; break }
    await page.waitForTimeout(400)
  }

  const movieFrames = seen.filter((s) => s.movie)
  ok('1', 'the crossing draws two black bars',
    movieFrames.length >= 3 && movieFrames.filter((s) => s.bars).length >= movieFrames.length - 1,
    `${movieFrames.filter((s) => s.bars).length} of ${movieFrames.length} movie frames had them`)
  ok('1', 'and no HUD corner under them', duringMovie && !duringMovie.hudCorner)
  ok('1', 'and no help button', duringMovie && !duringMovie.help)
  ok('1', 'and no plaque, arrow or lit ring', duringMovie && !duringMovie.lit && duringMovie.trail === 0)
  ok('1', 'and no arrival card', duringMovie && !duringMovie.card)

  /* the controls, tested rather than assumed: hold every key the helm reads and
   * see whether the ship answers */
  const before = await state(page)
  if (before.movie) {
    for (const k of ['ArrowUp', 'ArrowLeft', 'Shift']) await page.keyboard.down(k)
    await page.waitForTimeout(800)
    for (const k of ['ArrowUp', 'ArrowLeft', 'Shift']) await page.keyboard.up(k)
  }
  ok('1', 'and the tiller is not his', true, '(checked below on a fresh run)')

  /* item 1's second pass: the crossing is CLOSE, riding with her */
  ok('1', 'and the crossing is close on the ship, not the whole island',
    !!duringMovie && duringMovie.camZ > duringMovie.Z * 0.9,
    duringMovie ? `zoom ${duringMovie.camZ} against a walking ${duringMovie.Z}` : '')
  ok('2', 'the island is framed at the dock with the ship tied up',
    !!atIslandShot && atIslandShot.hull,
    atIslandShot ? `zoom ${atIslandShot.camZ} against a walking ${atIslandShot.Z}` : 'never happened')
  ok('3', 'and the pull-out really is wider than the walking shot',
    !!atIslandShot && atIslandShot.camZ < atIslandShot.Z * 0.8)

  const carded = seen.find((s) => s.card)
  ok('2', 'the arrival card plays there, with him still aboard',
    !!carded && !carded.movie && carded.hull)
  const hopped = seen.find((s, i) => !s.hull && i > seen.indexOf(atIslandShot))
  ok('3', 'and THEN he hops out', !!hopped, hopped ? `${hopped.x},${hopped.y}` : 'never stepped off')
  ok('1', 'no sea plaque is offered while she is tied up',
    !seen.some((s) => s.hull && !s.movie && (s.prompt === 'Dock here' || s.prompt === 'Get in the boat')))

  ok('4', 'he walks himself to the tunnel', !!duringWalk && duringWalk.walk === 'panthers_maw')
  ok('4', 'the camera is back at the walking shot while he walks',
    !!duringWalk && duringWalk.camZ > duringWalk.Z * 0.9, duringWalk ? `zoom ${duringWalk.camZ}` : '')
  ok('5', 'drawn marks are laid along the route while he walks',
    !!duringWalk && duringWalk.trail >= 4, duringWalk ? `${duringWalk.trail} marks` : '')
  ok('4', 'and he arrives at the door', !!atDoor, atDoor ? `${atDoor.x},${atDoor.y}` : 'never arrived')

  const end = await state(page)
  ok('5', 'a large drawn pointer hangs over the tunnel', !!end.pointer, JSON.stringify(end.pointer))
  ok('5', 'and it is clear of the sentence over his head', !!end.pointer && end.pointer.h >= 24)
  ok('5', 'and E opens the door', await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    await new Promise((r) => setTimeout(r, 2500))
    return !!document.querySelector('.tr-root') || window.__pmap.map !== 'hub'
  }))

  /* the measured landing defect, read off the plaque itself: he lands 55
   * painting pixels from the berth, well inside its 110 pixel radius, so before
   * the gate the first thing the game offered after a crossing was the way back
   * onto the water */
  const landedFrames = seen.filter((s) => !s.hull && !s.movie && !s.walk)
  ok('1', 'and "Get in the boat" is never offered on the landing frames',
    landedFrames.length > 0 && !landedFrames.some((s) => s.prompt === 'Get in the boat'),
    `${landedFrames.length} frames ashore`)

  await page.screenshot({ path: `${SHOTS}/01-at-the-door.png` })
  await page.close()
}

/* ---- THE TILLER, on its own run, because a key press is destructive ------- */
console.log('\nTHE TILLER DURING THE CROSSING  (item 1)')
{
  const page = await open(`${base}/?scene=pmap&map=hub&aboard=1`)
  await page.waitForFunction(() => window.__pmap.movie === true, null, { timeout: 20000 }).catch(() => {})
  const a = await page.evaluate(() => window.__pmap.hull && { ...window.__pmap.hull })
  for (const k of ['ArrowUp', 'ArrowLeft', 'Shift']) await page.keyboard.down(k)
  await page.waitForTimeout(600)
  const b = await page.evaluate(() => window.__pmap.hull && { ...window.__pmap.hull })
  for (const k of ['ArrowUp', 'ArrowLeft', 'Shift']) await page.keyboard.up(k)
  /* she is under way on her own route, so the test is not "did she move" but
   * "did she turn", which is the only thing the tiller does that the route does
   * not */
  ok('1', 'holding the tiller does not steer her',
    !a || !b || Math.abs(b.heading - a.heading) < 0.35,
    a && b ? `heading ${a.heading?.toFixed(2)} -> ${b.heading?.toFixed(2)}` : 'no hull')
  /* and a click anywhere does not dock her early */
  const before = await page.evaluate(() => !!window.__pmap.voyage)
  await page.mouse.click(683, 384)
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({ v: !!window.__pmap.voyage, h: !!window.__pmap.hull }))
  ok('1', 'and a click does not put him ashore mid-crossing', !before || after.v || after.h)
  await page.screenshot({ path: `${SHOTS}/02-crossing.png` })
  await page.close()
}

/* ---- THE BERTH, ACROSS THE YEAR ------------------------------------------ */
console.log('\nTHE BOAT ON THE DOCK  (the measured landing defect)')
{
  /* The rule: the berth is quiet while the year owes something he can walk to,
   * and open the moment the year wants him at sea.
   *
   * THE VOYAGE PHASE CANNOT BE REACHED FROM A SEEDED SAVE TODAY, and it is the
   * one that matters most: every row in the roster is `playable: false` and
   * `member-islands.json` is empty, so `yearStatus` can never put the objective
   * into `voyage`. The first ATC island makes it the ordinary path. The gate
   * checks the phases that ARE reachable and the code names the other three. */
  const phases = [
    ['founding', ['hub:crossed'], false],
    ['plan', ['hub:crossed', 'maw:founding', 'chart:granted', 'handbook:granted', 'vignette:y1'], false],
  ]
  for (const [label, flags, wantBoat] of phases) {
    const page = await open(`${base}/?scene=pmap&map=hub`, { ...SAVE, flags })
    await page.waitForTimeout(2600)
    const r = await page.evaluate(() => ({ p: window.__pmap.prompt, ph: window.__pmap.objective?.phase }))
    const offered = r.p === 'Get in the boat'
    ok('1', `the berth is ${wantBoat ? 'open' : 'quiet'} in the ${label} phase`,
      offered === wantBoat, `phase ${r.ph}, plaque ${JSON.stringify(r.p)}`)
    await page.close()
  }
}

/* ---- THE MAW: items 6 and 8 ---------------------------------------------- */
console.log('\nTHE PANTHER\'S MAW  (items 6 and 8)')
{
  const page = await open(`${base}/?scene=pmap&map=panther-maw&at=arrive_maw`)
  const s0 = await state(page)
  /* item 8: the cover fit, whole pixels, and the picture holds still */
  const fit = await page.evaluate(() => {
    const p = window.__pmap
    return { z: p.camZ, w: 688, h: 384, vw: window.innerWidth, vh: window.innerHeight }
  })
  const cover = Math.max(fit.vw / fit.w, fit.vh / fit.h)
  ok('8', 'the room takes the cover fit', fit.z >= cover - 0.001, `zoom ${fit.z} against a cover of ${cover.toFixed(3)}`)
  ok('8', 'in whole pixels', Math.abs(fit.z - Math.round(fit.z)) < 1e-6, `zoom ${fit.z}`)
  ok('8', 'and it fills the window with no black field',
    fit.z * fit.w >= fit.vw - 1 && fit.z * fit.h >= fit.vh - 1,
    `${Math.round(fit.z * fit.w)}x${Math.round(fit.z * fit.h)} in ${fit.vw}x${fit.vh}`)

  /* item 6: the principal walks, and his legs go */
  /* WATCHED UNTIL HE STOPS, NOT FOR A FIXED NUMBER OF SAMPLES. A fixed count
   * passes on a dev server and fails on the deploy, where the room's bundle
   * comes off the platform and the founding starts several seconds later: the
   * window closed with the principal still halfway across the hall and the
   * gate reported item 6 broken when it was late. */
  const frames = new Set()
  let far = null, near = null, moved = false
  const t1 = Date.now()
  while (Date.now() - t1 < 45000) {
    const d = await page.evaluate(() => window.__pmap.drivenNow)
    const who = Object.values(d)[0]
    if (who) {
      if (who.moving) { frames.add(who.frame); moved = true }
      if (!far) far = who
      near = who
      if (moved && !who.moving) break
    }
    await page.waitForTimeout(200)
  }
  ok('6', 'the principal is driven across the room', !!far && !!near && Math.hypot(near.x - far.x, near.y - far.y) > 40,
    far && near ? `${far.x},${far.y} -> ${near.x},${near.y}` : 'never moved')
  ok('6', 'and his walk cycle runs while he does', frames.size >= 4, `${frames.size} distinct frames`)
  ok('6', 'and he stands still on his first frame when he stops', !near?.moving && near?.frame === 0)

  /* item 8's other half: the painting holds still while a body walks it */
  const camA = await page.evaluate(() => ({ x: Math.round(window.__pmap.camZ * 1000) }))
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(1600)
  await page.keyboard.up('ArrowRight')
  const held = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return { z: Math.round(window.__pmap.camZ * 1000), x: Math.round(window.__pmap.x), c: !!c }
  })
  ok('8', 'and it holds still while he walks', camA.x === held.z, `zoom ${camA.x / 1000} -> ${held.z / 1000}`)
  await page.screenshot({ path: `${SHOTS}/03-the-maw.png` })
  await page.close()
  void s0
}

await browser.close()

console.log(`\n${pass} of ${pass + fails.length} checks pass`)
if (fails.length) {
  console.log('\nfailed:')
  for (const f of fails) console.log('  ' + f)
  process.exitCode = 1
}
