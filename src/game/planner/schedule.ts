/* when a year's schedule is finished, and what is still missing when it is not */

export type ScheduleOwed = {
  /** an elective period is still empty */
  owesClass: boolean
  /** nothing after school and there is a real club or sport to join */
  owesActivity: boolean
  /** the plank may end the beat */
  ready: boolean
  /* which box is lit, and the schedule comes first because the page is read top to bottom with the periods at the top, so a lit box further down points away from what is being read */
  stage: 'schedule' | 'after' | 'go'
  /* why the button is shut, always, since a disabled control a student cannot interrogate is worse */
  notYet: string | null
}

/* how many elective periods a year has: two, the number of blank rows `PickYear` draws and the number `refuseClass` stops a third pick at, and all three have to agree or the sheet asks for a row it does not have */
export const ELECTIVES_OWED = 2

/* how many after-school seasons a year has, and the count of season tokens a run starts each year with, held as a number the gate can compare against so this file does not import the save */
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
  /* not always three: filling three tokens needs three different programmes a student may press, and with one island built the screen offers one, so asking for three made year one unstampable with nothing saying why; the gate asks for every seat really on offer, capped at the three the year holds */
  seats?: number
}): ScheduleOwed {
  /* both elective periods are always owed, whether or not an island exists behind one */
  const owesClass = n.electivesLeft > 0
  /* every season on offer has to be chosen before stamping */
  /* every seat on offer, never more than the year holds, and at least one wherever anything is playable at all */
  const seats = Math.max(1, Math.min(SEASONS_OWED, n.seats ?? SEASONS_OWED))
  const seasonsLeft = Math.max(0, seats - n.chosen)
  const owesActivity = n.realActivities > 0 && seasonsLeft > 0
  const ready = !owesClass && !owesActivity
  const stage = owesClass ? 'schedule' : owesActivity ? 'after' : 'go'
  /* what is missing, counted, because "Not yet" on its own is a refusal with no way out of it */
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
