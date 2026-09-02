/* THE PANTHER'S MAW: what is in it, as data.
 *
 * This file is the anchor list. Every `name` below is a string Ash types into
 * MAPVIS when he places the anchor, and nothing else in the game hardcodes a
 * position in this room. Move the chart table three feet left and no code
 * changes, because the code never knew where it was.
 *
 * IT IS WRITTEN AS GENERATORS ON PURPOSE. A station yields intents and gets
 * results back, which is the exact shape a member's Python takes:
 *
 *     @on_interact("chart_table")            *run() {
 *     def plan(self):                          yield { kind: 'say', ... }
 *         yield self.say(...)                  const p = yield { kind: 'choose', ... }
 *         p = yield self.choose([...])       }
 *
 * If the vine's own content cannot be written in the API the members get, then
 * the API is a demo and the members are second-class. Writing the Maw this way
 * is the test, taken now rather than discovered in October.
 *
 * WHICH STATIONS ARE SCENES AND WHICH ARE PANELS (Ash, 2026-08-27: "i dont want
 * too much UI to dictate. UI is very important, but the main room is also very
 * important, thats where the user returns to after adventuring"). So the panel
 * is the fallback and not the default:
 *   scenes  hearth, counselor, principal_desk, trophy_wall
 *   panels  chart_table (a paper sheet really is a document, and the token drag
 *           IS the mechanic, §7.2), outfitter
 *   neither the Handbook, which is on the HUD and does not get a lectern. A
 *           station whose whole job is opening a panel the player can already
 *           open from anywhere is a slot spent on a second door to the room
 *           they are standing in.
 */
import type { Intent } from '../../vine/intents'
import type { SaveGame } from '../save'
import { cordsOf } from '../progress'
import { beatDone, coreBeatId, hasCoreBeat } from '../beats/beats'
import { FOUNDING_FLAG, HUB_MAP } from '../run/objective'

