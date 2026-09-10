/* what is in the Panther's Maw, as a list of anchor names and what each one does */
import type { Intent } from '../../vine/intents'
import type { SaveGame } from '../save'
import { cordsOf } from '../progress'
import { beatPassedIn, coreBeatId, hasCoreBeat } from '../beats/beats'
import { FOUNDING_FLAG, HUB_MAP } from '../run/objective'

/* what a station's body is: a generator that yields intents and gets results back */
export type StationRun = Generator<Intent, void, unknown>

export type Station = {
  /* the anchor name, typed in MAPVIS, validated there as a python identifier */
  name: string
  /* what the player reads when standing in range. The anchor's own `label` wins
   * when it has one, because the person who placed it gets the last word on
   * player-facing text; this is what shows if they left it blank. */
  fallbackLabel: string
  /* one line for the MAPVIS author and for docs/THE-MAW.md, saying what has to
   * be at this spot for the station to make sense */
  needs: string
  /* whether pressing E does anything right now. A station that is not available
   * still shows its label, greyed, rather than vanishing: a home base whose
   * furniture appears and disappears is a home base you cannot learn. */
  available?: (s: SaveGame) => boolean
  /* why it is unavailable, said in the world's words rather than the build's */
  closed?: (s: SaveGame) => string
  run: (s: SaveGame) => StationRun
}

/* ---- the stations -------------------------------------------------------- */

export const STATIONS: Station[] = [
  {
    name: 'chart_table',
    fallbackLabel: 'Open the year sheet',
    needs: 'a table big enough to spread a paper sheet on, with standing room on one side',
    *run() {
      yield { kind: 'log', event: 'planner_opened', data: { via: 'chart_table' } }
      yield { kind: 'open', ui: 'planner' }
    },
  },

  {
    name: 'hearth',
    fallbackLabel: 'Advisory',
    needs: 'a fire with room for a small circle around it; the yearly beat is staged here',
    available: (s) => !!coreBeatIdFor(s),
    closed: () => 'Advisory is done for this year.',
    *run(s) {
      const beat = coreBeatIdFor(s)
      if (!beat) return
      /* the beat runs through the same two-arm runner the plain study arm uses,
       * so the control arm is honoured by construction rather than by a second
       * code path somebody has to remember to keep in step */
      yield { kind: 'say', who: 'hearth', text: 'Advisory is starting.' }
      yield { kind: 'play', beat }
    },
  },

  {
    name: 'counselor',
    fallbackLabel: 'The counselor',
    needs: 'somewhere a person stands and can be spoken to; a post anchor with a facing',
    *run(s) {
      /* the real honor cords, said out loud by a person rather than read off a board */
      const cords = cordsOf(s)
      const earned = cords.filter((c) => c.earned)
      /* cords started but not finished, nearest first, in the board's own words */
      const close = cords
        .filter((c) => !c.earned && c.progress > 0)
        .sort((a, b) => b.progress - a.progress)

      if (!earned.length && !close.length) {
        yield { kind: 'say', who: 'counselor', text: 'No cord started yet. That is what four years are for.' }
      } else {
        for (const c of earned.slice(0, 2)) {
          yield { kind: 'say', who: 'counselor', text: `You earned ${c.name}. That one is yours.` }
        }
        for (const c of close.slice(0, 2)) {
          yield { kind: 'say', who: 'counselor', text: `Still working toward ${c.name}. ${c.detail}` }
        }
      }
      const pick = yield { kind: 'choose', prompt: 'Ask about the cords?', options: ['Open the Handbook', 'Not now'] }
      if (pick === 0) yield { kind: 'open', ui: 'handbook' }
    },
  },

  {
    name: 'principal_desk',
    fallbackLabel: 'Principal Panther',
    needs: 'a desk with a standing spot in front of it; the founding event stages here',
    *run(s) {
      if (!s.flags.includes(FOUNDING_FLAG)) {
        yield { kind: 'cutscene', script: 'maw-founding' }
        yield { kind: 'set_flag', flag: FOUNDING_FLAG }
        return
      }
      /* `who` has to be the anchor name, because that is what the name plate is looked up by */
      yield { kind: 'say', who: 'principal_desk', portrait: 'principal', text: 'Back again. Good. Your year sheet shows what you picked this year.' }
    },
  },

  {
    name: 'trophy_wall',
    fallbackLabel: 'The trophy wall',
    needs: 'WALL, not floor. It costs no station slot; it fills as the run goes on',
    *run(s) {
      /* no panel: the wall itself is the readout, filled by what the run has done */
      const n = s.stickers.length + s.badges.length
      yield {
        kind: 'say', who: 'thor',
        text: n === 0
          ? 'No badges on the wall yet. Every badge I earn goes up here.'
          : `Badges on the wall: ${n}. I earned every one of them.`,
      }
    },
  },

  {
    name: 'outfitter',
    fallbackLabel: 'Change clothes',
    needs: 'a nook with a mirror or a rail; revisitable, the heron tailor moves in',
    *run() {
      yield { kind: 'open', ui: 'wardrobe' }
    },
  },

  {
    /* a trigger rather than an errand: it fires by walking in, says one line, and gets out of the way */
    name: 'hall_step',
    fallbackLabel: '',
    needs: 'the lip of the platform where the south bridge lands; a trigger, not a post',
    *run() {
      yield { kind: 'log', event: 'hall_entered', data: { by: 'trigger' } }
      yield { kind: 'say', who: 'thor', text: 'This is the Maw. The principal and the year sheet are in here.' }
    },
  },

  {
    name: 'maw_entrance',
    fallbackLabel: 'the harbor',
    needs: 'the tunnel door, on the far side of the one the player came through',
    *run() {
      /* `at` names where in the hub to come out, so walking back out lands at the tunnel mouth */
      yield { kind: 'enter', map: HUB_MAP, at: 'panthers_maw' }
    },
  },
]

