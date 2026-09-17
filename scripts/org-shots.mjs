/* the two pictures the organisation front page shows, taken off the live deploy at 1366x768:
 * the hub at the walking zoom, and the Panther's Maw on the first line of its opening.
 *
 *   node scripts/org-shots.mjs --out=C:/Users/ashcy/atc-profile/profile/screenshots
 *
 * Both come from a real browser playing the deployed game, never from a mock and never from
 * an editor. A run that cannot reach either moment fails rather than writing a half picture,
 * because a front page carrying a shot of a loading screen reads as a finished game.
 */
import fs from 'node:fs'
import path from 'node:path'
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = (arg('base', LIVE)).replace(/\/$/, '')
const out = path.resolve(arg('out', 'reference/_archive/build-shots/org-shots'))
fs.mkdirSync(out, { recursive: true })

const VIEW = { width: 1366, height: 768 }
const readings = (page) => page.evaluate(() => ({
  map: window.__pmap?.map ?? null,
  z: Number((window.__pmap?.camZ ?? 0).toFixed(2)),
  at: window.__pmap ? `${Math.round(window.__pmap.x)},${Math.round(window.__pmap.y)}` : null,
  line: document.querySelector('.cs-dialogue-text')?.textContent?.trim() ?? '',
}))

/* the browser's own log goes to this repo's shot tree, never beside the two pictures: `out`
 * is a directory somebody publishes, and a run log committed next to a front page is litter */
const logDir = path.resolve('reference/_archive/build-shots/org-shots')

const open = async (name, save, url) => {
  const h = await boot(name, { save, dir: path.join(logDir, name), view: VIEW })
  await h.go(url)
  return h
}

/* ---------------------------------------------------------------- the hub --
 * `hub:crossed` is the flag the hub's own island writes at the top of the tunnel, so a save
 * carrying it skips the arrival film and hands the player the controls on the first frame.
 * That is the walking zoom: the free camera a student moves around in, not the close shot
 * the film ends on and not the wide one it opens with.
 */
{
  const save = STAMPED()
  save.flags = [...save.flags, 'hub:crossed', 'maw:railed', 'maw:handed_over']
  const { page, say, finish } = await open('hub', save, `${base}/?scene=pmap&deep=1&map=hub`)
  await page.waitForTimeout(9000)

  /* the square below the tunnel mouth, where the market, the waterfalls and the gate into
   * the mountain are all in one frame */
  const landed = await page.evaluate(() => window.__warp(360, 440))
  if (!/^ok/.test(String(landed))) throw new Error(`the hub would not take the standing spot: ${landed}`)
  await page.waitForTimeout(2500)

  const v = await readings(page)
  say(`hub ${JSON.stringify(v)}`)
  if (v.z > 4) throw new Error(`the camera is at ${v.z}, which is a film's shot and not the walking zoom`)
  await page.screenshot({ path: path.join(out, 'hub.png') })
  await finish()
}

/* --------------------------------------------------------------- the Maw --
 * dropping every `maw:` flag makes the room play its founding film from the top, and the
 * first line the principal says is the one the front page carries.
 */
{
  const save = STAMPED()
  save.flags = save.flags.filter((f) => !f.startsWith('maw:'))
  const { page, say, finish } = await open('maw', save, `${base}/?scene=pmap&deep=1&map=panther-maw`)
  /* the first gesture, because a browser holds its sound until one has happened */
  await page.mouse.click(683, 740)
  await page.waitForFunction(
    () => /Welcome to Bonney Lake High/.test(document.querySelector('.cs-dialogue-text')?.textContent ?? ''),
    null, { timeout: 90000 },
  )
  /* the hint only shows once the line has finished typing itself out, so waiting on it is
   * what keeps the picture off a half written sentence */
  await page.waitForSelector('.cs-continue-hint', { timeout: 15000 })
  await page.waitForTimeout(600)

  const v = await readings(page)
  say(`maw ${JSON.stringify(v)}`)
  await page.screenshot({ path: path.join(out, 'maw.png') })
  await finish()
}

for (const f of ['hub.png', 'maw.png']) {
  const { size } = fs.statSync(path.join(out, f))
  console.log(`${f}  ${(size / 1024).toFixed(0)} KB`)
}
console.log(`wrote to ${out}`)
