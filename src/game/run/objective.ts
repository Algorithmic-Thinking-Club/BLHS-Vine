/* the one thing the player is supposed to do next, named as an anchor on a map */
import type { SaveGame } from '../save'
import { shownName } from '../roster/placeholders'
import { sessionOver, yearStatus } from './year'

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
  phase: 'founding' | 'vignette' | 'plan' | 'core' | 'voyage' | 'rising' | 'yearbook' | 'done'
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

  /* out to the water, pointing at the exit, and only for a voyage that can be sailed */
  const sailable = y.voyages.filter((v) => !v.done && v.playable)
  if (sailable.length) {
    const next = sailable[0]
    return {
      anchor: 'maw_entrance', map: MAW_MAP, phase: 'voyage',
      /* the programme name the student saw on the card, not the roster's raw one */
      say: `Go out to the harbor and sail to ${shownName(next.programmeId, next.name)}.`,
      away: `Get in the boat and sail to ${shownName(next.programmeId, next.name)}.`,
    }
  }

  /* the year has nothing left owing and the yearbook page has not been turned yet */
  if (y.readyForYearbook && !y.yearbookSeen) {
    /* the closing plays at the principal's desk, so the away line names the way back in */
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'yearbook',
      say: 'The principal is waiting.',
      away: 'Go back into the mountain. The principal is waiting.',
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
