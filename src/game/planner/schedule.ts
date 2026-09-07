/* WHEN THE SCHEDULE IS FINISHED, AND WHAT IS MISSING WHEN IT IS NOT.
 *
 * BRIEF-MAW-RAIL-3 F, Ash's ruling in full: *"'That is my schedule' works with
 * nothing picked ONLY while nothing real exists. The moment a real island is
 * linked to a slot, that slot is required and the plank stays quiet until it is
 * filled, with the counter saying what is missing. Build the rule and the test
 * now."*
 *
 * ---- WHY IT IS WRITTEN AGAINST WHAT EXISTS AND NOT AGAINST TODAY ----------
 *
 * The obvious version of "the plank works with nothing picked" is a boolean
 * somebody flips the day the first island lands, and the day it lands nobody
 * remembers this file exists. So the rule is: A PICK IS OWED ONLY WHERE THERE IS
 * SOMETHING REAL TO PICK. With an empty roster the schedule asks for nothing and
 * the plank is the way on, because every card on the screen is a picture of a
 * card. With one playable elective it asks for both elective periods again, and
 * with one playable club it asks for the after-school slot again, on its own,
 * with no edit anywhere.
 *
 * ---- WHY IT IS ITS OWN FILE ------------------------------------------------
 *
 * It was eight lines inside `PickYear.tsx`'s render, which is a rule that can
 * only be tested by mounting a panel, and a rule nobody can test is a rule that
 * quietly stops being true. This is the whole of the decision and nothing else:
 * no roster, no save, no React. `PickYear` counts the four numbers and reads the
 * answer.
 */

export type ScheduleOwed = {
  /** an elective period is empty and there is a real elective to put in it */
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
  const owesClass = n.realClasses > 0 && n.electivesLeft > 0
  const owesActivity = n.realActivities > 0 && n.chosen === 0
  const ready = !owesClass && !owesActivity
  const stage = owesClass ? 'schedule' : owesActivity ? 'after' : 'go'
  const notYet = owesClass
    ? `Not yet: fill ${n.electivesLeft > 1 ? 'both Elective periods' : 'the last Elective period'}.`
    : owesActivity
      ? 'Not yet: press one club or sport below.'
      : null
  return { owesClass, owesActivity, ready, stage, notYet }
}
