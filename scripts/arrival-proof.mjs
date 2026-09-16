/* the arrival gate, items 1 to 8: each check reads live scene state through `window.__pmap` and the real DOM while the beat runs, not that a function was called, because code that ran is not a picture on screen; passing says nothing about whether it looks good. */
import { chromium } from 'playwright'
import fs from 'node:fs'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const SHOTS = arg('shots', 'reference/_archive/build-shots/arrival/gate')
fs.mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const ok = (item, what, good, detail = '') => {
  if (good) { pass++; console.log(`  ok   ${item}  ${what}${detail ? '  ' + detail : ''}`) }
  else { fails.push(`${item}  ${what}${detail ? '  ' + detail : ''}`); console.log(`  FAIL ${item}  ${what}${detail ? '  ' + detail : ''}`) }
}


/* a line is a click: the arrival speaks one line at the wide shot, so the harness presses it through the way a player would rather than watching the game wait. */
const clickThrough = async (page) => {
  /* only click when a `.dlg-box` is really up: a looser selector matched the full-screen veil, so the harness went on clicking after the line was gone and let itself through the tunnel door mid-run. */
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

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') , args: GPU })

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
  /* the scene can go while a loop is sampling it: a door swap tears it down and builds a new one, and for a few frames there is nothing to ask. */
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
    /* read before the harness clicks it away, because the order of the card and the first spoken line is one of the things being checked. */
    dlg: !!document.querySelector('.dlg-box'),
    pin: (() => { const a = p.pinAt; return a && a.x > -1e5 })(),
  }
})