/* the two side tunnels, which are real doors with no map behind them yet */
export const FUTURE_ROOMS = ['east_tunnel', 'west_tunnel'] as const

export const stationByName = (name: string): Station | undefined =>
  STATIONS.find((st) => st.name === name)

/* THE REQUIRED ANCHOR LIST. What a Maw bundle has to carry before the game can
 * do anything with it, checked at load so a missing anchor is a console line
 * naming it rather than a station that silently never fires. */
export const REQUIRED_ANCHORS = STATIONS.map((s) => s.name)

export function missingAnchors(has: (name: string) => boolean): string[] {
  return REQUIRED_ANCHORS.filter((n) => !has(n))
}

/* the year's beat id, or null when the year has none or the ledger already has it */
/* ---- THE SECOND HEARTH, AND IT DISAGREED (Ash, 2026-09-09) ---------------
 *
 * There are two hearths. The Maw's own island answers `talk:hearth` and this
 * table answers whenever no island has claimed the anchor, which is every frame
 * before the worker has finished loading and every map a member ships without
 * one. `grape-router.ts` prefers the island and falls back to here.
 *
 * They asked different questions. The island asks `get("advisory")`, which the
 * intent engine answers off the ledger; this asked `beatDone`, which is "is
 * there a row". So a student who FAILED Advisory got "Advisory is done for this
 * year." from one hearth and a fresh quiz from the other, depending on which one
 * happened to answer. That is Ash's item 2, and the cause was never the year: it
 * was two predicates for one question.
 *
 * `beatPassedIn` is the one predicate now, and `beats/agreement.test.ts` holds
 * every surface to it. */
function coreBeatIdFor(s: SaveGame): string | null {
  if (!hasCoreBeat(s.year)) return null
  if (beatPassedIn(s, s.year)) return null
  return coreBeatId(s.year)
}
