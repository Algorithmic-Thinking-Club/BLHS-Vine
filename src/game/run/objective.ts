/* the one thing the player is supposed to do next, named as an anchor on a map */
import type { SaveGame } from '../save'
import { roleByConvention, type Role } from './roles'
import { sessionOver, yearStatus, yearWord } from './year'
import { picksOf } from './pick'

export type Objective = {
  /* what the place this points at is for: the room resolves the role to whichever anchor fills it, and null points at no place and draws no arrow */
  role: Role | null
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

/* the flag saying the founding event has played, named here so the cutscene, the station and the save agree on one string, in the same `thing:detail` shape save.ts uses for `vignette:y1` */
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

  /* a closed year asks nothing, because the only moment left with the page turned is the closing film, which owns its own controls and leads to the title screen, so a bar there would point at nothing */
  if (sessionOver(s)) return null

  /* the founding event, which happens once per run before any year beat */
  if (!s.flags.includes(FOUNDING_FLAG)) {
    return {
      role: 'principal', map: MAW_MAP, phase: 'founding',
      say: 'Talk to Principal Panther.',
      away: 'Go into the mountain.',
    }
  }

  const y = yearStatus(s)

  /* the year's opening vignette: the HUD auto mounts it whenever the world is quiet, so this clause only stops the objective pointing anywhere else while it is owed */
  if (!y.vignetteSeen) {
    return {
      /* no anchor here, because the vignette is a card the HUD raises itself and the principal has no handler for it, so pointing at `principal_desk` sends a year two student to "back again?" with the arrow still on him */
      role: null, map: MAW_MAP, phase: 'vignette',
      say: 'Look around.',
      away: 'Go into the mountain.',
    }
  }

  if (!y.planStamped) {
    return {
      role: 'plan', map: MAW_MAP, phase: 'plan',
      say: 'Go to the table and pick your year.',
      away: 'Go into the mountain and pick your year.',
    }
  }

  if (!y.coreBeatDone) {
    return {
      role: 'advisory', map: MAW_MAP, phase: 'core',
      say: 'Go to the fire.',
      away: 'Go into the mountain. Advisory is at the fire.',
    }
  }

  /* one clause covers every owed pick, class or club, since both are one row on one sheet with one button that finishes it, and the line must name the year sheet because a pick is played from a corner button, not from a painted classroom */
  const owed = picksOf(s).find((p) => !p.done)
  if (owed) {
    return {
      role: 'plan', map: MAW_MAP, phase: 'class',
      say: `${owed.map ? `Sail to ${owed.name}` : `Go to ${owed.name}`}. Open My Year.`,
      away: `Go into the mountain. ${owed.name} is on your year sheet.`,
    }
  }

  /* the year has nothing left owing and the yearbook page has not been turned yet */
  if (y.readyForYearbook && !y.yearbookSeen) {
    /* the closing plays at the principal's desk, so the away line names the way back in */
    return {
      role: 'principal', map: MAW_MAP, phase: 'yearbook',
      /* the line says why he is sent rather than "the principal is waiting", which reads identically at the founding, and its second sentence is the only thing on the glass saying the year is over before the film does */
      /* "go back to the Maw" is the away line only, because the common road ends at the chart table ten feet from the man, so a student already inside says the other half with the arrow already on him */
      say: `Find the principal. Year ${yearWord(s.year)} is done.`,
      away: 'Go back to the Maw. The principal is waiting.',
    }
  }

  /* the fallback when nothing above matched, which no ordinary year reaches */
  return {
    role: 'plan', map: MAW_MAP, phase: 'done',
    say: 'Nothing left this year. Look around.',
    away: 'Nothing left this year. Look around.',
  }
}

/* is this anchor on this map the thing the player is being sent to, with `roleOf` the room's own answer and the conventional names used when there is none */
export function isObjective(
  s: SaveGame | null,
  mapId: string,
  anchorName: string,
  roleOf: (name: string) => Role | null = roleByConvention,
): boolean {
  const o = nextObjective(s)
  if (!o || o.map !== mapId || !o.role) return false
  return roleOf(anchorName) === o.role
}
