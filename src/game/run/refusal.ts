/* THE RUN'S REFUSALS, AS STRINGS, IN ONE PLACE (N3).
 *
 * §80.6 draws this boundary with the kit and it is worth stating the way the
 * substrate cut states it: *"refusals cross this line as strings. N3 asks for one
 * refusal string served to click, drop and keyboard alike, and the reason it is
 * the run's rather than the kit's is that the refusal is a fact about the school
 * or about scarcity, not about the widget."*
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The season lock existed in exactly one place,
 * `Planner.tsx`'s menu, as a `.filter(programmeAllowedIn)`. A filter is not a
 * refusal: it removes the thing rather than saying why the thing is not there, so
 * a student who came looking for football in spring found an absence and no
 * sentence. Worse, `assignSlot` in `save.ts` never checked a season at all, so
 * the rule lived in a render and any other caller (a keyboard path, a drag, a
 * grape, a test) could put a fall sport on a spring token and the year model
 * would believe it.
 *
 * So the rule is here, the words are here, and the verb in the save calls the
 * same function the sheet prints. There is one sentence per refusal and every
 * surface serves that one.
 */
import type { SaveGame, Season } from '../save'
import { programmeById, programmeAllowedIn, seasonOf } from '../roster/roster'
import { classById } from '../planner/catalog'

/** why a season token may not land on this programme, or null when it may */
export function refuseSlot(
  programmeId: string, season: Season, s: SaveGame | null, year: number,
): string | null {
  const plan = s?.plans?.[year]
  if (plan?.stamped) return 'The wax is on this sheet. Year ' + year + ' is set.'

  const g = programmeById(programmeId)
  /* A SLOT THAT POINTS AT NOTHING is refused rather than written. The save used
   * to take any string, so a typo became a committed season the year model then
   * waited on forever, and nothing in the game could ever finish it. */
  if (!g) return `Nothing on the roster is called "${programmeId}".`

  if (!programmeAllowedIn(g, season)) {
    const real = seasonOf(g)
    /* THE SCHOOL'S OWN FACT, in the school's own words: this is a WIAA season and
     * not a rule this game made up, which is why the sentence names the season
     * rather than saying the slot is unavailable. */
    return `${g.name} is a ${String(real).toLowerCase()} sport. It does not run in ${season.toLowerCase()}.`
  }

  /* ONE PROGRAMME PER YEAR. Two tokens on one programme is one year of a ladder
   * counted twice, and the completion record is per programme per year, so the
   * second token buys a row that already exists. */
  const taken = Object.entries(plan?.slots ?? {})
    .find(([se, id]) => se !== season && id === programmeId)
  if (taken) return `Your ${taken[0].toLowerCase()} token is already on ${g.name}.`

  if (!plan?.slots?.[season] && s && !s.tokens.includes(season))
    return `You have no ${season.toLowerCase()} token left.`

  return null
}

/** why this class may not go on the sheet, or null when it may */
export function refuseClass(classId: string, s: SaveGame | null, year: number): string | null {
  const plan = s?.plans?.[year]
  if (plan?.stamped) return 'The wax is on this sheet. Year ' + year + ' is set.'
  const c = classById(classId)
  if (!c) return `Nothing in the catalog is called "${classId}".`
  if (plan?.classes.includes(classId)) return `${c.name} is already on this year's sheet.`
  /* THE TWO-PICK LIMIT IS SCARCITY AND NOT A WIDGET STATE, which is why it says
   * so out loud instead of the pick button quietly disappearing. */
  if ((plan?.classes.length ?? 0) >= 2)
    return 'Two focus classes a year. Drop one before you add another.'
  if (!c.years.includes(year)) return `${c.name} is not open to you in year ${year}.`
  /* THE PREREQUISITE LADDER IS NOT CHECKED HERE and that is deliberate: it needs
   * every year's picks, not this year's, and `eligibleClasses` in the catalog
   * already computes it for the menu. What is refused here is what one year's
   * sheet can see for itself. */
  return null
}
