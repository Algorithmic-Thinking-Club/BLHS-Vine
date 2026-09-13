/* GROUND TRUTH FOR THE FAULTS ASH LISTED, measured rather than reasoned about.
 *
 *   node scripts/repro-brief.mjs --only=sail-chain
 *
 * Nothing here asserts. It walks the road he walked and prints what the engine
 * says at each moment, with a screenshot per moment, so a fix has a before to be
 * measured against. Sections: docking, sail-chain, atc-cutscene, arrival-card.
 */
import { boot, STAMPED, LIVE } from './play-harness.mjs'

const live = process.argv.includes('--live')
const base = live ? LIVE : 'http://localhost:5173'
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)

const snap = (page) => page.evaluate(() => {
  const p = window.__pmap
  if (!p) return { noScene: true }
  const s = {
    map: p.map?.map ?? null, hull: !!p.map?.hull, movie: p.movie, framing: p.framing,
    camZ: +(p.camZ ?? 0).toFixed(2), guide: p.guide, objective: p.objective,
    sailing: p.sailing, voyage: p.voyage ?? null, berthing: p.berthing,
    walkLabel: p.map?.walkLabel ?? null, driven: p.driven,
  }
  const el = (q) => {
    const e = document.querySelector(q)
    if (!e) return null
    const b = e.getBoundingClientRect()
    return {
      x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      text: (e.textContent || '').trim().slice(0, 60),
    }
  }
  s.dom = {
    bars: document.querySelectorAll('.cs-bar, .pm-bar, [class*="letterbox"]').length,
    card: el('.pm-card, .arrive-card, [class*="arriv"]'),
    pill: el('[class*="pill"]'),
  }
  return s
})

const run = async (name, fn) => {
  if (only && only !== name) return
  console.log('\n======== ' + name + ' ========')
  await fn()
}

/* ---- 1. the intro sail into the hub, and how she docks --------------------- */
await run('docking', async () => {
  const h = await boot('repro-dock', {
    url: base + '/?scene=pmap&deep=1&map=hub', save: STAMPED(),
    dir: 'reference/_archive/build-shots/repro/dock',
  })
  const { page, shot, finish } = h
  await page.waitForTimeout(2500)
  const world = await page.evaluate(async () => {
    const r = await fetch('https://mapvis-next.vercel.app/api/v1/world').catch(() => null)
    if (!r || !r.ok) return { error: r ? r.status : 'no answer' }
    const w = await r.json()
    return {
      marks: (w.marks ?? []).map((m) => ({ name: m.name, kind: m.kind, island: m.island, heading: m.heading, facing: m.facing, x: m.x, y: m.y })),
      slots: (w.slots ?? []).map((s) => ({ map: s.map, place: s.place, berth: s.berth })),
    }
  })
  console.log('  THE AUTHORED OCEAN: ' + JSON.stringify(world).slice(0, 1500))
  await shot('01-hub')
  await finish()
})

/* ---- 2 to 4. the year sheet, the button, the teleport and the bars --------- */
await run('sail-chain', async () => {
  const save = (() => {
    const s = STAMPED()
    s.completions = [{ programme: 'football', year: 1, grade: 3, at: 1, attempts: 1, firstGrade: 3 }]
    s.flags = [...s.flags, 'maw:railed', 'maw:handed_over']
    return s
  })()
  const h = await boot('repro-sail', {
    url: base + '/?scene=pmap&deep=1&map=panther-maw', save,
    dir: 'reference/_archive/build-shots/repro/sail',
  })
  const { page, shot, look, finish } = h
  await page.waitForTimeout(6000)
  console.log('  in the maw: ' + JSON.stringify(await snap(page)))
  await page.evaluate(() => window.__intent({ kind: 'open', ui: 'planner' }))
  await page.waitForTimeout(2500)
  await shot('01-year-sheet')
  const btn = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].filter((b) => /Sail (to|there)/i.test(b.textContent || ''))
    return all.map((b) => {
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      return {
        text: (b.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height),
        scrollW: b.scrollWidth, clientW: b.clientWidth, overflowing: b.scrollWidth > b.clientWidth + 1,
        whiteSpace: cs.whiteSpace, overflow: cs.overflow, textOverflow: cs.textOverflow,
        maxWidth: cs.maxWidth, padding: cs.padding, fontSize: cs.fontSize, cls: b.className,
      }
    })
  })
  console.log('  THE SAIL BUTTON: ' + JSON.stringify(btn, null, 1))
  const v = await look()
  const sail = v.press.find((e) => /Sail (to|there)/i.test(e.text))
  if (!sail) { console.log('  no sail button found'); await finish(); return }
  await page.mouse.click(sail.box.x + sail.box.w / 2, sail.box.y + sail.box.h / 2)
  for (let i = 0; i < 80; i++) {
    const s = await snap(page)
    if (i % 4 === 0) console.log('  t+' + (i * 0.25).toFixed(1) + 's ' + JSON.stringify(s))
    if (i === 8) await shot('02-just-after-go')
    if (i === 20) await shot('03-five-seconds')
    await page.waitForTimeout(250)
  }
  await shot('04-twenty-seconds')
  await finish()
})

/* ---- 9. the ATC island own cutscene --------------------------------------- */
await run('atc-cutscene', async () => {
  const h = await boot('repro-atc', {
    url: base + '/?scene=pmap&deep=1&map=atc-1', save: STAMPED(),
    dir: 'reference/_archive/build-shots/repro/atc',
  })
  const { page, shot, look, finish } = h
  await page.waitForTimeout(6500)
  console.log('  on arrival: ' + JSON.stringify(await snap(page)))
  await shot('01-arrived')
  await page.evaluate(() => window.__station('host'))
  for (let i = 0; i < 70; i++) {
    const s = await snap(page)
    if (i % 5 === 0) console.log('  t+' + (i * 0.3).toFixed(1) + 's ' + JSON.stringify(s))
    const v = await look()
    if (v.press.some((e) => /^RUN$/i.test(e.text))) {
      console.log('  the screen is up at t+' + (i * 0.3).toFixed(1))
      await shot('02-the-screen')
      break
    }
    const sure = v.press.find((e) => /(^|\s)Sure$/i.test(e.text))
    if (sure) await page.mouse.click(sure.box.x + sure.box.w / 2, sure.box.y + sure.box.h / 2)
    else await page.mouse.click(683, 640)
    await page.waitForTimeout(300)
  }
  console.log('  with the screen up: ' + JSON.stringify(await snap(page)))
  await finish()
})

/* ---- 15. the arrival card against the guide pill -------------------------- */
await run('arrival-card', async () => {
  const h = await boot('repro-card', {
    url: base + '/?scene=pmap&deep=1&map=panther-maw', save: STAMPED(), clearSeen: false,
    dir: 'reference/_archive/build-shots/repro/card',
  })
  const { page, shot, finish } = h
  await page.waitForTimeout(4000)
  const boxes = await page.evaluate(() => {
    const out = []
    for (const e of document.querySelectorAll('body *')) {
      const t = (e.textContent || '').trim()
      if (!t || t.length > 60) continue
      const r = e.getBoundingClientRect()
      if (r.width < 20 || r.height < 10 || r.top > 260) continue
      const cs = getComputedStyle(e)
      if (cs.position === 'static') continue
      out.push({
        text: t.slice(0, 40), cls: e.className.toString().slice(0, 40),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), z: cs.zIndex,
      })
    }
    return out
  })
  console.log('  EVERYTHING IN THE TOP STRIP: ' + JSON.stringify(boxes, null, 1))
  await shot('01-top-strip')
  await finish()
})

console.log('\ndone')
