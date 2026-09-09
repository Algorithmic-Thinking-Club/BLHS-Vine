/* EVERY SURFACE IN THE GAME, PHOTOGRAPHED, SO A PERSON CAN JUDGE IT.
 *
 * Ash, 2026-08-31, after looking at a folder of pictures: "everything is complete
 * slop right now. its complete broken slop." The order that followed is one job,
 * make the game LOOK right, worked surface by surface, and it begins with this:
 * capture every surface as it is TODAY and say what is wrong with each one before
 * changing anything.
 *
 * So this is not a proof and it asserts nothing. It opens each surface, waits for
 * it to stop moving, and writes a picture. The gate is his eyes.
 *
 *   node scripts/surfaces.mjs                    every surface, the shipped skin
 *   node scripts/surfaces.mjs --plain            the study's control arm
 *   node scripts/surfaces.mjs --nokit            with the platform kit taken off
 *   node scripts/surfaces.mjs --only=planner,hub just those
 *   node scripts/surfaces.mjs --out=after        somewhere else, for a before/after
 *   node scripts/surfaces.mjs --chromebook       1366x768, the deployment target
 *
 * The dev server must be pointed at the platform (VITE_MAPVIS_URL) for the real
 * hub and the real kit; the run says so if either did not come down.
 *
 * ---- THREE OF THE NINETEEN WERE PHOTOGRAPHING THE BOOT SPLASH ---------------
 *
 * Found on 2026-09-01 by opening the pictures rather than by reading the notes.
 * `17-year-start`, `18-graduation` and `19-beat` all came back as the ATC logo on
 * a dark field, with identical `facts` blocks, because `?scene=yearstart`,
 * `?scene=graduation` and `?scene=beat` ARE NOT SCENES. `src/App.tsx`'s registry
 * has boot, title, beach, teacher and the map loaders, and its own comment says
 * an unknown scene id "lands on boot, never on a ghost scene". So the harness
 * asked for three things that do not exist, got the boot splash three times, and
 * wrote three pictures that said the surfaces were fine.
 *
 * A capture harness that lies is worse than no capture harness, because the whole
 * point of it is that somebody can judge without running the game.
 *
 * All three are REACHABLE, just not by a URL. They are panels the HUD mounts, so
 * they open the way the game opens them: the yearbook and the beat through the
 * ui-bus that a station or a member's Python already uses, and graduation through
 * the pause sheet on a graduated run. Every one of those is a real path a student
 * takes, which makes these pictures worth more than the URLs would have been.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const has = (k) => process.argv.includes(`--${k}`)
const base = (arg('base', 'http://localhost:5173')).replace(/\/$/, '')
const OUT = path.join('reference/_archive/build-shots', arg('out', has('plain') ? 'surfaces-plain' : 'surfaces'))
const only = arg('only', '').split(',').filter(Boolean)
/* the window the shots are taken in. `--chromebook` is the deployment target;
 * `--view=1280x720` is any other size. The default is wider and taller than the
 * machine this game is played on, so a review at the default proves less. */
const VIEW = (() => {
  const v = arg('view', '')
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(v)
  if (m) return { width: +m[1], height: +m[2] }
  if (v) { console.error(`--view wants WIDTHxHEIGHT, got "${v}"`); process.exit(2) }
  return has('chromebook') ? { width: 1366, height: 768 } : { width: 1280, height: 800 }
})()
fs.mkdirSync(OUT, { recursive: true })

/* A RUN WITH SOMETHING IN IT. An empty save photographs empty panels, and an
 * empty panel says nothing about whether a panel is any good: the year sheet with
 * no plan, the transcript with no rows and the yearbook with no year are three
 * pictures of the same blank card. This is a student most of the way through year
 * one, which is the state nearly every panel is really read in. */
const SAVE = {
  v: 2, id: 'r_look', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Spring', beat: 'maw:arrive', introDone: true,
  arm: has('plain') ? 'plain' : 'game',
  plans: {}, flags: ['read_the_bottle', 'chart:granted', 'handbook:granted', 'vignette:y1'],
  tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {},
  exposure: [{ place: 'home-island', docked: true }],
  completions: [],
  stickers: [], facts: ['the_bottle'], badges: [],
  savedAt: Date.now(),
}

