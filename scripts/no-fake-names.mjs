/* no fake real name on any surface: every string surface is opened against a save holding `football` in the fall slot and `atc` in the winter slot, and the run reads each page instead of only photographing it, so any listed name on screen fails. node scripts/no-fake-names.mjs [--base=http://localhost:5173] */
import { boot, LIVE, CLOSABLE } from './play-harness.mjs'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const base = arg('base', LIVE)
const headed = process.argv.includes('--headed')

/* the three named picks, a pick being a thing the schedule offers with no island behind it; atc came off this list once it had a painting, a berth, a Python island and a playable roster row, and the three sports stay because nobody has built them */
const FAKE = ['Football', 'Girls Flag Football', 'Track and Field']

/* the navy Key Club cord is not a pick: it is on the school's published awards table in `docs/blhs/awards.md` and printed on the Cords page, so masking it would print a false thing about a real award, and it is reported by name every run instead */
const AWARDS = ['Key Club']

const save = CLOSABLE()
const h = await boot('no-fake-names', {
  save,
  url: `${base}/?scene=pmap&deep=1&map=panther-maw`,
  headed,
  dir: arg('dir', 'reference/_archive/build-shots/no-fake-names'),
})
const { page, say, shot, finish } = h

const bad = []

/** every visible word on the page, as one string */
const words = () => page.evaluate(() => {
  const out = []
  const walk = (el) => {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.05) return
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t) }
      else if (n.nodeType === 1) walk(n)
    }
  }
  walk(document.body)
  return out.join(' | ')
})

const check = async (label) => {
  await page.waitForTimeout(700)
  const f = await shot(label)
  const said = await words()
  const hits = FAKE.filter((n) => said.includes(n))
  /* the club credit is not a pick: "Algorithmic Thinking Club presents" on the boot card and "made by the Algorithmic Thinking Club" on the title name the club that really made the game, the one place the name is true */
  const real = hits.filter((n) => !(n === 'Algorithmic Thinking Club'
    && /presents|made by/.test(said)))
  const awards = AWARDS.filter((n) => said.includes(n))
  if (real.length) {
    bad.push(`${label}: ${real.join(', ')}`)
    say(`  *** ${label} says ${real.join(', ')}`)
  } else {
    say(`  ${label}: clean (${f.split(/[\\/]/).pop()})`
      + (awards.length ? ` · names the school's own award "${awards.join('", "')}"` : ''))
  }
}

await page.waitForFunction(() => !!window.__pmap, null, { timeout: 30000 })
await page.waitForTimeout(1200)

/* the world itself, with the objective line over it */
await check('01-the-world')

/* the panels are raised by name through the same bus an island uses, so this opens what the game opens rather than a component in a harness */
for (const [ui, label] of [
  ['planner', '02-my-year-the-sheet'],
  ['wall', '03-the-trophy-wall'],
  ['handbook', '04-the-guide'],
  ['yearbook', '05-the-yearbook'],
  ['chart', '06-the-map'],
]) {
  await page.evaluate((u) => window.dispatchEvent(new CustomEvent('blhs:open-ui', { detail: { ui: u } })), ui)
  await page.waitForTimeout(900)
  await check(label)
  /* the Guide has pages, and the one that lists clubs by name is the one this checks */
  if (ui === 'handbook') {
    for (const tab of ['Islands', 'Cords', 'Facts']) {
      const b = page.locator(`button:has-text("${tab}")`).first()
      if (await b.count()) {
        await b.click().catch(() => {})
        await page.waitForTimeout(500)
        await check(`04-the-guide-${tab.toLowerCase()}`)
      }
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

say(bad.length ? `FAIL: ${bad.length} surface(s) print a fake real name` : 'PASS: no fake real name on any surface')
for (const b of bad) say(`  ${b}`)
await finish()
process.exit(bad.length ? 1 : 0)