/* ---- THE CROSSING AND THE DOCK: items 1 to 5 ----------------------------- */
console.log('\nTHE CROSSING AND THE DOCK  (items 1 to 5)')
{
  const page = await open(`${base}/?scene=pmap&deep=1&map=hub&aboard=1`)
  const seen = []
  let duringMovie = null, atIslandShot = null, duringWalk = null, atDoor = null
  const walkFrames = []
  const t0 = Date.now()
  /* sampled rather than waited on, because every one of these claims is about a moment. */
  while (Date.now() - t0 < 70000) {
    const s = await state(page)
    if (!s) break
    await clickThrough(page)
    seen.push(s)
    /* not the first sample that sees the flag: `setCinema` flips a module variable and React mounts the bars on its next render, so a sample in the same frame reads movie with no bars and is right about both; the second one is honest. */
    if (s.movie && s.voyage && s.bars && !duringMovie) duringMovie = s
    /* the wide shot is at the dock with him already off the boat, so `hull` is gone by here, and that is what separates this frame from the sailing shot the map opens on, which is also wider than the walking one. */
    if (!s.hull && s.camZ < s.Z * 0.75 && !atIslandShot) atIslandShot = s
    /* mid-walk, not the first frame of it: the first sample that sees a walk label can land in the same frame the label appears, before the guide has recomputed its route or React has mounted the bars, and the third sample is the walk actually happening. */
    if (s.walk) { walkFrames.push(s); if (walkFrames.length === 3) duringWalk = s }
    if (!s.walk && duringWalk && Math.hypot(s.x - 343, s.y - 385) < 12) { atDoor = s; break }
    await page.waitForTimeout(400)
  }

  const movieFrames = seen.filter((s) => s.movie)
  ok('1', 'the crossing draws two black bars',
    /* two stretches now, the crossing and the walk, so up to two mount frames can see the flag before React has drawn the bars. */
    movieFrames.length >= 3 && movieFrames.filter((s) => s.bars).length >= movieFrames.length - 2,
    `${movieFrames.filter((s) => s.bars).length} of ${movieFrames.length} movie frames had them`)
  ok('1', 'and no HUD corner under them', duringMovie && !duringMovie.hudCorner)
  /* the help button is hidden during the cutscene like the HUD corner, which is affordable because the objective panel riding the top bar answers the question the button was there for; the beach opening keeps its question mark, having no panel and no corner to ask instead. */
  ok('1', 'and the help button goes with the corner', duringMovie && !duringMovie.help)
  ok('1', 'and no plaque, arrow or lit ring', duringMovie && !duringMovie.lit && duringMovie.trail === 0)
  ok('1', 'and no arrival card', duringMovie && !duringMovie.card)

  /* the controls, tested rather than assumed: hold every key the helm reads and see whether the ship answers. */
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
  /* the hop-out comes before the pull-out and both of these read `!hull` rather than `hull`, because the card names the place and must not play over a boy still sitting in a boat; landing is a person standing on the boards. */
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
  /* and nobody speaks before it: the card must play before any dialogue line on the hub, or the first thing a student reads names nothing. */
  const spoke = seen.find((s) => s.dlg)
  ok('2', 'and no line is spoken before the card',
    !spoke || (!!carded && seen.indexOf(carded) <= seen.indexOf(spoke)),
    spoke ? `card at sample ${seen.indexOf(carded)}, first line at ${seen.indexOf(spoke)}` : 'no line seen')
  ok('1', 'and the bars never come down in the middle',
    seen.filter((s, i) => i > seen.indexOf(duringMovie) && i < seen.indexOf(duringWalk) && !s.movie).length === 0,
    'from the first frame to the tunnel')
  /* the camera must not park at the walking shot on the way in, which reads as a two step shift: full island, half island, then him. */
  const between = seen.filter((s, i) => i > seen.indexOf(atIslandShot) && i <= seen.indexOf(duringWalk))
  ok('4', 'and the camera goes from the island to him in one move',
    between.filter((s) => Math.abs(s.camZ - s.Z) < 0.08).length <= 1,
    `${between.filter((s) => Math.abs(s.camZ - s.Z) < 0.08).length} frames parked at the walking shot`)
  /* the hop-out is checked above this, before the pull-out, because that is the order it happens in. */
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
  ok('5', 'a drawn pointer hangs over the tunnel', !!end.pointer, JSON.stringify(end.pointer))
  /* close to the thing, not large: this held `h >= 24`, and a mark hanging two body lengths over the chart table read as pointing at the bookshelf drawn behind it, so distance from the thing is what makes a mark mean something, never height. */
  ok('5', 'and it sits on the thing rather than over the room',
    !!end.pointer && end.pointer.bodies !== null && end.pointer.bodies <= 1.1,
    end.pointer ? `${end.pointer.bodies} bodies off the anchor` : '')
  /* and clear of the panel at the top: the objective panel rides across every frame and does not move out of the way, so at the tunnel the camera is close enough that the arrow sat behind it with only its tip showing. */
  const band = await page.evaluate(() => {
    const el = document.querySelector('.ob-wrap')
    return el ? Math.round(el.getBoundingClientRect().bottom) : 0
  })
  ok('5', 'and it hangs below the objective panel, not behind it',
    !!end.pointer && end.pointer.y >= band,
    `pointer top ${end.pointer?.y}, panel bottom ${band}`)
  /* the plaque first, then the press, which is the order a player does it in: the controls come back when the island's handler returns, a beat after the walk ends, so a press fired on the arrival frame lands while the world is still held and does nothing. */
  await page.waitForFunction(() => window.__pmap?.prompt === "Go to Panther's Maw", null, { timeout: 15000 })
    .catch(() => { /* the assert below says so */ })
  const offered = await page.evaluate(() => window.__pmap?.prompt ?? null)
  ok('5', 'the door offers itself inside the frame', offered === "Go to Panther's Maw", String(offered))
  await page.keyboard.press('e')
  await page.waitForTimeout(3000)
  ok('5', 'and E opens it', await page.evaluate(() =>
    !!document.querySelector('.tr-root') || window.__pmap?.map !== 'hub'))

  /* the measured landing defect, read off the plaque itself: he lands 55 painting pixels from the berth, well inside its 110 pixel radius, so the first thing offered after a crossing was the way back onto the water. */
  /* `!s.movie` cannot be in here: the bars are up for the whole arrival, so there is no frame that is ashore and out of the frame until the tunnel, and ashore and not walking is the state this is about. */
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
  const page = await open(`${base}/?scene=pmap&deep=1&map=hub&aboard=1`)
  await page.waitForFunction(() => window.__pmap.movie === true, null, { timeout: 20000 }).catch(() => {})
  const a = await page.evaluate(() => window.__pmap.hull && { ...window.__pmap.hull })
  for (const k of ['ArrowUp', 'ArrowLeft', 'Shift']) await page.keyboard.down(k)
  await page.waitForTimeout(600)
  const b = await page.evaluate(() => window.__pmap.hull && { ...window.__pmap.hull })
  for (const k of ['ArrowUp', 'ArrowLeft', 'Shift']) await page.keyboard.up(k)
  /* she is under way on her own route, so the test is not whether she moved but whether she turned, which is the only thing the tiller does that the route does not. */
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
  /* the berth is quiet while the year owes something he can walk to and opens when the year wants him at sea; the voyage phase is unreachable from a seeded save while every roster row is `playable: false` and `member-islands.json` is empty, so `yearStatus` never sets `voyage`. */
  const phases = [
    ['founding', ['hub:crossed'], false],
    ['plan', ['hub:crossed', 'maw:founding', 'chart:granted', 'handbook:granted', 'vignette:y1'], false],
  ]
  for (const [label, flags, wantBoat] of phases) {
    const page = await open(`${base}/?scene=pmap&deep=1&map=hub`, { ...SAVE, flags })
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
  /* the room with nobody directing it: the Maw's island films the principal to the table on every load, so a gate move raced the island's own words and left the body at 206,124, the tunnel mouth; this save has both films behind it so nothing but the gate drives anybody. */
  const QUIET = {
    ...SAVE,
    flags: ['hub:crossed', 'maw:founding', 'vignette:y1', 'maw:railed', 'maw:handed_over',
      'maw:wall_shown', 'chart:granted', 'handbook:granted', 'yearbook:y1'],
    plans: { 1: { slots: {}, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
    ledger: [{ id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall', attempts: 1, firstGrade: 4 }],
  }
  const page = await open(`${base}/?scene=pmap&deep=1&map=panther-maw&at=arrive_maw`, QUIET)
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
  /* watched until he stops rather than for a fixed number of samples: a fixed count passes on a dev server and fails on the deploy, where the room's bundle comes off the platform and the founding starts seconds later, so the window closed with the principal still halfway across the hall. */
  /* driven by this gate, not by whoever owns the room: item 6 is an engine claim, that a body a script walks moves at walking pace with its legs going, so it asks for the move through the same `actor_move` a member's island uses rather than waiting on somebody else's beat. */
  /* the picture is counted, not the counter: `frame` is `Math.floor(animT)` and counts up whether or not the texture ever changes, so `tex`, the source rectangle really being shown, is read instead; sampled every 60ms rather than 150, because the cycle is eight frames over 76 painting pixels in about three seconds and 150ms caught two or three. */
  /* wait for the room to finish dressing itself first: the island's `walking_in` moves this same body on every load, and `place` cancels a move in flight, so a gate move started inside that window measured fourteen pixels instead of a hundred and blamed the engine. */
  /* asked, not guessed: a quarter second of stillness is equally true before the island has started, and `busy` is the same mistake one level up because an island that has not loaded is not busy either, so this reads `started`, the scene's own record that the unprompted handler returned. */
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
  /* the number moved with the table: on v4 `chart_table` stood at 335,211 with the stand point at 370,201, a 36 pixel walk that could not meet this check's own threshold of 40; on v6 the table is at 288,229 with its stand at 295,213, so the walk is about 76 pixels of ground. */
  ok('6', 'a driven body really crosses the room', !!far && !!near && Math.hypot(near.x - far.x, near.y - far.y) > 40,
    far && near ? `${far.x},${far.y} -> ${near.x},${near.y}` : 'never moved')
  ok('6', 'and its walk cycle runs while it does', frames.size >= 4, `${frames.size} distinct frames`)
  ok('6', 'and the DRAWING really changes, not just the counter', pics.size >= 4,
    `${pics.size} distinct textures`)
  /* he is using his own legs: a placement carries one frame set per look and the principal's is the breathing idle he was drawn in, so crossing the room slid him through eight pictures of a man standing still; the walk is an override read out of this repo, not a second look on the placement, so it needs nothing re-exported. */
  const GAIT = '/art/characters/principal/walk/'
  {
    /* one sample may be the idle he set off on: the harness reads the sprite across a round trip, so it can catch the frame between the move starting and the draw loop swapping the set, and everything after it has to be the walk. */
    const onGait = [...pics].filter((p) => p.includes(GAIT))
    ok('6', 'and the picture he walks on is his walk cycle',
      onGait.length >= 4 && pics.size - onGait.length <= 1,
      `${onGait.length} of ${pics.size} sampled were the walk`)
  }
  ok('6', 'and he settles back onto his own idle when he stops',
    !!near && !near.moving && !near.tex.includes(GAIT), near ? near.tex.slice(0, 70) : 'never stopped')
  /* he breathes when he stops and does not freeze: a stopped driven body used to pin `animT = 0` and index 0 every frame, and the idle runs on its own fps now like every other breathing thing on the map; what still matters is that he is on his idle and not his walk. */
  ok('6', 'and he is standing, not walking, when he stops', !near?.moving)

  /* item 8's other half, the painting holds still while a body walks it: the camera is settled first because the year one rail moves it, so reading the zoom the instant he stops lands mid-ease and reports the room scrolling when a camera was only arriving. */
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
