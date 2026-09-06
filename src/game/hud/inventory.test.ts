/* THE FENCE ROUND THE PLAY SCREEN.
 *
 * Part IV asks for this twice and in two different sections, which is how much it
 * matters. §40.2: "one place that lists every HUD element and its unlock
 * condition." §40.6: "the absence list enforced somewhere a new element has to
 * pass." Both are answered by `inventory.ts` plus this file, and this file is the
 * half that has teeth: an element added without a grant condition fails here, and
 * an element added to the always-on list without being in the table fails here.
 *
 * WHY A TEST AND NOT A CONVENTION. §40.6's whole position is that the minimal HUD
 * is what separates "a game a freshman reads in four seconds" from "a game a
 * freshman needs a teacher to explain", in a room where the teacher has a whole
 * advisory class of them. A convention survives until the first member asks for a
 * counter in the corner. A failing build survives that conversation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { SaveGame } from '../save'
import {
  ALWAYS_ON, CHART_FLAG, HANDBOOK_FLAG, HUD_INVENTORY, hudGrants, type HudElement,
} from './inventory'

/* four runs, which are the four shapes of student this screen has to be right
 * for. The names are the states, not the fixtures. */
const run = (over: Partial<SaveGame> = {}): SaveGame => ({
  v: 2, id: 'r_t', handle: 'BraveTide', pronouns: 'they/them', boatName: 'Kestrel',
  year: 1, season: 'Fall', beat: 'maw:arrive', introDone: true,
  plans: {}, flags: [], tokens: ['Fall', 'Winter', 'Spring'],
  ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [], savedAt: 0,
  ...over,
} as unknown as SaveGame)

const FRESH = run()
const AFTER_FOUNDING = run({ flags: [CHART_FLAG, HANDBOOK_FLAG] })
const MID_YEAR_TWO = run({
  year: 2, flags: [CHART_FLAG, HANDBOOK_FLAG], tokens: ['Spring'],
  ledger: [{ id: 'x', title: 'CTE', kind: 'island', credit: 1, grade: 3.4, year: 1, season: 'Fall', tags: ['cte'] }],
} as Partial<SaveGame>)
const GRADUATED = run({ year: 4, graduated: true, flags: [CHART_FLAG, HANDBOOK_FLAG], tokens: [] } as Partial<SaveGame>)

describe('the HUD assembles as the game grants things', () => {
  /* THE LAW, AT THE ONE MOMENT IT WAS BROKEN. §40.2 names the failure by line:
   * "the compass and the Handbook button are rendered unconditionally the moment
   * a world scene mounts". A student in minute one had a binder spine two
   * sections before anybody hands them a binder. */
  it('gives a brand new run NOTHING in the corner', () => {
    const g = hudGrants(FRESH)
    expect(g).toEqual({ chart: false, handbook: false, tokens: false, cape: false })
  })

  it('and gives a run with no save at all nothing, without throwing', () => {
    expect(hudGrants(null)).toEqual({ chart: false, handbook: false, tokens: false, cape: false })
  })

  it('hands over the chart and the binder when the run says they were handed over', () => {
    const g = hudGrants(AFTER_FOUNDING)
    expect(g.chart).toBe(true)
    expect(g.handbook).toBe(true)
    expect(g.tokens).toBe(true)
  })

  it('puts the cape within reach at the first cord in progress and not before', () => {
    expect(hudGrants(AFTER_FOUNDING).cape).toBe(false)
    expect(hudGrants(MID_YEAR_TWO).cape).toBe(true)
  })

  /* Q40.2.a, answered. The file asks which elements are transient and which are
   * permanent, "because a permanent element that vanishes reads as a bug and a
   * transient one that lingers is clutter". §15.2 rules on this one: the pips
   * leave at graduation because scarcity is over. */
  it('takes the pips away at graduation and leaves everything else', () => {
    const g = hudGrants(GRADUATED)
    expect(g.tokens).toBe(false)
    expect(g.chart).toBe(true)
    expect(g.handbook).toBe(true)
  })

  it('never takes back anything the table calls permanent', () => {
    /* a permanent row must not have a condition that can go from true to false.
     * Checked by running every permanent row against a save that has strictly
     * MORE in it than the one that granted it. */
    for (const row of HUD_INVENTORY.filter((r) => r.permanent)) {
      if (!row.has(AFTER_FOUNDING)) continue
      expect(row.has(MID_YEAR_TWO), `${row.el} was granted and then taken back`).toBe(true)
      expect(row.has(GRADUATED), `${row.el} was granted and then taken back`).toBe(true)
    }
  })
})

