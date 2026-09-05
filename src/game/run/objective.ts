/* THE OBJECTIVE: what the player is supposed to do next, as an anchor name.
 *
 * The Maw is the year's state machine wearing a body. Four of the six beats in
 * GAME-DESIGN §7.5's forty-minute rhythm happen inside it, in a fixed order, and
 * the player is SENT to each one. So "what is reachable in the Maw" is really
 * "what state is the year in, and what is the one live thing in that state".
 *
 * yearStatus() already computed all of this and nothing ever read it as a
 * sequence. This turns it into a single name, and that name is what the guide
 * arrow points at, what the station highlights, and what `guide_to` resolves.
 *
 * ONE LIVE THING AT A TIME, on purpose. A home base with six glowing stations is
 * a menu. A home base with one glowing station and five you may choose to visit
 * is a place with a story running through it. The optional stations are not
 * disabled when they are not the objective, they are just quiet.
 *
 * This is also the most reusable thing in the project: it is exactly what a
 * grape needs for a quest step, so it is built once here and inherited rather
 * than reinvented per island.
 */
import type { SaveGame } from '../save'
import { yearStatus } from './year'

export type Objective = {
  /* the anchor this points at. Every map that can be the objective's home has to
   * carry an anchor by this name, which is what makes the list below double as
   * the required-anchor list for the Maw. */
  anchor: string
  /* the map that anchor lives on, so the arrow can say "not here, out there" */
  map: string
  /* shown to the player. In-character, never a checklist item. */
  say: string
  /* the year phase this belongs to, for logging and for the debug overlay.
   *
   * `rising` is the THIRD VOYAGE STATE §80.6 asks for by name:
   * committed-but-unsailable. O5 exists because the arrow pointed at an island
   * that will never rise and never resolved on its own, and a state that has no
   * name is a state nothing can render differently. */
  phase: 'founding' | 'vignette' | 'plan' | 'core' | 'voyage' | 'rising' | 'yearbook' | 'done'
}

export const MAW_MAP = 'panther-maw'
export const HUB_MAP = 'hub'

/* the flag that says the founding event has played. Named here rather than at
 * the callsite so the cutscene, the station and the save all agree on one
 * string; save.ts already uses this `thing:detail` shape for `vignette:y1`. */
export const FOUNDING_FLAG = 'maw:founding'

/* THE ORDER, and it is the order §7.5 prints.
 *
 * Read top to bottom, first match wins. Adding a beat means adding a clause
 * here, which is the point: the sequence lives in one readable place instead of
 * being spread across whichever component happened to need it.
 */
export function nextObjective(s: SaveGame | null): Objective | null {
  if (!s || !s.introDone) return null
  if (s.graduated) return null

  /* the founding event: the first time in, before anything else can be true.
   * It is not a year beat, it happens once per run. */
  if (!s.flags.includes(FOUNDING_FLAG)) {
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'founding',
      say: 'Go into the mountain and find the principal.',
    }
  }

  const y = yearStatus(s)

  /* the year's opening vignette. The HUD already auto-mounts this whenever the
   * world is quiet, so the objective's job is only to stop pointing anywhere
   * else while it is owed. */
  if (!y.vignetteSeen) {
    return { anchor: 'principal_desk', map: MAW_MAP, phase: 'vignette', say: `Year ${y.year} is starting. Read what Principal Panther says.` }
  }

  if (!y.planStamped) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'plan',
      say: 'Go to the year sheet table. Pick two classes and stamp it.',
    }
  }

  if (!y.coreBeatDone) {
    return {
      anchor: 'hearth', map: MAW_MAP, phase: 'core',
      say: 'Go to Advisory, at the fire in the Maw.',
    }
  }

  /* out of the Maw and onto the water. The anchor is the way OUT, because the
   * thing to do is somewhere this map cannot reach, and an arrow that points at
   * the exit is more honest than one that points at nothing.
   *
   * A VOYAGE THAT CANNOT BE SAILED DOES NOT OUTRANK THE YEARBOOK, and it used to.
   * This clause read `y.voyages.filter((v) => !v.done)` with no test of whether
   * the programme could run, so the moment a token landed on anything unplayable
   * the arrow pointed at the exit for the rest of the year and the `yearbook`
   * phase below became unreachable. Every programme on the roster is unplayable
   * today, so that was every stamped year: the year model said the yearbook was
   * ready (`year.ts` deliberately does not wait on a rising island) and the
   * sequencer disagreed with it, forever, on the ordinary path. */
  const sailable = y.voyages.filter((v) => !v.done && v.playable)
  if (sailable.length) {
    const next = sailable[0]
    return {
      anchor: 'maw_entrance', map: MAW_MAP, phase: 'voyage',
      say: `Go to ${next.name} for ${next.season.toLowerCase()} term.`,
    }
  }

  if (y.readyForYearbook && !y.yearbookSeen) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'yearbook',
      say: 'The year is done. Press Open the yearbook.',
    }
  }

  /* THE THIRD VOYAGE STATE: committed, and nothing to sail to. It is below the
   * yearbook rather than above it because it can never resolve on its own, and
   * an objective that cannot be completed is not an objective. It is here at all
   * so the state has a name and a sentence rather than being silence. */
  const rising = y.voyages.filter((v) => !v.done && !v.playable)
  if (rising.length && !y.readyForYearbook) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'rising',
      say: `${rising[0].name} is not open yet. Open your year sheet.`,
    }
  }

  return { anchor: 'chart_table', map: MAW_MAP, phase: 'done', say: 'Nothing left to do this year. Look around, or open your year sheet.' }
}

/* is this anchor, on this map, the thing the player is currently being sent to */
export function isObjective(s: SaveGame | null, mapId: string, anchorName: string): boolean {
  const o = nextObjective(s)
  return !!o && o.map === mapId && o.anchor === anchorName
}
