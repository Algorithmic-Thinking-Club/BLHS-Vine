/* THE DIMWIT RUN: the pass mark BRIEF-SELF-EVIDENT.md sets for the whole game.
 *
 * Ash, after his first playthrough: "Even a half-minded dimwit should understand
 * exactly what's going on and how to play it." So this opens the game cold at
 * 1366x768, reads nothing, and at every state presses the loudest thing on the
 * glass. It never touches a key. It stops the moment it cannot tell what to
 * press, and it says where.
 *
 * WHAT "LOUDEST" MEANS HERE, and it is deliberately crude, because a student who
 * reads nothing is crude: the biggest visible control that is not a way
 * backwards. Back, skip, quit and settings are excluded, because a freshman
 * looking for the way on does not press the way out.
 *
 * THE PASS MARK, AND IT HAS ONE WORD IN IT THE BRIEF DID NOT: the run has to
 * reach the stamped year sheet BY THE ROAD. The first sweep found the mark could
 * be met through the corner's own Year sheet plaque, which nothing on screen
 * points at, so the game would have passed a test it cannot survive. `--road`
 * (the default) refuses that door. `--any` restores the original reading.
 *
 * WHAT IT IS NOT. It does not say the game is good. It says a student who
 * presses the brightest thing is never stranded. Ash playing it is the only
 * gate, and this has never replaced that.
 *
 * Run: npm run dev, then `node scripts/dimwit.mjs`
 *   --base=http://localhost:5173   where the game is
 *   --headed                       watch it
 *   --shots=<dir>                  where the screenshots go
 *   --any                          allow the corner as a route to the year sheet
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

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

/* ANYTHING THAT READS AS A WAY BACKWARDS. A dimwit presses forward; a harness
 * that presses Back is testing its own patience and not the game. */
const BACKWARD = /^back$|^close$|skip|quit|settings|back to the|back to my|leave this/i
/* THE CORNER, which is a door the world never points at. Excluded from the road
 * run for the reason at the top of this file. */
/* The corner is Map, Guide and My Year since BRIEF-MAW-RAIL; the three old names
 * stay in the pattern because a stale deploy is exactly what this run is pointed
 * at half the time, and a corner it does not recognise is a corner it walks
 * through. */
const CORNER = /^map$|^guide$|^my year$|^chart$|^handbook$|^year sheet$|^\?$/i

const browser = await chromium.launch({ headless: !has('headed') })
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

