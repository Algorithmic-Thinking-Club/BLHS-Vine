/* the one thing the player is supposed to do next, named as an anchor on a map */
import type { SaveGame } from '../save'
import { sessionOver, yearStatus } from './year'
import { picksOf } from './pick'

export type Objective = {
  /* the anchor this points at. Every map that can be the objective's home has to
   * carry an anchor by this name, which is what makes the list below double as
   * the required-anchor list for the Maw. */
  anchor: string
  /* the map that anchor lives on, so the arrow can say "not here, out there" */
  map: string
  /* the step said on the objective's own map, and the same step said from any other map */
  say: string
  away: string
  /* the year phase this belongs to, for logging and for the debug overlay */
  phase: 'founding' | 'vignette' | 'plan' | 'core' | 'class' | 'voyage' | 'rising' | 'yearbook' | 'done'
}

export const MAW_MAP = 'panther-maw'
export const HUB_MAP = 'hub'

/* the flag that says the founding event has played. Named here rather than at
 * the callsite so the cutscene, the station and the save all agree on one
 * string; save.ts already uses this `thing:detail` shape for `vignette:y1`. */
export const FOUNDING_FLAG = 'maw:founding'

/* picks the sentence for where the player is standing, on the objective's map or off it */
export function objectiveLine(o: Objective | null, mapId: string | null | undefined): string {
  if (!o) return ''
  /* not knowing which map he is on counts as being somewhere else */
  return mapId === o.map ? o.say : o.away
}

/* the year's beats in order, read top to bottom with the first match winning */
export function nextObjective(s: SaveGame | null): Objective | null {
  if (!s || !s.introDone) return null
  if (s.graduated) return null

  /* the session is over, so nothing is lit and the room is the player's to look around */
  if (sessionOver(s)) {
    /* the line for a year that has finished, which says so and leaves the room open */
    const line = 'Year one is done. Look around.'
    return { anchor: '', map: MAW_MAP, phase: 'done', say: line, away: line }
  }

  /* the founding event, which happens once per run before any year beat */
  if (!s.flags.includes(FOUNDING_FLAG)) {
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'founding',
      say: 'Talk to Principal Panther.',
      away: 'Go into the mountain.',
    }
  }

  const y = yearStatus(s)

  /* the year's opening vignette. The HUD already auto-mounts this whenever the
   * world is quiet, so the objective's job is only to stop pointing anywhere
   * else while it is owed. */
  if (!y.vignetteSeen) {
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'vignette',
      say: 'Talk to Principal Panther.',
      away: 'Go into the mountain.',
    }
  }

  if (!y.planStamped) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'plan',
      say: 'Go to the table and pick your year.',
      away: 'Go into the mountain and pick your year.',
    }
  }

  if (!y.coreBeatDone) {
    return {
      anchor: 'hearth', map: MAW_MAP, phase: 'core',
      say: 'Go to the fire.',
      away: 'Go into the mountain. Advisory is at the fire.',
    }
  }

  /* ---- THE MIDDLE OF YEAR ONE IS WHAT HE PICKED ---------------------------
   *
   * ASH, 2026-09-08 item 4: *"one button per pick, the roster decides"*, and the
   * bar is the other half of that: *"marks it complete... and the bar names the
   * next pick."*
   *
   * There were two clauses here and they were the same clause. One named a class
   * and sent him to the year sheet; the other named a club and sent him to the
   * harbour, and only if somebody had built its island, because a club with no
   * island could not be finished. Both of those are now one row on one sheet with
   * one button that always finishes it, so this is one clause.
   *
   * IT NAMES THE PICK AND THE DOOR TO IT. "Open My Year" is the second half on
   * purpose: a pick is played from the year sheet, which is a corner button
   * rather than a place in the room, so a sentence naming only the class would
   * send a student looking for a classroom that is not painted. */
  const owed = picksOf(s).find((p) => !p.done)
  if (owed) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'class',
      say: `${owed.map ? `Sail to ${owed.name}` : `Go to ${owed.name}`}. Open My Year.`,
      away: `Go into the mountain. ${owed.name} is on your year sheet.`,
    }
  }

  /* the year has nothing left owing and the yearbook page has not been turned yet */
  if (y.readyForYearbook && !y.yearbookSeen) {
    /* the closing plays at the principal's desk, so the away line names the way back in */
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'yearbook',
      /* ASH, 2026-09-08: *"the bar says 'Find the principal. Year one is done.'"*
       * It said "The principal is waiting", which is a fact about a man and not
       * about the year: a student read it identically at the founding, when the
       * principal really was waiting to start everything. This one says WHY he
       * is being sent, and the second sentence is the only thing on the glass
       * that tells him the year is over before the film says so. */
      /* ASH, 2026-09-08 item 6: *"When every pick is done the bar says 'Go back
       * to the Maw. The principal is waiting.'"* That is the AWAY line and it is
       * his words exactly.
       *
       * INSIDE THE MAW IT SAYS THE OTHER HALF, because "go back to the Maw" over
       * a student standing in the Maw is the game telling him to do a thing he
       * has already done. The common road ends exactly there: he presses Go on
       * his last pick at the chart table and the year closes with him ten feet
       * from the man. Same fact, said from where he is: the arrow is already on
       * the principal and this is the sentence that goes with it. */
      say: 'Find the principal. Year one is done.',
      away: 'Go back to the Maw. The principal is waiting.',
    }
  }

  /* the fallback when nothing above matched, which no ordinary year reaches */
  return {
    anchor: 'chart_table', map: MAW_MAP, phase: 'done',
    say: 'Nothing left this year. Look around.',
    away: 'Nothing left this year. Look around.',
  }
}

/* is this anchor, on this map, the thing the player is currently being sent to */
export function isObjective(s: SaveGame | null, mapId: string, anchorName: string): boolean {
  const o = nextObjective(s)
  return !!o && o.map === mapId && o.anchor === anchorName
}
