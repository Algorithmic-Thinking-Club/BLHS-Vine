/* WHEN THE SCHEDULE IS FINISHED, AND WHAT IS MISSING WHEN IT IS NOT.
 *
 * ---- THE RULING THIS FILE NOW ANSWERS TO --------------------------------
 *
 * BRIEF-INTRO-FILM section 3, Ash, 2026-09-07, and it OUTRANKS the
 * BRIEF-MAW-RAIL-3 F rule this file was written for: *"Electives are PICKABLE
 * and REQUIRED: two, from the real BLHS elective list (the sourced catalog),
 * because choosing electives is a thing every freshman actually does, and the
 * island behind an elective is what is 'not built yet', not the choice. The
 * plank stays quiet until both periods are filled. Clubs and sports: the
 * placeholder cards stay, inert, and that section is not required until a real
 * club island exists."*
 *
 * So the two halves of this sheet are now ruled DIFFERENTLY, and the difference
 * is real rather than an inconsistency:
 *
 *   AN ELECTIVE IS A COURSE THE SCHOOL RUNS. Spanish I is a true thing about
 *   Bonney Lake whether or not anybody has drawn an island for it, and picking
 *   two of them is the thing every freshman in the building does in February.
 *   It is owed always, and the island is the part that is not built.
 *
 *   A CLUB IN THIS GAME IS AN ISLAND SOMEBODY BUILT. There is no honest name to
 *   print on a card nobody has made, which is why they are Example A to E, and
 *   requiring a student to press a picture of a card is requiring nothing. So
 *   that half stays owed only where there is something real to press, which is
 *   BRIEF-MAW-RAIL-3 F's rule, kept, for the half it was right about.
 *
 * ---- WHY IT IS ITS OWN FILE ----------------------------------------------
 *
 * It was eight lines inside `PickYear.tsx`'s render, which is a rule that can
 * only be tested by mounting a panel, and a rule nobody can test is a rule that
 * quietly stops being true. This is the whole of the decision and nothing else:
 * no roster, no save, no React. `PickYear` counts the four numbers and reads the
 * answer.
 */

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
  /* BOTH PERIODS, ALWAYS, and `realClasses` is deliberately not read here any
   * more. It stays on the argument list because the caller counts it for the
   * after-school half and because deleting a field a member's island writes
   * into would be the third place this ruling has to be found. */
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
