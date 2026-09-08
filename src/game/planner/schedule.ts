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

export function scheduleOwed(n: {
  /** how many of this year's elective periods are still blank (0, 1 or 2) */
  electivesLeft: number
  /** how many after-school slots this year's sheet has filled */
  chosen: number
  /** how many electives on offer have a playable island behind them */
  realClasses: number
  /** how many clubs and sports on offer have one */
  realActivities: number
}): ScheduleOwed {
  /* both elective periods are always owed, whether or not an island exists behind one */
  const owesClass = n.electivesLeft > 0
  const owesActivity = n.realActivities > 0 && n.chosen === 0
  const ready = !owesClass && !owesActivity
  const stage = owesClass ? 'schedule' : owesActivity ? 'after' : 'go'
  /* WHAT IS MISSING, COUNTED, because Ash asked for the counter to say it and
   * because "Not yet" on its own is a refusal with no way out of it. */
  const notYet = owesClass
    ? `Not yet: fill ${n.electivesLeft > 1 ? 'both Elective periods' : 'the last Elective period'}.`
    : owesActivity
      ? 'Not yet: press one club or sport below.'
      : null
  return { owesClass, owesActivity, ready, stage, notYet }
}