/* what a station's body is allowed to be. It receives IntentResult values back
 * through `yield`, which is untyped for the same reason the Python side is: the
 * result shape depends on the intent, and a beginner should not have to
 * annotate it. */
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
    fallbackLabel: 'The chart table',
    needs: 'a table big enough to spread a paper sheet on, with standing room on one side',
    *run() {
      yield { kind: 'log', event: 'planner_opened', data: { via: 'chart_table' } }
      yield { kind: 'open', ui: 'planner' }
    },
  },

  {
    name: 'hearth',
    fallbackLabel: 'The Advisory Hearth',
    needs: 'a fire with room for a small circle around it; the yearly beat is staged here',
    available: (s) => !!coreBeatIdFor(s),
    closed: () => 'The fire is banked. Nothing is owed here this year.',
    *run(s) {
      const beat = coreBeatIdFor(s)
      if (!beat) return
      /* the beat runs through the same two-arm runner the plain study arm uses,
       * so the control arm is honoured by construction rather than by a second
       * code path somebody has to remember to keep in step */
      yield { kind: 'say', who: 'hearth', text: 'The circle is drawn. Advisory is starting.' }
      yield { kind: 'play', beat }
    },
  },

  {
    name: 'counselor',
    fallbackLabel: 'The counselor',
    needs: 'somewhere a person stands and can be spoken to; a post anchor with a facing',
    *run(s) {
      /* §8.4's honor reveal, said out loud by somebody rather than read off a
       * board. The content is the real cord table from docs/blhs/awards.md, so
       * this is a character delivering true information about the player's own
       * run, which is the entire "surface the hidden earnable things" ask. */
      const cords = cordsOf(s)
      const earned = cords.filter((c) => c.earned)
      /* started but not finished, nearest first. `detail` is already the live
       * status line progress.ts writes for the tracker board ("3 of 5 AP classes
       * passed"), so the counselor says the same words the board would, and
       * there is one source for both. */
      const close = cords
        .filter((c) => !c.earned && c.progress > 0)
        .sort((a, b) => b.progress - a.progress)

      if (!earned.length && !close.length) {
        yield { kind: 'say', who: 'counselor', text: 'Nothing on your cape yet. That is what four years are for.' }
      } else {
        for (const c of earned.slice(0, 2)) {
          yield { kind: 'say', who: 'counselor', text: `${c.name} is yours. That one is settled.` }
        }
        for (const c of close.slice(0, 2)) {
          yield { kind: 'say', who: 'counselor', text: `${c.name}. ${c.detail}` }
        }
      }
      const pick = yield { kind: 'choose', prompt: 'Ask about the cords?', options: ['Show me the board', 'Not now'] }
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
      /* THE ANCHOR NAME, NOT A NICKNAME FOR IT. `who` is resolved against the
       * map's anchors and then against the station table (PmapScene's
       * `speakerLabel`), and no anchor called `principal` exists on
       * panther-maw, so this string fell through every rule and printed the
       * lowercase word `principal` on the plate. The anchor is `principal_desk`
       * and its station carries `fallbackLabel: 'Principal Panther'`, which is
       * the name a student should read. */
      yield { kind: 'say', who: 'principal_desk', text: 'Back again. Good. The sea does not run out.' }
    },
  },

  {
    name: 'trophy_wall',
    fallbackLabel: 'The trophy wall',
    needs: 'WALL, not floor. It costs no station slot; it fills as the run goes on',
    *run(s) {
      /* no panel at all. The wall itself is the readout, and what is on it came
       * from the run. This is the "world reflects state" rule Ash set for the
       * ship in August, generalised: a thing you walk up to that changed because
       * of something you did four years ago is worth more than a list. */
      const n = s.stickers.length + s.badges.length
      yield {
        kind: 'say', who: 'thor',
        text: n === 0
          ? 'Empty hooks, all the way along. Someone expects this to fill.'
          : `${n} up there now. All of it earned somewhere out on the water.`,
      }
    },
  },

  {
    name: 'outfitter',
    fallbackLabel: 'The outfitter',
    needs: 'a nook with a mirror or a rail; revisitable, the heron tailor moves in',
    *run() {
      yield { kind: 'open', ui: 'wardrobe' }
    },
  },

  {
    /* THE ONE THING NOBODY PRESSES A BUTTON FOR.
     *
     * Every other station in this table is an errand: a prompt appears, you press
     * E, something happens. A trigger is the other kind, and it is the only
     * voluntary, unprompted, ungraded action in the whole design: you walked
     * somewhere, and the room noticed. It fires once per map load by entry, from
     * `regionsAt`, which had been correct since anchors were first read and had
     * exactly one caller, a test.
     *
     * Deliberately small. A trigger that starts a scene the first time a player
     * steps somewhere is a trap in a room they have to cross forty times, so this
     * one says a line and gets out of the way. */
    name: 'hall_step',
    fallbackLabel: '',
    needs: 'the lip of the platform where the south bridge lands; a trigger, not a post',
    *run() {
      yield { kind: 'log', event: 'hall_entered', data: { by: 'trigger' } }
      yield { kind: 'say', who: 'thor', text: 'The bridge ends and the hall opens up. Someone has been keeping it swept.' }
    },
  },

  {
    name: 'maw_entrance',
    fallbackLabel: 'Back to the harbour',
    needs: 'the tunnel door, on the far side of the one the player came through',
    *run() {
      /* `at` names where in the hub to arrive, which is the whole reason
       * toAnchor exists: without it every door into a map drops the player on
       * that map's single global spawn, and walking back out of the Maw would
       * put Thor at the dock instead of at the tunnel mouth he just left. */
      yield { kind: 'enter', map: HUB_MAP, at: 'panthers_maw' }
    },
  },
]

/* the two bridges that end in tunnels. They carry real names and real doors so
 * the room reads as a place with more of itself past the walls, and PmapScene
 * already says "the way is barred" for a door whose bundle does not exist. When
 * a painting lands for either one, it is a new bundle and nothing here changes.
 */
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

/* the year's beat id, or null when there is nothing owed: either the year has no
 * authored content, or the ledger already has it. beats.ts owns both questions,
 * so this asks rather than re-deciding, and the id stays one string in one file
 * ("core:y1", with the colon). */
function coreBeatIdFor(s: SaveGame): string | null {
  if (!hasCoreBeat(s.year)) return null
  if (beatDone(s.ledger, s.year)) return null
  return coreBeatId(s.year)
}
