/* when a year's schedule is finished, and what is still missing when it is not */

export type ScheduleOwed = {
  /** an elective period is still empty */
  owesClass: boolean
  /** nothing after school and there is a real club or sport to join */
  owesActivity: boolean
  /** the plank may end the beat */
  ready: boolean
  /* WHICH BOX IS LIT, and the schedule comes first: the page is read top to
   * bottom and the periods are at the top of it, so a lit box further down would
   * be the screen pointing away from the thing a student is looking at. */
  stage: 'schedule' | 'after' | 'go'
  /* THE REASON ON THE BUTTON, ALWAYS, because §40.9's rule is that a disabled
   * control a student cannot interrogate is worse than one that answers. Null
   * when the plank is live, which is when there is nothing to say. */
  notYet: string | null
}

/* HOW MANY ELECTIVE PERIODS A YEAR HAS. Two, which is the number of blank rows
 * `PickYear` draws and the number `refuseClass` stops a third pick at, and the
 * three of them have to agree or the sheet asks for a row it does not have. */
export const ELECTIVES_OWED = 2

/* HOW MANY AFTER-SCHOOL SEASONS A YEAR HAS, and it is the count of season tokens a
 * run starts each year with. Held here as a number the gate can compare against so
 * this file does not have to import the save. */
export const SEASONS_OWED = 3

export function scheduleOwed(n: {
  /** how many of this year's elective periods are still blank (0, 1 or 2) */
  electivesLeft: number
  /** how many after-school slots this year's sheet has filled */
  chosen: number
  /** how many electives on offer have a playable island behind them */
  realClasses: number
  /** how many clubs and sports on offer have one */
  realActivities: number
  /* ---- HOW MANY SEASONS THIS SCREEN CAN ACTUALLY FILL ---------------------
   *
   * Not always three, and getting this wrong made year one unstampable. A year hands
   * out three season tokens, but one programme may not take two seasons, so filling
   * three needs three DIFFERENT programmes the student is allowed to press. The year
   * one screen draws a club with no island as an example and refuses the press, so
   * with one island built it can offer exactly one. Asking it for three there is
   * asking for something the screen cannot give, and a student reads a stamp that
   * will not go live with nothing on the page explaining why.
   *
   * So the gate asks for every seat that is really on offer, up to the three the year
   * holds. The day ATC ships a second island the same number goes to two on its own,
   * and nothing here has to be edited. */
  seats?: number
}): ScheduleOwed {
  /* both elective periods are always owed, whether or not an island exists behind one */
  const owesClass = n.electivesLeft > 0
  /* ---- EVERY SEASON, NOT ONE OF THEM (Ash) ------------------------------
   *
   * *"How many clubs does a user have to do a year? Whatever number that is, he has
   * to choose that number before stamping."*
   *
   * One used to be enough. A year hands out three season tokens, so stamping on one
   * carried two into the stamp and forfeited them, and nothing on the page said so.
   * A student who picked one club and pressed on lost two thirds of his year without
   * being asked. */
  /* every seat on offer, never more than the year holds, and at least one wherever
   * anything is playable at all */
  const seats = Math.max(1, Math.min(SEASONS_OWED, n.seats ?? SEASONS_OWED))
  const seasonsLeft = Math.max(0, seats - n.chosen)
  const owesActivity = n.realActivities > 0 && seasonsLeft > 0
  const ready = !owesClass && !owesActivity
  const stage = owesClass ? 'schedule' : owesActivity ? 'after' : 'go'
  /* WHAT IS MISSING, COUNTED, because Ash asked for the counter to say it and
   * because "Not yet" on its own is a refusal with no way out of it. */
  const notYet = owesClass
    ? `Not yet: fill ${n.electivesLeft > 1 ? 'both Elective periods' : 'the last Elective period'}.`
    : owesActivity
      ? seasonsLeft > 1
        ? `Not yet: pick something for all ${seats} seasons. ${seasonsLeft} still empty.`
        : seats > 1 ? 'Not yet: one season is still empty.'
          : 'Not yet: press one club or sport below.'
      : null
  return { owesClass, owesActivity, ready, stage, notYet }
}
