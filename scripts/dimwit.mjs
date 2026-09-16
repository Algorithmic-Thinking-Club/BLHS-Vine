/* opens the game cold at 1366x768, reads nothing, and presses the loudest control on the glass, never a key, so a pass says only that nobody is stranded on the way to a stamped year sheet; --road is the default and refuses the corner, a door nothing on screen points at, while --any allows it */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

/* the real gpu, because a headless browser otherwise rasterises on the cpu and a camera move outruns the timeouts below */
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist']

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const SHOTS = arg('shots', 'reference/_archive/build-shots/dimwit')
const BY_ROAD = !has('any')

fs.mkdirSync(SHOTS, { recursive: true })
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f))

let n = 0
const trail = []
const stalls = []
const say = (s) => { trail.push(s); console.log(s) }

/* anything that reads as a way backwards, excluded because a harness that presses Back is testing its own patience and not the game */
const BACKWARD = /^back$|^close$|skip|quit|settings|back to the|back to my|leave this/i
/* the corner, a door the world never points at, excluded from the road run */
/* the corner is now Map, Guide and My Year; the three old names stay in the pattern because this run is often pointed at a stale deploy, and a corner it does not recognise is a corner it walks through */
const CORNER = /^map$|^guide$|^my year$|^chart$|^handbook$|^year sheet$|^\?$/i

const browser = await chromium.launch({ headless: !has('headed') , args: GPU })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
await page.goto(base, { waitUntil: 'domcontentloaded' })

