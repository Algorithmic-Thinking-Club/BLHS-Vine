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


/* A LINE IS A CLICK, and a harness that does not make it is a harness watching a
 * game wait for a player. The arrival says one line at the wide shot; a student
 * clicks it and so does this. */
const clickThrough = async (page) => {
  /* ONLY THE BOX, and only when one is really up. A looser selector matched the
   * full-screen veil, so the harness went on clicking the glass after the line
   * was gone and let itself through the tunnel door in the middle of the run. */
  const up = await page.evaluate(() => !!document.querySelector('.dlg-box'))
  if (!up) return false
  await page.keyboard.press('Space')
  return true
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
  /* the scene can go while a loop is sampling it: a door swap tears it down and
   * builds a new one, and for a few frames there is nothing to ask */
  if (!p) return null
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
    /* read BEFORE the harness clicks it away, because the order of the card and
     * the first spoken line is one of the things being checked */
    dlg: !!document.querySelector('.dlg-box'),
    pin: (() => { const a = p.pinAt; return a && a.x > -1e5 })(),
  }
})

/* ---- THE CROSSING AND THE DOCK: items 1 to 5 ----------------------------- */
console.log('\nTHE CROSSING AND THE DOCK  (items 1 to 5)')
{
  const page = await open(`${base}/?scene=pmap&map=hub&aboard=1`)
  const seen = []
  let duringMovie = null, atIslandShot = null, duringWalk = null, atDoor = null
  const walkFrames = []
  const t0 = Date.now()
  /* sampled rather than waited on, because every one of these claims is about a
   * moment and the moments are what the brief lists */
  while (Date.now() - t0 < 70000) {
    const s = await state(page)
    if (!s) break
    await clickThrough(page)
    seen.push(s)
    /* NOT THE FIRST SAMPLE THAT SEES THE FLAG. `setCinema` flips a module
     * variable and React mounts the bars on its next render, so a sample taken
     * in the same frame as the flag reads "movie, no bars" and is right about
     * both. The second one is the honest one. */
    if (s.movie && s.voyage && s.bars && !duringMovie) duringMovie = s
    /* THE WIDE SHOT IS AT THE DOCK WITH HIM ALREADY OFF THE BOAT, which is
     * Ash's THIRD order, 2026-09-07: she ties up, he hops out, the camera pulls
     * out, and the card plays over that shot. `hull` is therefore gone by here,
     * and it is what separates this frame from the sailing shot the map opens
     * on, which is also wider than the walking one. */
    if (!s.hull && s.camZ < s.Z * 0.75 && !atIslandShot) atIslandShot = s
    /* MID-WALK, NOT THE FIRST FRAME OF IT. The first sample that sees a walk
     * label can land in the same frame the label appears, before the guide has
     * recomputed its route or React has mounted the bars, and it is right about
     * all three. The third sample is the walk actually happening. */
    if (s.walk) { walkFrames.push(s); if (walkFrames.length === 3) duringWalk = s }
    if (!s.walk && duringWalk && Math.hypot(s.x - 343, s.y - 385) < 12) { atDoor = s; break }
    await page.waitForTimeout(400)
  }

  const movieFrames = seen.filter((s) => s.movie)
  ok('1', 'the crossing draws two black bars',
    /* two stretches now, the crossing and the walk, so up to two mount frames
     * can see the flag before React has drawn the bars */
    movieFrames.length >= 3 && movieFrames.filter((s) => s.bars).length >= movieFrames.length - 2,
    `${movieFrames.filter((s) => s.bars).length} of ${movieFrames.length} movie frames had them`)
  ok('1', 'and no HUD corner under them', duringMovie && !duringMovie.hudCorner)
  /* THE QUESTION MARK GOES TOO, AND THIS CHECK IS THE REVERSE OF WHAT IT WAS.
   *
   * It read "and the help button is still there" on Ash's words of 2026-09-06,
   * that it should always be there. He played that build and ruled the other way
   * (BRIEF-MAW-RAIL-3 G): "The help button inside the bars: hidden during the
   * cutscene like the corner." `cinema.css` does exactly that, and the objective
   * panel riding on the top bar is what makes it affordable, because that panel
   * answers the question the button was there for. The beach opening keeps its
   * question mark, and that is a different rule in the same file: it has no
   * panel and no corner to ask instead. */
  ok('1', 'and the help button goes with the corner', duringMovie && !duringMovie.help)
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
  /* THIS PAIR IS THE 2026-09-07 RULING AND IT REPLACES THE OLD ONE.
   *
   * What stood here until today pinned the opposite order: "the island is
   * framed at the dock with the ship tied up" and "the arrival card plays
   * there, with him still aboard", both asserting `hull`. Ash watched that and
   * ruled against it: the card names the place, so it must not play over a boy
   * still sitting in a boat. Landing is a person standing on the boards. The
   * hop-out therefore comes BEFORE the pull-out now, and both of these read
   * `!hull` where they used to read `hull`. */
  const hopped = seen.find((s) => !s.hull)
  ok('3', 'he hops out as soon as she is tied up',
    !!hopped, hopped ? `${hopped.x},${hopped.y}` : 'never stepped off')
  ok('2', 'and THEN the island is framed, with him already on the dock',
    !!atIslandShot && !atIslandShot.hull && seen.indexOf(hopped) <= seen.indexOf(atIslandShot),
    atIslandShot ? `zoom ${atIslandShot.camZ} against a walking ${atIslandShot.Z}` : 'never happened')
  ok('3', 'and the pull-out really is wider than the walking shot',
    !!atIslandShot && atIslandShot.camZ < atIslandShot.Z * 0.8)

  const carded = seen.find((s) => s.card)
  ok('2', 'the arrival card plays over that shot, with him ashore',
    !!carded && !carded.hull && carded.camZ < carded.Z * 0.8,
    carded ? `zoom ${carded.camZ}` : 'no card')
  /* AND NOBODY SPEAKS BEFORE IT. Ash: the card must play "before any dialogue
   * line on the hub". The hub says one line at the wide shot and it used to be
   * said first, so the first thing a student read named nothing. */
  const spoke = seen.find((s) => s.dlg)
  ok('2', 'and no line is spoken before the card',
    !spoke || (!!carded && seen.indexOf(carded) <= seen.indexOf(spoke)),
    spoke ? `card at sample ${seen.indexOf(carded)}, first line at ${seen.indexOf(spoke)}` : 'no line seen')
  ok('1', 'and the bars never come down in the middle',
    seen.filter((s, i) => i > seen.indexOf(duringMovie) && i < seen.indexOf(duringWalk) && !s.movie).length === 0,
    'from the first frame to the tunnel')
  /* Ash watched a two step shift: full island, half island, then him. The
   * walking shot must never be a resting place between the two. */
  const between = seen.filter((s, i) => i > seen.indexOf(atIslandShot) && i <= seen.indexOf(duringWalk))
  ok('4', 'and the camera goes from the island to him in one move',
    between.filter((s) => Math.abs(s.camZ - s.Z) < 0.08).length <= 1,
    `${between.filter((s) => Math.abs(s.camZ - s.Z) < 0.08).length} frames parked at the walking shot`)
  /* the hop-out is checked above now, before the pull-out, where the 2026-09-07
   * ruling puts it */
  ok('1', 'no sea plaque is offered while she is tied up',
    !seen.some((s) => s.hull && !s.movie && (s.prompt === 'Dock here' || s.prompt === 'Get in the boat')))

  ok('4', 'he walks himself to the tunnel', !!duringWalk && duringWalk.walk === 'panthers_maw')
  ok('4', 'the camera is in close on him while he walks',
    !!duringWalk && duringWalk.camZ > duringWalk.Z * 1.4, duringWalk ? `zoom ${duringWalk.camZ} against a walking ${duringWalk.Z}` : '')
  ok('4', 'and the walk is behind the bars with the corner away',
    !!duringWalk && duringWalk.bars && !duringWalk.hudCorner)
  ok('4', 'and he can still be told apart from the crowd',
    !!duringWalk && duringWalk.pin)
  ok('5', 'drawn marks are laid along the route while he walks',
    !!duringWalk && duringWalk.trail >= 4, duringWalk ? `${duringWalk.trail} marks` : '')
  ok('4', 'and he arrives at the door', !!atDoor, atDoor ? `${atDoor.x},${atDoor.y}` : 'never arrived')

  const end = await state(page)
  ok('5', 'a large drawn pointer hangs over the tunnel', !!end.pointer, JSON.stringify(end.pointer))
  ok('5', 'and it is clear of the sentence over his head', !!end.pointer && end.pointer.h >= 24)
  /* AND CLEAR OF THE PANEL AT THE TOP, which is a newer obstruction than the
   * sentence and a worse one, because it does not move out of the way. The
   * objective panel rides across every frame now and at the tunnel the camera is
   * close enough that the arrow was behind it with only its tip showing. */
  const band = await page.evaluate(() => {
    const el = document.querySelector('.ob-wrap')
    return el ? Math.round(el.getBoundingClientRect().bottom) : 0
  })
  ok('5', 'and it hangs below the objective panel, not behind it',
    !!end.pointer && end.pointer.y >= band,
    `pointer top ${end.pointer?.y}, panel bottom ${band}`)
  /* THE PLAQUE FIRST, THEN THE PRESS, which is the order a player does it in.
   * The frame stays up at the tunnel and the controls come back when the
   * island's handler RETURNS, a beat after the walk ends, so a press fired on
   * the arrival frame lands while the world is still held and does nothing.
   * Waiting for the offer is both more honest and what a student does. */
  await page.waitForFunction(() => window.__pmap?.prompt === "Go to Panther's Maw", null, { timeout: 15000 })
    .catch(() => { /* the assert below says so */ })
  const offered = await page.evaluate(() => window.__pmap?.prompt ?? null)
  ok('5', 'the door offers itself inside the frame', offered === "Go to Panther's Maw", String(offered))
  await page.keyboard.press('e')
  await page.waitForTimeout(3000)
  ok('5', 'and E opens it', await page.evaluate(() =>
    !!document.querySelector('.tr-root') || window.__pmap?.map !== 'hub'))

  /* the measured landing defect, read off the plaque itself: he lands 55
   * painting pixels from the berth, well inside its 110 pixel radius, so before
   * the gate the first thing the game offered after a crossing was the way back
   * onto the water */
  /* `!s.movie` used to be in here and cannot be any more: the bars are up for
   * the whole arrival now, so there is no frame that is ashore AND out of the
   * frame until the tunnel. Ashore and not walking is the state this is about. */
  const landedFrames = seen.filter((s) => !s.hull && !s.walk)
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
  /* THE ROOM WITH NOBODY DIRECTING IT, which this section always meant and
   * never asked for. The Maw's island runs a film on every load while year one
   * still owes something, and that film PLACES the principal at the tunnel and
   * then LEADS him to the table. So the move this gate starts below was racing
   * two of the island's own words for the same body: measured, the body the gate
   * asked to walk to the table ended up at 206,124, which is the tunnel mouth,
   * and the walk cycle it counted was two bodies' worth of nothing.
   *
   * The save below has both films behind it (`maw:railed`, `maw:handed_over`,
   * the year's page turned) so `walking_in` dresses the wall and returns, and
   * the only thing driving anybody in the room is this gate. */
  const QUIET = {
    ...SAVE,
    flags: ['hub:crossed', 'maw:founding', 'vignette:y1', 'maw:railed', 'maw:handed_over',
      'maw:wall_shown', 'chart:granted', 'handbook:granted', 'yearbook:y1'],
    plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
    ledger: [{ id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall', attempts: 1, firstGrade: 4 }],
  }
  const page = await open(`${base}/?scene=pmap&map=panther-maw&at=arrive_maw`, QUIET)
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
  /* DRIVEN BY THIS GATE RATHER THAN BY WHOEVER OWNS THE ROOM. Item 6 is an
   * ENGINE claim: a body a script walks moves at a walking pace with its legs
   * going. Which body walks where, and when, is the Maw island's content and it
   * is being rewritten; a gate that waits for somebody else's beat is a gate
   * that goes red when they change their mind. So this asks the engine for the
   * move itself, through the same `actor_move` a member's island would use. */
  /* AND THE PICTURE IS COUNTED, NOT THE COUNTER. `frame` is `Math.floor(animT)`
   * and it counts up whether or not the sprite's texture ever changes; Ash's
   * report on rail-4 was "the principal has no walking animation", which is a
   * claim about the drawing. `tex` is the source rectangle the sprite is really
   * showing, so a body sliding with one picture on it fails here.
   *
   * SAMPLED EVERY 60MS RATHER THAN EVERY 150. The walk to the table is about
   * three seconds and the cycle is eight frames over 76 painting pixels of
   * ground; at 150ms this gate saw two or three of them and called it broken. */
  /* AND IT WAITS FOR THE ROOM TO FINISH DRESSING ITSELF FIRST.
   *
   * `walking_in` in the Maw's island runs on every load and is allowed to move
   * this exact body: since 2026-09-08 it steps the principal in front of whoever
   * just walked in, because Ash moved his post to six pixels from the spot the
   * tunnel puts a student on. That is one worker round trip after the scene
   * draws, and this gate used to start its own `actor_move` inside that window:
   * `place` cancels a move in flight, so the engine did exactly what it was
   * asked and the gate measured fourteen pixels instead of a hundred and called
   * the engine broken.
   *
   * Waiting for the body to be still for a quarter of a second is the honest
   * fix. It is not waiting for somebody's BEAT, which the note above rules out;
   * it is waiting for the room to stop being loaded, which every real caller of
   * `actor_move` also does by virtue of being a line in a scene rather than the
   * first thing that happens. */
  /* ASKED, NOT GUESSED. The first version of this wait watched the principal for
   * a quarter of a second of stillness, which is true after the island has
   * dressed the room and equally true BEFORE it has started: on the deploy the
   * bundle comes off the platform and the worker starts seconds later, so the
   * gate waited, saw a man standing still at his home pixel, set off, and the
   * island's `place` landed in the middle of the move. Watching `busy` alone was
   * the same mistake one level up: an island that has not loaded yet is not busy
   * either. `started` is the scene's own record of the handler it calls
   * unprompted having RETURNED, which is the question this gate actually has. */
  const settled = async () => {
    const t = Date.now()
    while (Date.now() - t < 25000) {
      const i = await page.evaluate(() => window.__pmap.island ?? null)
      if (i?.started && !i.busy) return true
      await page.waitForTimeout(125)
    }
    return false
  }
  if (!await settled()) console.log('  (the room never reported finishing its opening)')

  const frames = new Set()
  const pics = new Set()
  let far = null, near = null
  const walking = page.evaluate(() => window.__pmap.perform(
    { kind: 'actor_move', actor: 'principal_desk', to: 'chart_table' }))
  const t1 = Date.now()
  while (Date.now() - t1 < 20000) {
    const who = Object.values(await page.evaluate(() => window.__pmap.drivenNow))[0]
    if (who) {
      if (who.moving) { frames.add(who.frame); pics.add(who.tex) }
      if (!far && who.moving) far = who
      near = who
    }
    await page.waitForTimeout(60)
    if (far && near && !near.moving) break
  }
  await walking.catch(() => {})
  /* THE NUMBER MOVED WITH THE TABLE. On v4 `chart_table` stood at 335,211 and
   * the principal's own stand point is 370,201, which is 36 painting pixels of
   * ground: this check's own threshold of 40 could not be met by the walk it was
   * measuring, and it passed on the frames of a fight between two words. On v6
   * the table is at 288,229 with its stand at 295,213, so the walk is about 76
   * pixels of ground and the threshold is met by the walk itself. */
  ok('6', 'a driven body really crosses the room', !!far && !!near && Math.hypot(near.x - far.x, near.y - far.y) > 40,
    far && near ? `${far.x},${far.y} -> ${near.x},${near.y}` : 'never moved')
  ok('6', 'and its walk cycle runs while it does', frames.size >= 4, `${frames.size} distinct frames`)
  ok('6', 'and the DRAWING really changes, not just the counter', pics.size >= 4,
    `${pics.size} distinct textures`)
  ok('6', 'and it stands on its first frame when it stops', !near?.moving && near?.frame === 0)

  /* item 8's other half: the painting holds still while a body walks it.
   *
   * SETTLED FIRST, AND THAT IS A CORRECTION. This read the zoom the instant the
   * principal stopped and compared it a second and a half later, which was true
   * while the Maw held one shot for the whole room. It does not any more: the
   * year one rail is one cutscene with camera moves in it, so the reading landed
   * mid-ease and the check reported the room scrolling under the player when
   * what it had actually caught was a camera still on its way somewhere. The
   * claim was never "the Maw has one zoom forever", it is "walking does not move
   * the picture", so the camera is allowed to arrive before the walk begins. */
  await page.waitForFunction(() => {
    const z = Math.round(window.__pmap.camZ * 1000)
    const was = window.__gateZ
    window.__gateZ = z
    return was === z
  }, null, { timeout: 20000, polling: 500 }).catch(() => { /* the assert below says so */ })
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