/* WHAT A STUDENT CAN SEE AND PRESS, plus what the painted map thinks it is
 * doing. The scene's own debug bag is read rather than a second copy of the
 * world kept here: the first sweep's harness held its own idea of where the
 * player was and reported a stale global as "he never moved". */
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
      /* CHROME IS NOT THE WAY ON, and since 2026-09-08 the objective bar is a
       * control: pressing it drops the year's task sheet. This run presses the
       * loudest thing on the glass, and on a quiet map that is a wooden sign at
       * the top of the screen that opens a list and closes it again forever. The
       * corner and the help plaque were already excluded by name; this is the
       * same rule said once, by where a control lives rather than by its
       * wording, so the next always-present control inherits it. */
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
    /* THE BARS ARE UP AND NOTHING IS HIS. A watched stretch is not a stall and
     * must not be counted as one: the crossing into the hub is a cutscene the
     * student sits through, and the sea budget below was written when the ship
     * was something he steered. */
    movie: document.documentElement.dataset.movie === '1',
    /* AND A COVER IS UP, WHICH IS ALSO NOT A STALL. `.tr-root` is the painted
     * transition; while it is on the glass the scene under it is being torn
     * down and rebuilt, so `__pmap` is briefly gone and there is nothing to
     * press. That used to read as "nothing on the screen is pressable and
     * nothing is talking", which is this run's own word for a dead end. */
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

  /* AT SEA. The water is not a button, so the loudest-thing rule has nothing to
   * bite on: a click on the water is the move, and a click on the island ties
   * her up. This is the one place the run knows something a reader would not,
   * and it is here because the sea has no control on it to find. */
  if (v.map && v.map.hull) {
    /* A LINE ON SCREEN HOLDS THE WORLD, so a click at sea while somebody is
     * talking is refused and must not be counted against the crossing. */
    const held = v.texts.some((t) => /click, or press space|go on|begin the year/i.test(t))
    if (held) { await page.mouse.click(683, 640); continue }
    /* AND A WATCHED CROSSING IS NOT TWENTY WASTED CLICKS. `movie` means the
     * bars are up and every control on the glass is gone on purpose, so this
     * waits it out rather than spending its sea budget on a cutscene. */
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
      /* THE LOUDEST THING REFUSED TWICE. A card whose biggest control cannot be
       * used is the law-1 failure this script exists to find, so it is RECORDED
       * and then stepped around, rather than ending the run: one such card early
       * would hide every one after it. */
      /* THE NEXT LOUDEST ONE NOBODY HAS TRIED ON THIS CARD. Taking the smallest
       * instead put the run in a loop on the wardrobe, where a dozen colour
       * swatches sit under one locked row: it pressed a swatch, the locked row
       * was loudest again, and around forever. `tried` is cleared when the card
       * changes, which is what the heading is watched for. */
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

  /* NO CONTROL AT ALL. Either somebody is talking, or the student is standing on
   * a map. The box first, because a line holds the world; then the ground. */
  const talking = v.texts.some((t) => /click, or press space|go on|begin the year/i.test(t))
  if (talking) { await page.mouse.click(683, 640); continue }
  if (v.map) {
    if (v.map.map !== onMap) {
      onMap = v.map.map
      say(`ashore on ${onMap} at ${v.map.x},${v.map.y} · the game is pointing at ${v.map.guide ?? 'nothing'}`)
      await shot('ashore-' + onMap)
      stillFor = 0; wasAt = `${v.map.x},${v.map.y}`
    }
    /* HE IS ON A MAP AND THE ONE LIT THING IS WHAT THE GAME WANTS. If pressing it
     * moves him nowhere for long enough, the map itself is the dead end: that is
     * how the first sweep found the published hub landing a student in a sealed
     * pocket with no route to its only door. */
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
  /* A CARD THAT IS STILL TYPING ITSELF OUT has no control on it and is not
   * "talking" in the dialogue sense: the whole card is the button, and pressing
   * it finishes the line. A dimwit presses the middle of the screen. Three
   * tries, so a genuinely dead screen still ends the run. */
  /* A COVER IS THE GAME WORKING. Every door in the game plays a painted one
   * since 2026-09-07, and a painted cover holds for the best part of four
   * seconds by design, which is longer than three blind clicks. A run that
   * gives up in the middle of one is measuring the harness. It is still
   * BOUNDED: the step budget above ends the run either way, and a cover that
   * never lifts ends it with a picture of itself. */
  if (v.covered) { blind = 0; await page.waitForTimeout(700); continue }
  /* AND SO ARE THE BARS. A watched stretch is the game working exactly as much
   * as a cover is: the beach crossing is half a minute of a boat sailing with
   * the controls held and nothing on the glass to press. Twelve blind clicks go
   * by in about two seconds, so without this the run reported the live deploy as
   * a dead end in the middle of the opening voyage. Measured 2026-09-08. */
  if (await page.evaluate(() => document.documentElement.dataset.movie === '1')) {
    blind = 0
    await page.waitForTimeout(900)
    continue
  }
  /* AND EIGHT SECONDS RATHER THAN TWO. Three tries was written when the only
   * thing that could be under a blind click was a card still typing itself out.
   * A map swap can put a real loading frame on the glass for a second or two on
   * a cold cache, and a run that calls that a dead end is a run that reports the
   * game as broken because the game was busy. Eight seconds of nothing is still
   * a dead end and still ends the run with a picture of it. */
  if (blind++ < 12) { await page.mouse.click(683, 384); continue }
  say('STOP: nothing on the screen is pressable and nothing is talking')
  await shot('nothing')
  break
}

if (!done) {
  /* ALWAYS SAY WHERE IT ENDED. A run that stops without a reason is a run nobody
   * can act on, and the loop can run out of steps in the middle of anything. */
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