const shot = async (name) => {
  const f = path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png`)
  await page.screenshot({ path: f })
  return f
}

/* what a student can see and press, plus what the painted map thinks it is doing, read from the scene's own debug bag because a harness keeping its own copy of the world reported a stale global as the player never moving */
const look = () => page.evaluate(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
      && +s.opacity > 0.02 && r.top < innerHeight && r.left < innerWidth && r.bottom > 0 && r.right > 0
  }
  const press = []
  for (const el of document.querySelectorAll('button, a, [role="button"]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue
    const r = el.getBoundingClientRect()
    press.push({
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 70),
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      /* chrome is not the way on: the objective bar is a control, and on a quiet map it is the loudest thing on the glass, a sign that opens a list and closes it again forever, so exclusion goes by where a control lives rather than by its wording and the next always-present control inherits it */
      chrome: !!el.closest('.ob-wrap, .hud-stack, .hp-btn, .hud-help')
    })
  }
  const texts = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !vis(el)) continue
    const t = (el.innerText || '').trim().replace(/\s+/g, ' ')
    if (t) texts.push(t.slice(0, 120))
  }
  const p = window.__pmap
  const save = (() => { try { return JSON.parse(localStorage.getItem('blhs_save_v2') || 'null') } catch { return null } })()
  return {
    press: press.filter((e) => e.text && !e.chrome),
    texts: [...new Set(texts)],
    map: p ? { map: p.map, x: Math.round(p.x), y: Math.round(p.y), hull: p.hull, guide: p.guide, lit: p.lit } : null,
    /* the bars are up and no control belongs to the player, so a watched stretch is not a stall, because the crossing into the hub is a cutscene to sit through and the sea budget below was written when the ship was steered by hand */
    movie: document.documentElement.dataset.movie === '1',
    /* a cover is not a stall either: `.tr-root` is the painted transition, and while it is up the scene is being rebuilt so `__pmap` is briefly gone, which used to read as this run's own words for a dead end */
    covered: !!document.querySelector('.tr-root'),
    stamped: !!(save && save.plans && Object.values(save.plans).some((pl) => pl && pl.stamped)),
  }
})

const forward = (v) => v.press
  .filter((e) => !BACKWARD.test(e.text) && (!BY_ROAD || !CORNER.test(e.text)))
  .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))

await page.waitForTimeout(4500)
say(`dimwit: cold at 1366x768 against ${base}${BY_ROAD ? ' (by the road)' : ' (any door)'}`)

let last = null, repeats = 0, sea = 0, done = false, blind = 0, card = ''
let onMap = null, stillFor = 0, wasAt = ''
const tried = new Set()
for (let i = 0; i < 320 && !done; i++) {
  await page.waitForTimeout(650)
  const v = await look()

  if (v.press.length || (v.map && !v.map.hull)) blind = 0
  const head = v.texts[0] || ''
  if (head !== card) { card = head; tried.clear() }

  if (v.stamped) { done = true; say(`PASS: the year sheet is stamped, at step ${i}`); await shot('stamped'); break }

  /* at sea the water is not a button and the loudest-thing rule has nothing to bite on, so a click on the water is the move and a click on the island ties up, the one place this run knows something a reader would not */
  if (v.map && v.map.hull) {
    /* a line on screen holds the world, so a click at sea while somebody is talking is refused and must not be counted against the crossing */
    const held = v.texts.some((t) => /click, or press space|go on|begin the year/i.test(t))
    if (held) { await page.mouse.click(683, 640); continue }
    /* a watched crossing is not twenty wasted clicks: `movie` means the bars are up and every control is gone on purpose, so wait it out rather than spend the sea budget on a cutscene */
    if (v.movie) { await page.waitForTimeout(650); continue }
    if (sea === 0) say('at sea: clicking toward the island')
    if (sea++ > 20) { say('STOP: twenty clicks at sea and still afloat'); await shot('adrift'); break }
    await page.mouse.click(683, 210)
    continue
  }

  const opts = forward(v)
  const pick = opts[0]
  if (pick) {
    if (pick.text !== last) { last = pick.text; repeats = 0; say(`  press ${JSON.stringify(pick.text)}`) }
    else repeats++
    tried.add(pick.text)
    if (repeats > 2) {
      /* the loudest thing refused twice: a card whose biggest control cannot be used is the failure this script exists to find, so it is recorded and stepped around rather than ending the run, because one such card early would hide every one after it */
      /* take the next loudest untried control on this card, because taking the smallest looped forever on the wardrobe where a dozen colour swatches sit under one locked row, and `tried` is cleared when the card changes, which is why the heading is watched */
      const alt = opts.find((e) => e.text !== pick.text && !tried.has(e.text))
      if (alt) {
        stalls.push({ loud: pick, forward: alt, card: v.texts[0] || '?' })
        say(`  STALL: ${JSON.stringify(pick.text)} (${pick.box.w}x${pick.box.h}) is the loudest thing `
          + `but ${JSON.stringify(alt.text)} (${alt.box.w}x${alt.box.h}) is the way on`)
        await shot('stall-' + pick.text)
        last = alt.text; repeats = 0; tried.add(alt.text)
        await page.mouse.click(alt.box.x + alt.box.w / 2, alt.box.y + alt.box.h / 2)
        continue
      }
      say(`STOP: nothing but ${JSON.stringify(pick.text)}, and it does nothing`)
      await shot('stuck')
      break
    }
    await page.mouse.click(pick.box.x + pick.box.w / 2, pick.box.y + pick.box.h / 2)
    continue
  }

  /* no control at all means somebody is talking or the student is standing on a map, so check the box first because a line holds the world, then the ground */
  const talking = v.texts.some((t) => /click, or press space|go on|begin the year/i.test(t))
  if (talking) { await page.mouse.click(683, 640); continue }
  if (v.map) {
    if (v.map.map !== onMap) {
      onMap = v.map.map
      say(`ashore on ${onMap} at ${v.map.x},${v.map.y} · the game is pointing at ${v.map.guide ?? 'nothing'}`)
      await shot('ashore-' + onMap)
      stillFor = 0; wasAt = `${v.map.x},${v.map.y}`
    }
    /* on a map the one lit thing is what the game wants, and pressing it without moving for long enough means the map itself is the dead end, which is how the published hub was caught landing a student in a sealed pocket with no route to its only door */
    const at = `${v.map.x},${v.map.y}`
    stillFor = at === wasAt ? stillFor + 1 : 0
    wasAt = at
    if (stillFor > 12) {
      say(`STOP: ashore on ${onMap} at ${at}, pressing the lit thing, and he has not moved in ${stillFor} tries`)
      say(`      the game is pointing at ${v.map.guide ?? 'nothing'}; there is no route to it from here`)
      await shot('fenced-' + onMap)
      break
    }
    if (v.map.lit) await page.mouse.click(v.map.lit.at.x, v.map.lit.at.y)
    else await page.mouse.click(560, 330)
    continue
  }
  /* a card still typing itself out has no control and is not talking in the dialogue sense: the whole card is the button, so press the middle of the screen, bounded so a genuinely dead screen still ends the run */
  /* a cover is the game working: every door plays a painted one and it holds the best part of four seconds by design, longer than three blind clicks, so waiting stays bounded by the step budget and a cover that never lifts ends the run with a picture of itself */
  if (v.covered) { blind = 0; await page.waitForTimeout(700); continue }
  /* the bars are the game working too: the beach crossing is half a minute of sailing with the controls held and nothing to press, and twelve blind clicks go by in about two seconds, so without this the live deploy read as a dead end mid voyage */
  if (await page.evaluate(() => document.documentElement.dataset.movie === '1')) {
    blind = 0
    await page.waitForTimeout(900)
    continue
  }
  /* eight seconds of blind clicks rather than two, because a map swap can hold a real loading frame for a second or two on a cold cache and calling that a dead end reports the game as broken for being busy, while eight seconds of nothing is still a dead end */
  if (blind++ < 12) { await page.mouse.click(683, 384); continue }
  say('STOP: nothing on the screen is pressable and nothing is talking')
  await shot('nothing')
  break
}

if (!done) {
  /* always say where the run ended, because a run that stops without a reason is one nobody can act on and the loop can run out of steps in the middle of anything */
  const end = await look()
  say('FAIL: the run never reached a stamped year sheet')
  say(`      it ended ${end.map ? (end.map.hull ? `afloat off ${end.map.map}` : `on ${end.map.map} at ${end.map.x},${end.map.y}`) : 'off any map'}`
    + `${end.map ? `, with the game pointing at ${end.map.guide ?? 'nothing'}` : ''}`)
  say(`      what was on the glass: ${JSON.stringify(end.press.map((e) => e.text).slice(0, 6))}`)
  await shot('ended')
}
say('')
say('--- where the loudest thing was not the way on ---')
if (!stalls.length) say('  none')
for (const s of stalls) {
  say(`  ${JSON.stringify(s.loud.text)} (${s.loud.box.w * s.loud.box.h}px) outranks `
    + `${JSON.stringify(s.forward.text)} (${s.forward.box.w * s.forward.box.h}px)`)
}
if (errors.length) { say(''); say('--- page errors ---'); for (const e of [...new Set(errors)]) say('  ' + e) }
say('')
say(`shots in ${SHOTS}`)
await browser.close()
process.exit(done && !stalls.length ? 0 : 1)
