/* the run's refusals as sentences, in one place, so every surface says the same thing */
import type { SaveGame, Season } from '../save'
import { programmeById, programmeAllowedIn, seasonOf } from '../roster/roster'
import { classById } from '../planner/catalog'

/** why a season token may not land on this programme, or null when it may */
export function refuseSlot(
  programmeId: string, season: Season, s: SaveGame | null, year: number,
): string | null {
  const plan = s?.plans?.[year]
  if (plan?.stamped) return 'Your year sheet is stamped. Year ' + year + ' cannot be changed.'

  const g = programmeById(programmeId)
  /* a slot that points at nothing is refused rather than written, because the save used to take any string and a typo became a committed season the year model waited on forever */
  if (!g) return `Nothing on the roster is called "${programmeId}".`

  if (!programmeAllowedIn(g, season)) {
    const real = seasonOf(g)
    /* a WIAA season is the school's own fact and not a rule this game made up, which is why the sentence names the season rather than saying the slot is unavailable */
    return `${g.name} is a ${String(real).toLowerCase()} sport. It does not run in ${season.toLowerCase()}.`
  }

  /* one programme per year: two tokens on one programme count one year of a ladder twice, and the completion record is per programme per year so the second token buys a row that already exists */
  const taken = Object.entries(plan?.slots ?? {})
    .find(([se, id]) => se !== season && id === programmeId)
  if (taken) return `You already picked ${g.name} for ${taken[0].toLowerCase()}. Pick something else.`

  if (!plan?.slots?.[season] && s && !s.tokens.includes(season))
    return `You already used your ${season.toLowerCase()} pick this year.`

  return null
}

/** why this class may not go on the sheet, or null when it may */
export function refuseClass(classId: string, s: SaveGame | null, year: number): string | null {
  const plan = s?.plans?.[year]
  if (plan?.stamped) return 'Your year sheet is stamped. Year ' + year + ' cannot be changed.'
  const c = classById(classId)
  if (!c) return `Nothing in the catalog is called "${classId}".`
  if (plan?.classes.includes(classId)) return `${c.name} is already picked for this year.`
  /* the two-pick limit is scarcity and not a widget state, so it says so out loud instead of the pick button quietly disappearing */
  if ((plan?.classes.length ?? 0) >= 2)
    return 'Two focus classes a year. Remove one before you add another.'
  if (!c.years.includes(year)) return `${c.name} is not open to you in year ${year}.`
  /* the prerequisite ladder is not checked here, because it needs every year's picks */
  return null
}
