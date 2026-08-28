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
  /* the year phase this belongs to, for logging and for the debug overlay */
  phase: 'founding' | 'vignette' | 'plan' | 'core' | 'voyage' | 'yearbook' | 'done'
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
      say: 'Someone is waiting for you inside the mountain.',
    }
  }

  const y = yearStatus(s)

  /* the year's opening vignette. The HUD already auto-mounts this whenever the
   * world is quiet, so the objective's job is only to stop pointing anywhere
   * else while it is owed. */
  if (!y.vignetteSeen) {
    return { anchor: 'principal_desk', map: MAW_MAP, phase: 'vignette', say: `Year ${y.year} is starting.` }
  }

  if (!y.planStamped) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'plan',
      say: 'The year sheet is unstamped. The chart table is waiting.',
    }
  }

  if (!y.coreBeatDone) {
    return {
      anchor: 'hearth', map: MAW_MAP, phase: 'core',
      say: 'Advisory is at the fire.',
    }
  }

  /* out of the Maw and onto the water. The anchor is the way OUT, because the
   * thing to do is somewhere this map cannot reach, and an arrow that points at
   * the exit is more honest than one that points at nothing. */
  const sailing = y.voyages.filter((v) => !v.done)
  if (sailing.length) {
    const next = sailing[0]
    return {
      anchor: 'maw_entrance', map: MAW_MAP, phase: 'voyage',
      say: next.playable
        ? `${next.name} is waiting, ${next.season.toLowerCase()} term.`
        : `${next.name} has not risen from the sea yet.`,
    }
  }

  if (y.readyForYearbook && !y.yearbookSeen) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'yearbook',
      say: 'The year is done. The sheet wants closing.',
    }
  }

  return { anchor: 'chart_table', map: MAW_MAP, phase: 'done', say: 'Nothing is owed. The island is yours to wander.' }
}

/* is this anchor, on this map, the thing the player is currently being sent to */
export function isObjective(s: SaveGame | null, mapId: string, anchorName: string): boolean {
  const o = nextObjective(s)
  return !!o && o.map === mapId && o.anchor === anchorName
}
