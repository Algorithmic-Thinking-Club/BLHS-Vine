/* the seeded harness: one boot per scenario, a numbered shot per call, console and page errors kept with a clock, and the same look() dimwit uses */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

export const LIVE = 'https://blhs-island-explorer.vercel.app'
export const ROOT = 'C:/Users/ashcy/AdventureGame/reference/_archive/build-shots/pass2/bugs'

export const BASE = () => ({
  v: 2, id: 'r_p2', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel', year: 1, season: 'Fall',
  beat: 'maw:arrive', introDone: true, arm: 'game', plans: {}, flags: ['read_the_bottle'],
  tokens: ['Fall', 'Winter', 'Spring'], ledger: [], ranks: {}, islands: {},
  exposure: [{ place: 'home-island', docked: true }], completions: [], stickers: [], facts: ['the_bottle'],
  badges: [], savedAt: 1,
})
export const STAMPED = () => {
  const s = BASE()
  s.plans = { 1: { slots: { Fall: 'football', Winter: 'atc' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } }
  s.flags = [...s.flags, 'chart:granted', 'handbook:granted', 'maw:founding', 'vignette:y1']
  s.tokens = ['Spring']
  return s
}
export const CLOSABLE = () => {
  const s = STAMPED()
  s.season = 'Spring'; s.tokens = []
  s.plans[1].slots.Spring = 'key-club'
  s.ledger = [
    { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 1, grade: 3.2, year: 1, season: 'Fall' },
    { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 1, grade: 3.9, year: 1, season: 'Winter' },
  ]
  return s
}

export async function boot(name, { save, url, headed = false, clearSeen = true, dir: where, view, args } = {}) {
  /* `dir` lets a run put its frames somewhere other than the default tree, and a caller that passes nothing lands exactly where it always did */
  const dir = where ? path.resolve(where) : path.join(ROOT, name)
  fs.mkdirSync(dir, { recursive: true })
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f))
  /* headless chromium draws with swiftshader, a cpu rasteriser, unless it is told to
   * use the real gpu. a run that does not pass args is measuring software rendering. */
  const browser = await chromium.launch({ headless: !headed, ...(args ? { args } : {}) })
  const ctx = await browser.newContext({ viewport: view ?? { width: 1366, height: 768 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const t0 = Date.now()
  const log = []
  const say = (s) => { const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`; log.push(line); console.log(line) }
  page.on('pageerror', (e) => say(`PAGEERROR ${String(e).slice(0, 400)}`))
  page.on('response', (r) => { if (r.status() >= 400) say(`HTTP ${r.status()} ${r.url().slice(0, 160)}`) })
  page.on('requestfailed', (r) => say(`REQFAIL ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ''}`))
  page.on('console', (m) => {
    const ty = m.type()
    if (ty === 'error' || ty === 'warning') say(`CONSOLE.${ty} ${m.text().slice(0, 400)}`)
  })
  await page.addInitScript(({ save, clearSeen }) => {
    try {
      /* seed ONCE per tab: a reload must keep whatever the game wrote since */
      if (sessionStorage.getItem('p2_seeded')) return
      localStorage.clear()
      if (clearSeen) sessionStorage.clear()
      if (save) localStorage.setItem('blhs_save_v2', JSON.stringify(save))
      sessionStorage.setItem('p2_seeded', '1')
    } catch {}
  }, { save: save ?? null, clearSeen })
  let n = 0
  const shot = async (label) => {
    const f = path.join(dir, `${String(++n).padStart(2, '0')}-${label.replace(/\W+/g, '-').slice(0, 48)}.png`)
    await page.screenshot({ path: f })
    say(`shot ${path.basename(f)}`)
    return f
  }
  const look = () => page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
        && +s.opacity > 0.02 && r.top < innerHeight && r.left < innerWidth && r.bottom > 0 && r.right > 0
    }
    const press = []
    for (const el of document.querySelectorAll('button, a, [role="button"]')) {
      if (!vis(el)) continue
      const r = el.getBoundingClientRect()
      press.push({
        text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
        /* chrome is never the way on: the corner, the help plaque and the objective bar sit always on the glass and never advance the game, and a run that pressed the loudest button opened and closed the task sheet for four and a half minutes standing at a door it never took */
        chrome: !!el.closest('.ob-wrap, .hud-stack, .hp-btn, .hud-help'),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      })
    }
    const texts = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length || !vis(el)) continue
      const t = (el.innerText || '').trim().replace(/\s+/g, ' ')
      if (t) texts.push(t.slice(0, 200))
    }
    const p = window.__pmap
    const save = (() => { try { return JSON.parse(localStorage.getItem('blhs_save_v2') || 'null') } catch { return null } })()
    return {
      press: press.filter((e) => e.text && !e.chrome),
      texts: [...new Set(texts)],
      map: p ? { map: p.map, x: Math.round(p.x), y: Math.round(p.y), facing: p.facing, hull: !!p.hull, guide: p.guide, lit: p.lit, walkLabel: p.walkLabel, camZ: p.camZ, prompt: p.prompt, travel: p.travel } : null,
      save: save ? { year: save.year, season: save.season, beat: save.beat, flags: save.flags, tokens: save.tokens, plans: save.plans, ledger: save.ledger, where: save.where } : null,
      panels: document.documentElement.getAttribute('data-panels'),
      skin: document.documentElement.getAttribute('data-skin'),
    }
  })
  const state = async (label) => {
    const v = await look()
    say(`${label ?? 'state'}: map=${v.map ? `${v.map.map}@${v.map.x},${v.map.y} hull=${v.map.hull} guide=${v.map.guide} lit=${v.map.lit ? `${Math.round(v.map.lit.at.x)},${Math.round(v.map.lit.at.y)}` : null} walk=${v.map.walkLabel} z=${v.map.camZ}` : 'none'} panels=${v.panels}`)
    if (v.map) say(`  world: prompt=${JSON.stringify(v.map.prompt)} travel=${JSON.stringify(v.map.travel)}`)
    say(`  texts: ${JSON.stringify(v.texts.slice(0, 14))}`)
    say(`  press: ${JSON.stringify(v.press.map((e) => `${e.text}${e.disabled ? '(off)' : ''}@${e.box.x},${e.box.y} ${e.box.w}x${e.box.h}`))}`)
    if (v.save) say(`  save: y${v.save.year} ${v.save.season} beat=${v.save.beat} tokens=${JSON.stringify(v.save.tokens)} flags=${JSON.stringify(v.save.flags)} plans=${JSON.stringify(v.save.plans)} ledger=${(v.save.ledger || []).map((e) => e.id).join(',')}`)
    return v
  }
  const pressText = async (re, { which = 0 } = {}) => {
    const v = await look()
    const hits = v.press.filter((e) => re.test(e.text))
    const e = hits[which]
    if (!e) { say(`NO BUTTON matching ${re} on the glass; have ${JSON.stringify(v.press.map((x) => x.text))}`); return false }
    say(`press ${JSON.stringify(e.text)} @ ${e.box.x + e.box.w / 2},${e.box.y + e.box.h / 2}${e.disabled ? ' (disabled)' : ''}`)
    await page.mouse.click(e.box.x + e.box.w / 2, e.box.y + e.box.h / 2)
    return true
  }
  const until = async (pred, { ms = 15000, every = 200 } = {}) => {
    const t = Date.now()
    while (Date.now() - t < ms) {
      const v = await look()
      if (pred(v)) return v
      await page.waitForTimeout(every)
    }
    say(`TIMEOUT waiting ${ms}ms`)
    return await look()
  }
  const timeline = async (label, secs, every = 400) => {
    const t = Date.now()
    let k = 0
    while (Date.now() - t < secs * 1000) {
      const v = await look()
      const head = v.texts.slice(0, 3).join(' | ')
      await shot(`${label}-t${((Date.now() - t) / 1000).toFixed(1)}-${head.slice(0, 30)}`)
      say(`  t=${((Date.now() - t) / 1000).toFixed(1)}s map=${v.map ? `${v.map.map}@${v.map.x},${v.map.y} z=${v.map.camZ} guide=${v.map.guide}` : 'none'} panels=${v.panels} texts=${JSON.stringify(v.texts.slice(0, 5))} press=${JSON.stringify(v.press.map((e) => e.text).slice(0, 5))}`)
      await page.waitForTimeout(every)
      k++
    }
  }
  const dialogue = async (times = 1, gap = 700) => {
    for (let i = 0; i < times; i++) { await page.mouse.click(683, 640); await page.waitForTimeout(gap) }
  }
  const finish = async () => {
    fs.writeFileSync(path.join(dir, '_log.txt'), log.join('\n'))
    await browser.close()
  }
  const go = async (u) => { say(`goto ${u}`); await page.goto(u ?? url ?? LIVE, { waitUntil: 'domcontentloaded' }) }
  if (url) await go(url)
  return { browser, page, dir, say, shot, look, state, pressText, until, timeline, dialogue, finish, go, log }
}