/* the same run four years on, for the two surfaces only a finished run can show.
 * A graduation card photographed off an unfinished run is a picture of a refusal. */
const GRADUATE = {
  ...SAVE,
  year: 4, season: 'Spring', graduated: true,
  flags: [...SAVE.flags, 'vignette:y2', 'vignette:y3', 'vignette:y4', 'yearbook:y1', 'yearbook:y2', 'yearbook:y3'],
  ledger: [
    { id: 'core:y1', kind: 'core', title: 'Advisory', grade: 3.6, year: 1, season: 'Fall' },
    { id: 'class:ap-lang', kind: 'class', title: 'AP Language', grade: 3.9, year: 2, season: 'Winter' },
    { id: 'class:ap-calc', kind: 'class', title: 'AP Calculus AB', grade: 3.2, year: 3, season: 'Spring' },
  ],
  facts: ['the_bottle', 'power_values', 'bell_schedule'],
  tokens: [],
}

/* and a run that has NOT started, for the title's other state and for the join
 * cards, which are the first two minutes of the game and were never captured */
const FRESH = null

const q = (extra = '') => `${has('nokit') ? '&kit=0' : ''}${has('plain') ? '&skin=plain' : ''}${extra}`

/* Each surface: a name, the url it lives at, and how to open it once the page is
 * up. `settle` is how long the thing needs to stop moving, per surface, because a
 * panel entrance is 300ms and a map load with an arrival card is seconds.
 *
 * `save` overrides the run for that one shot. `ui` opens a panel through the same
 * bus a station uses. `open` is anything else. */
const HUB = () => `${base}/?scene=pmap&deep=1&map=hub${q()}`