describe('the absence list is enforced rather than intended', () => {
  it('has a row for every element the corner can hold, and no orphans', () => {
    const rows = HUD_INVENTORY.map((r) => r.el).sort()
    const els: HudElement[] = ['chart', 'handbook', 'tokens', 'cape']
    expect(rows).toEqual([...els].sort())
    /* the record type already forces this at compile time; asserting it here is
     * what catches a row DELETED rather than a member added */
    expect(new Set(rows).size).toBe(rows.length)
  })

  it('gives every element a sentence to say when it arrives', () => {
    /* §40.2's Deployment line: an element that appears mid-session with no
     * explanation is a raised hand, and "the teacher is not going to be free". */
    for (const row of HUD_INVENTORY) {
      expect(row.says.length, `${row.el} arrives without saying what it is`).toBeGreaterThan(12)
      expect(row.rule.length, `${row.el} has no stated rule`).toBeGreaterThan(12)
    }
  })

  /* THE ONE THAT CATCHES A NEW FLOATER. §40.6's absence list is only a list until
   * something has to pass it. Anything rendered on the play screen has to be
   * named in ALWAYS_ON, and this reads the components rather than trusting them. */
  it('lets nothing float that the absence list does not name', () => {
    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')
    /* the play screen is what WorldHud mounts, so its render is the list of
     * everything that can be on screen while a player has control */
    const hud = read('src/game/hud/WorldHud.tsx')
    const mounted = [...hud.matchAll(/<([A-Z][A-Za-z]*)\s*\/?>/g)].map((m) => m[1])
    const KNOWN: Record<string, string> = {
      Hud: 'chart', Dialogue: 'dialogue', WorldCutscene: 'dialogue',
      PlaceCard: 'place-card', Heading: 'heading',
      /* the question mark, which is on the list with its reason written beside
       * it in `inventory.ts`. It is the one thing here that is not state and not
       * a grant, and the brief that asked for it asked for exactly this: that it
       * be added to the absence list rather than smuggled past it. */
      HelpButton: 'help',
      /* the movie frame, which is on the list because it MOUNTS on the play
       * screen even though it draws nothing until an island asks for it */
      MovieBars: 'movie-bars',
    }
    const strangers = mounted.filter((m) => !(m in KNOWN))
    expect(strangers,
      'a component mounted on the play screen with no entry in the absence list. '
      + 'Part IV §40.6 forbids a floating readout; add it to ALWAYS_ON with its '
      + 'diegetic justification, or do not float it.').toEqual([])
    for (const m of mounted) {
      expect(ALWAYS_ON as readonly string[], `${m} maps to a name the absence list does not carry`)
        .toContain(KNOWN[m])
    }
  })

  it('names the five things that must never appear, so a reader meets them here too', () => {
    /* not a code check: a note in the suite so the next person to add a corner
     * counter reads the reason before they write it. §40.6's list, with each
     * absence's diegetic replacement. */
    const forbidden = {
      'GPA bar': 'the room fills; the number lives on the Handbook Cords page',
      'XP or level': 'per-track ranks, JV to Varsity to Captain',
      'quest log': 'one live objective, which is the heading sentence',
      minimap: 'the chart, a Handbook tab',
      leaderboard: 'study integrity, not taste: competition is what Kahoot is built on',
    }
    expect(Object.keys(forbidden)).toHaveLength(5)
    for (const why of Object.values(forbidden)) expect(why.length).toBeGreaterThan(10)
  })
})
