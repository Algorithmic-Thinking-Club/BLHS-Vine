/* the road filmed: a cold run from the title to the end pressing only what looks like the way on, clicks and never a key, with a frame and a state dump per step so the filmstrip shows what a first time player saw. It asserts nothing and is not a gate, dimwit.mjs is. Flags: --base --view --skin --out --steps --headed. */
import { boot, LIVE } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)

const base = arg('base', 'http://localhost:5173')
if (/vercel.app/.test(base) && !process.argv.includes('--live')) { console.error('refusing the live url without --live: proofs run on the dev server, one live run per deploy'); process.exit(2) }
const skin = arg('skin', '')
const steps = +arg('steps', '90')
const vm = /^(\d{3,5})x(\d{3,5})$/.exec(arg('view', '1366x768'))
if (!vm) { console.error('--view wants WIDTHxHEIGHT'); process.exit(2) }
const view = { width: +vm[1], height: +vm[2] }
const out = arg('out', `road-${skin || 'game'}-${view.width}x${view.height}`)

/* a way backwards is not the way on, and neither is the furniture that is always on the glass, the corner, the help plaque and the objective bar, which look() marks for us */
const BACKWARD = /^back$|^close$|skip|quit|settings|back to the|back to my|leave this|save and leave/i

/* the real front door is the boot splash and not the title, because a cold player never types a scene id and the splash is the first frame either arm shows */
const url = `${base}/${skin ? `?skin=${skin}` : ''}`
const h = await boot('road', { save: null, url, headed: has('headed'), view, dir: `reference/_archive/build-shots/${out}` })

h.say(`the road, cold, ${view.width}x${view.height}, ${skin || 'game'} arm, against ${base}`)
await h.page.waitForTimeout(4000)

let last = ''
let repeats = 0
const seen = []

for (let i = 0; i < steps; i++) {
  const v = await h.look()
  const head = (v.texts[0] || v.map?.map || 'frame').slice(0, 34)
  await h.shot(`${String(i).padStart(2, '0')}-${head}`)
  seen.push({
    i,
    map: v.map ? `${v.map.map}@${v.map.x},${v.map.y}` : null,
    panels: v.panels,
    texts: v.texts.slice(0, 10),
    press: v.press.map((e) => e.text),
  })
  h.say(`#${i} map=${v.map ? `${v.map.map}@${v.map.x},${v.map.y} z=${v.map.camZ}` : 'none'} panels=${v.panels}`)
  h.say(`   reads: ${JSON.stringify(v.texts.slice(0, 8))}`)

  const forward = v.press
    .filter((e) => !e.disabled && !BACKWARD.test(e.text))
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))

  if (!forward.length) {
    /* nothing to press: a dialogue line is advanced by clicking the box and a watched stretch is not a stall, so give both a chance before giving up */
    h.say('   nothing pressable; clicking the dialogue line')
    await h.dialogue(1, 900)
    await h.page.waitForTimeout(900)
    continue
  }

  const pick = forward[0]
  if (pick.text === last) repeats++; else { repeats = 0; last = pick.text }
  if (repeats > 4) { h.say(`   STUCK on ${JSON.stringify(pick.text)} five times running; stopping`); break }

  h.say(`   press ${JSON.stringify(pick.text)}`)
  await h.page.mouse.click(pick.box.x + pick.box.w / 2, pick.box.y + pick.box.h / 2)
  await h.page.waitForTimeout(1100)
}

await h.shot('zz-last')
const fs = await import('node:fs')
fs.writeFileSync(`${h.dir}/_road.json`, JSON.stringify(seen, null, 1))
h.say(`filmstrip in ${h.dir}`)
await h.finish()