const SURFACES = [
  { name: '01-title', url: () => `${base}/?scene=title${q()}`, settle: 2200, fresh: true },
  { name: '01b-title-cold', url: () => `${base}/?scene=title${q()}`, settle: 2200, fresh: true, save: FRESH },
  /* THE HUD AT REST, which is what brief item 3 asks for and what a settle of
   * 3000 could not photograph: the arrival card dwells for 3.2 seconds, so every
   * "hub walking" shot ever taken was a shot of the arrival card. Past it, the
   * standing task line is the only text on the screen, which is the whole of
   * Ash's non-reader law in one picture. */
  { name: '02-hub-walking', url: HUB, settle: 7000 },
  /* THE FIRST WORLD FRAME OF A RUN THAT HAS BEEN GRANTED NOTHING, which is what
   * BRIEF-PLAYTHROUGH-1 law 2 is about: "two buttons in a corner read as broken,
   * not as earned". The rest of this file seeds a run holding the chart flag and
   * the Handbook flag, so the corner it photographs is the finished one and the
   * state he actually met was never on film. */
  {
    name: '02d-hub-firstframe', url: HUB, settle: 7000,
    save: { ...SAVE, flags: ['vignette:y1'], tokens: [], islands: {}, exposure: [], facts: [] },
  },
  /* A YEAR WITH SEASONS ALREADY SPENT, which is every state of the corner plaque
   * except the one the rest of this file photographs. `--nokit` on this row is
   * what the spent pip's fallback is FOR, and it had never been on a screen: the
   * audit of 2026-09-02 found the fallback was opacity alone, four lines under a
   * comment forbidding exactly that, and nobody had seen it because the harness
   * only ever seeded a run with all three tokens in hand. */
  {
    name: '02c-hub-spent', url: HUB, settle: 7000,
    /* every season gone, which is the ONE state that draws the spent pip: the
     * corner counts what is left, so the ghost only appears at zero */
    save: { ...SAVE, tokens: [] },
  },
  /* BRIEF ITEM 3b, the card a teacher points at. It opens from the corner, which
   * is the road a lost student takes, rather than from the pause sheet, which is
   * the road a student who already knows Escape takes. */
  {
    name: '02b-help', url: HUB, settle: 7000,
    open: async (p) => { await p.click('.hp-btn', { timeout: 5000 }).catch(() => {}) },
    wait: '.hp-card',
  },
  { name: '03-hub-arrival-card', url: HUB, settle: 900, fresh: true },
  { name: '04-maw-room', url: () => `${base}/?scene=pmap&deep=1&map=panther-maw&src=local${q()}`, settle: 3000 },
  { name: '05-beach-intro', url: () => `${base}/?scene=beach${q()}`, settle: 4000, fresh: true },
  /* THE JOIN CARDS, WHICH ARE THE FIRST TWO MINUTES OF THE GAME AND HAD NEVER
   * BEEN PHOTOGRAPHED. They live on the beach behind a run that has not joined,
   * which is why a harness seeded with a finished save could never see them. */
  {
    name: '05b-join-code', url: () => `${base}/?scene=beach${q()}`, settle: 5000, fresh: true, save: FRESH,
    open: async (p) => {
      /* the intro's own skip, which §2's preamble says "jumps to the next
       * required interaction rather than to the end", and the join can never be
       * skipped past. So pressing it is the shortest honest road to the card. */
      for (let i = 0; i < 4; i++) {
        if (await p.$('.i3-card, .i3-codebox')) break
        await p.click('.cs-skip', { timeout: 2500 }).catch(() => {})
        await p.waitForTimeout(1200)
      }
      await p.waitForTimeout(1400)
      /* the letter types itself and the boxes only appear when it is done; a
       * click anywhere on the card finishes it at once */
      await p.click('.i3-card', { timeout: 2500 }).catch(() => {})
      await p.waitForTimeout(900)
    },
  },
  {
    name: '06-dialogue', url: HUB, settle: 1200,
    open: async (p) => {
      p.evaluate(() => window.__intent({ kind: 'say', who: 'panthers_maw', text: 'The paper is dry, which means somebody corked it properly.' })).catch(() => {})
      await p.waitForSelector('.dlg-box', { timeout: 8000 }).catch(() => {})
    },
  },
  {
    /* PAST THE ARRIVAL CARD FIRST, which is a change in the GAME and not in this
     * harness. The dialogue queue holds every line while a card is up, which is
     * what brief item 5 asked for ("nothing speaks while an arrival card is up"),
     * so a `choose` fired at 1.2 seconds now waits its turn and the shot came
     * back as a photograph of the card with no choices anywhere in it. The
     * planks were unphotographed and the round-two fix to them unverifiable, and
     * nothing said so, which is the exact failure this file's own header is
     * about. */
    name: '07-choices', url: HUB, settle: 7000,
    open: async (p) => {
      p.evaluate(() => window.__intent({ kind: 'choose', prompt: 'Which way?', options: ['Down to the jetty', 'Back up the beach', 'Read it again'] })).catch(() => {})
      await p.waitForSelector('.dlg-choices', { timeout: 8000 }).catch(() => {})
    },
    wait: '.dlg-choices',
  },
  { name: '08-planner', url: HUB, ui: 'planner', settle: 1600 },
  /* BEAT 4 OF THE THIRTY MINUTES: the first plan, as cards. It only exists on an
   * unstamped year one, which is a state the rest of this file's save is past. */
  {
    name: '08b-pickyear', url: HUB, ui: 'planner', settle: 1600,
    save: { ...SAVE, plans: {}, tokens: ['Fall', 'Winter', 'Spring'] },
    wait: '.py-sheet',
  },
  /* AND THE SAME SCREEN WITH CHOICES ON IT, because the state that matters is the
   * one after a press: the stamp, the season the card landed in, and the button
   * that was refused becoming the button that goes. */
  {
    name: '08c-pickyear-chosen', url: HUB, ui: 'planner', settle: 1600,
    save: { ...SAVE, plans: {}, tokens: ['Fall', 'Winter', 'Spring'] },
    wait: '.py-sheet',
    open: async (p) => {
      await p.waitForSelector('.py-card', { timeout: 6000 }).catch(() => {})
      const cards = await p.$$('.py-card')
      for (const i of [0, 3]) await cards[i]?.click().catch(() => {})
      const rows = await p.$$('.py-class')
      for (const i of [0, 1]) await rows[i]?.click().catch(() => {})
      await p.waitForTimeout(400)
    },
  },
  { name: '09-handbook', url: HUB, ui: 'handbook', settle: 1600 },
  { name: '10-handbook-islands', url: HUB, ui: 'handbook', settle: 1600, click: '.hb-tab:nth-child(2), [role="tab"]:nth-child(2)' },
  { name: '11-handbook-cords', url: HUB, ui: 'handbook', settle: 1600, click: '.hb-tab:nth-child(3), [role="tab"]:nth-child(3)' },
  /* THE BADGES PAGE, which brief item 10 names ("no badge whose criterion is
   * unreachable") and which had never been photographed in any arm, so nobody
   * had seen that five of six could not be earned. */
  { name: '11b-handbook-badges', url: HUB, ui: 'handbook', settle: 1600, click: '.hb-tab:nth-child(5), [role="tab"]:nth-child(5)' },
  { name: '12-chart', url: HUB, ui: 'chart', settle: 1600 },
  /* THE TROPHY WALL, which BRIEF-YEAR-ONE reaches for in four of its eight beats.
   * Two shots, because the wall's whole job is the difference between them: the
   * empty outline that makes a student want the year, and the same wall with
   * something in it. */
  {
    name: '12b-wall-empty', url: HUB, ui: 'wall', settle: 1600,
    save: { ...SAVE, plans: { 1: { slots: { Fall: 'football', Winter: 'atc' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } }, ledger: [], completions: [] },
    wait: '.tw-sheet',
  },
  {
    name: '12c-wall-filling', url: HUB, ui: 'wall', settle: 1600,
    save: {
      ...SAVE,
      plans: { 1: { slots: { Fall: 'football', Winter: 'atc' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
      ledger: [{ id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' }],
      completions: [{ programme: 'football', year: 1, grade: 3.2, rank: 'JV', at: 1 }],
    },
    wait: '.tw-sheet',
  },
  /* BEAT 8, THE LAST SCREEN OF THE THIRTY MINUTES. The counselor's drape rides on
   * the year turn, so the harness ends a year the way a student does: open the
   * book on a year that is owed nothing, and press the button that ends it. */
  {
    name: '15c-cord-drape', url: HUB, ui: 'yearbook', settle: 1600,
    save: {
      ...SAVE,
      season: 'Spring', tokens: [],
      plans: { 1: { slots: { Fall: 'football', Winter: 'atc', Spring: 'key-club' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
      ledger: [
        { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
        { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 1, grade: 3.2, year: 1, season: 'Fall' },
        { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 1, grade: 3.9, year: 1, season: 'Winter' },
      ],
      completions: [{ programme: 'football', year: 1, grade: 3.2, rank: 'JV', at: 1 }],
    },
    open: async (p) => {
      await p.waitForSelector('.yb-page', { timeout: 8000 }).catch(() => {})
      const end = p.locator('button', { hasText: /End this year/ }).first()
      await end.click({ timeout: 5000 }).catch(() => {})
      await p.waitForTimeout(1200)
    },
    wait: '.cd-card',
  },
  { name: '13-wardrobe', url: HUB, ui: 'wardrobe', settle: 1600 },
  { name: '14-settings', url: HUB, ui: 'settings', settle: 1600 },
  { name: '15-yearbook', url: HUB, ui: 'yearbook', settle: 1600 },
  /* A YEAR THAT ACTUALLY HAPPENED. The row above photographs an empty run, which
   * is a real state and not the one beat 8 ends on: "the yearbook page turns in
   * school words", after a student has done Advisory, an island and two classes.
   * Every section of this page was unphotographed with anything in it. */
  {
    name: '15b-yearbook-full', url: HUB, ui: 'yearbook', settle: 1600,
    save: {
      ...SAVE,
      tokens: [],
      plans: { 1: { slots: { Fall: 'football', Winter: 'atc' }, classes: ['ap-human-geo', 'spanish-1'], stamped: true } },
      ledger: [
        /* CREDIT IS NOT OPTIONAL IN A LEDGER ROW. `gpaOf` divides by the sum of
         * it, so a fixture without it makes a page that lists three grades and
         * says "no GPA yet" underneath them. Caught by photographing the page. */
        { id: 'core:y1', kind: 'core', title: 'Advisory', credit: 0.5, grade: 3.6, year: 1, season: 'Fall' },
        { id: 'class:ap-human-geo', kind: 'class', title: 'AP Human Geography', credit: 1, grade: 3.2, year: 1, season: 'Fall' },
        { id: 'class:spanish-1', kind: 'class', title: 'Spanish I', credit: 1, grade: 3.9, year: 1, season: 'Winter' },
      ],
      completions: [{ programme: 'football', year: 1, grade: 3.2, rank: 'JV', at: 1 }],
      facts: ['the_bottle', 'f-power-full', 'f-monday'],
      exposure: [{ place: 'home-island', docked: true }, { place: 'stadium', docked: true }],
    },
  },
  { name: '16-pause', url: HUB, settle: 1400, open: async (p) => { await p.keyboard.press('Escape') } },
  /* ---- the three that were photographing the boot splash -------------------
   * All three go through a real door a student uses, because there is no URL. */
  {
    /* the year-start vignette fires on its own when the year has not shown it
     * yet and the world is quiet, so the run is seeded WITHOUT the flag and the
     * shot waits for the world to settle rather than asking for anything */
    name: '17-year-start', url: HUB, settle: 7000,
    save: { ...SAVE, flags: SAVE.flags.filter((f) => !f.startsWith('vignette:')) },
    wait: '.ys-wrap, .ys-card',
  },
  {
    /* the pause sheet on a graduated run carries "Walk the stage", which is the
     * path a student who has finished actually takes */
    name: '18-graduation', url: HUB, settle: 1600, save: GRADUATE,
    open: async (p) => {
      await p.keyboard.press('Escape')
      await p.waitForTimeout(600)
      const btn = p.locator('button', { hasText: /Walk the stage|diploma, again/ }).first()
      await btn.click({ timeout: 5000 }).catch(() => {})
      await p.waitForTimeout(1400)
    },
  },
  {
    /* a scored activity, asked for the way a station asks: the same `play` intent
     * a member's Python says, through the same bus */
    name: '19-beat', url: HUB, settle: 1400,
    open: async (p) => {
      p.evaluate(() => window.__intent({ kind: 'play', beat: 'core:y1' })).catch(() => {})
      await p.waitForSelector('.bt-stage, .bt-plain', { timeout: 9000 }).catch(() => {})
      await p.waitForTimeout(900)
    },
  },
  {
    /* AND THE STATE THAT MATTERS MOST IN THE WHOLE GAME: a student who has just
     * got one wrong. PLAYTEST.md script 10 step 3 is a standing instruction to
     * check it by hand ("no red buzzer, ever") and no picture of it has ever
     * existed. The click takes the LAST option on the first check, which is
     * wrong on the shipped y1 beat. */
    name: '20-beat-answered', url: HUB, settle: 1400,
    open: async (p) => {
      p.evaluate(() => window.__intent({ kind: 'play', beat: 'core:y1' })).catch(() => {})
      await p.waitForSelector('.bt-stage, .bt-plain', { timeout: 9000 }).catch(() => {})
      /* walk the say steps to the first check, then answer it */
      for (let i = 0; i < 8; i++) {
        const opt = await p.$('.bt-opt:not([disabled])')
        if (opt) break
        await p.click('.bt-stage', { timeout: 2000 }).catch(() => {})
        await p.waitForTimeout(320)
      }
      const opts = await p.$$('.bt-opt:not([disabled])')
      if (opts.length) await opts[opts.length - 1].click().catch(() => {})
      await p.waitForTimeout(1100)
    },
  },
  /* THE FRAME THAT MOVES, MID-MOVE. BRIEF-YEAR-ONE beat 5 turned the sort and the
   * ordering from grids of radio chips into a pool and a set of places, and the
   * state worth photographing is the one between: a piece held, the places lit,
   * and two already landed. */
  {
    name: '20b-beat-placing', url: HUB, settle: 1400,
    open: async (p) => {
      p.evaluate(() => window.__intent({ kind: 'play', beat: 'core:y1' })).catch(() => {})
      await p.waitForSelector('.bt-stage, .bt-plain', { timeout: 9000 }).catch(() => {})
      for (let i = 0; i < 10; i++) {
        if (await p.$('.bt-pool .bt-piece')) break
        await p.click('.bt-stage', { timeout: 2000 }).catch(() => {})
        await p.waitForTimeout(320)
      }
      /* two pieces placed, a third in the hand, which is every state this frame
       * has on one screen */
      /* BY SELECTOR, NOT BY HANDLE. A well is disabled until something is in the
       * hand, and a handle captured a moment earlier is a handle to a disabled
       * button: Playwright waits for it to become actionable, the wait is
       * swallowed by the catch, and the shot comes back with a lit board and
       * nothing on it. A selector click re-resolves and waits for enabled. */
      for (const slot of [0, 1]) {
        await p.click('.bt-pool .bt-piece', { timeout: 4000 }).catch(() => {})
        await p.waitForTimeout(200)
        await p.click(`.bt-drop-well >> nth=${slot}`, { timeout: 4000 }).catch(() => {})
        await p.waitForTimeout(240)
      }
      await p.click('.bt-pool .bt-piece', { timeout: 4000 }).catch(() => {})
      await p.waitForTimeout(500)
    },
  },
  {
    /* THE RESULT CARD, which §10.22 calls "the ending of every activity in the
     * game, so a member never designs a win screen". It is therefore the single
     * most reused screen in the whole study and had never been photographed. */
    name: '21-result', url: HUB, settle: 1400,
    open: async (p) => {
      p.evaluate(() => window.__intent({ kind: 'play', beat: 'core:y1' })).catch(() => {})
      await p.waitForSelector('.bt-stage, .bt-plain', { timeout: 9000 }).catch(() => {})
      /* walk the whole beat: answer whatever is answerable, press whatever
       * advances, until the result card is up or the budget runs out */
      for (let i = 0; i < 40; i++) {
        if (await p.$('.bt-result, .rc-card, [data-beat-phase="result"]')) break
        const opt = await p.$('.bt-opt:not([disabled])')
        if (opt) { await opt.click().catch(() => {}); await p.waitForTimeout(260); continue }
        /* A SORT IS ANSWERED ROW BY ROW. Clicking `.bt-bucket:not([disabled])`
         * finds the FIRST row's first bucket every time, so the walker filled
         * one row forever and the confirm never enabled: `21-result` came back
         * as a picture of an unanswered sort. One bucket inside each row. */
        const rows = await p.$$('.bt-sortrow')
        let assigned = false
        for (const row of rows) {
          /* only a row that has nothing on it yet, or the walker re-picks the
           * same bucket forever and the confirm never enables */
          if (await row.$('.bt-bucket[aria-pressed="true"]')) continue
          const b2 = await row.$('.bt-bucket:not([disabled])')
          if (b2) { await b2.click().catch(() => {}); assigned = true }
        }
        if (assigned) { await p.waitForTimeout(260); continue }
        const go = await p.$('.bt-go:not([disabled]), .kit-plank:not([disabled])')
        if (go) { await go.click().catch(() => {}); await p.waitForTimeout(300); continue }
        await p.click('.bt-stage', { timeout: 1500 }).catch(() => {})
        await p.waitForTimeout(240)
      }
      await p.waitForTimeout(900)
    },
  },
]

const b = await chromium.launch()
const notes = []
for (const s of SURFACES) {
  if (only.length && !only.some((o) => s.name.includes(o))) continue
  const page = await b.newPage({ viewport: VIEW })
  const bad = []
  page.on('pageerror', (e) => bad.push(`page error: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) bad.push(m.text().slice(0, 120)) })
  page.on('response', (r) => { if (r.status() >= 400 && !/api\/v1\/maps\/(panther-maw|castaway)/.test(r.url())) bad.push(`http ${r.status()} ${r.url().slice(-60)}`) })
  const run = s.save === undefined ? SAVE : s.save
  await page.addInitScript((v) => {
    if (v.save) localStorage.setItem('blhs_save_v2', JSON.stringify(v.save))
    else localStorage.removeItem('blhs_save_v2')
    if (v.fresh) sessionStorage.removeItem('blhs_seen_v1')
    else sessionStorage.setItem('blhs_seen_v1', '["hub","panther-maw"]')
  }, { save: run, fresh: !!s.fresh })

  try {
    await page.goto(s.url(), { waitUntil: 'domcontentloaded', timeout: 30000 })
    /* a painted map says when it is ready; a react screen does not, so the wait is
     * conditional on there being something to wait for */
    if (s.url().includes('scene=pmap&deep=1')) {
      await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 30000 }).catch(() => bad.push('the scene never became ready'))
    }
    await page.waitForTimeout(s.settle)
    if (s.ui) await page.evaluate((u) => window.__intent({ kind: 'open', ui: u }), s.ui).catch((e) => bad.push(`open ${s.ui}: ${e.message.slice(0, 80)}`))
    if (s.open) await s.open(page)
    if (s.wait) await page.waitForSelector(s.wait, { timeout: 8000 }).catch(() => bad.push(`never saw ${s.wait}`))
    if (s.ui || s.open) await page.waitForTimeout(1100)
    if (s.click) await page.click(s.click, { timeout: 4000 }).then(() => page.waitForTimeout(700)).catch(() => bad.push(`no ${s.click}`))
  } catch (e) { bad.push(e.message.slice(0, 120)) }

  const f = `${OUT}/${s.name}.png`
  await page.screenshot({ path: f })
  /* WHAT IS ON THE SCREEN, IN TEXT, so a defect can be named without squinting at
   * a thumbnail: the emoji nobody drew, and any element whose box has collapsed or
   * overflowed its parent, which is what "sizing problems" looks like in numbers. */
  const facts = await page.evaluate(() => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u
    const out = { emoji: [], clipped: [], tiny: [], fonts: new Set() }
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) continue
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
      if (own && EMOJI.test(own)) out.emoji.push(`${el.className || el.tagName}: ${own.slice(0, 12)}`)
      const cs = getComputedStyle(el)
      if (cs.fontFamily) out.fonts.add(cs.fontFamily.split(',')[0].replace(/['"]/g, ''))
      if (el.scrollHeight > el.clientHeight + 4 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && el.clientHeight > 0)
        out.clipped.push(`${el.className || el.tagName} ${el.clientHeight}<${el.scrollHeight}`)
      if (own && (r.width < 2 || r.height < 2)) out.tiny.push(String(el.className || el.tagName))
      /* fractional type is the thing that mangles a pixel face */
      const fs2 = parseFloat(cs.fontSize)
      if (own && Math.abs(fs2 - Math.round(fs2)) > 0.01) out.tiny.push(`FRACTIONAL ${el.className || el.tagName} ${cs.fontSize}`)
      /* AND ANYTHING RUNNING OFF THE WINDOW, which is what a card with no
       * max-width does and what a plank whose label does not fit does */
      if (r.width > 4 && (r.left < -2 || r.right > window.innerWidth + 2)) {
        out.clipped.push(`OFFSCREEN ${el.className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`)
      }
    }
    return { ...out, fonts: [...out.fonts], skin: document.documentElement.dataset.skin ?? '(none)' }
  }).catch(() => null)

  notes.push({ name: s.name, bad, facts })
  console.log(`${s.name}  skin=${facts?.skin ?? '?'}  faces=${(facts?.fonts ?? []).join('/')}`)
  if (facts?.emoji.length) console.log(`   EMOJI  ${facts.emoji.slice(0, 8).join('  ')}`)
  if (facts?.clipped.length) console.log(`   CLIPPED  ${[...new Set(facts.clipped)].slice(0, 6).join('  ')}`)
  if (facts?.tiny.length) console.log(`   ODD  ${[...new Set(facts.tiny)].slice(0, 6).join('  ')}`)
  for (const x of [...new Set(bad)].slice(0, 4)) console.log(`   ! ${x}`)
  await page.close()
}
await b.close()
fs.writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2))
console.log(`\n${notes.length} surfaces in ${OUT}`)
