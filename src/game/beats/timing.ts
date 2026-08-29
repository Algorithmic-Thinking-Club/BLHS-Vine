// L3: ONE TIMING CONVENTION ACROSS BOTH ARMS, in one file so neither arm can
// quietly mean something else by the same word.
//
// THE CONVENTION
//
//   latencyMs = milliseconds from the moment an item became ANSWERABLE to the
//               student's FIRST answer on it.
//
// Answerable means the check appeared on screen in the game arm, and the form
// rendered in the plain arm, because a form is answerable in any order and every
// item on it is live from the first paint. First answer means the first input that
// touches the item: the first option clicked, the first bucket assigned, the first
// character typed. It is not the button that dismisses the correction and it is
// not submit.
//
// WHAT WAS WRONG, which is the reason this is a module and not a habit. The plain
// form started one clock for the whole page and stamped every item with the same
// elapsed milliseconds at submit, so item three's latency included the time spent
// reading items one and two, and the last item on a long form always looked like
// the hardest one. The game arm stamped at the "Keep going" click, so its number
// included reading the correction, which the plain arm did not show at all. One
// column, one export, two meanings. Every per-item timing comparison between the
// arms was measuring the difference in convention rather than the difference in
// the intervention, and that is the kind of defect that survives to the results
// section.
//
// AND THIS IS NOT A SCORE. 80.7's timing law: the item scores and the body does
// not. Nothing in this file is an input to `scoreOf`, and the palette's scoring
// signature has no third argument for it to become one. Latency is measured
// because dose and time on task are the study's questions; it is never graded,
// because grading it would confound the comparison with reaction time on a machine
// whose input latency nobody has measured.

/** the name of the convention, carried on the events so a reader of the export
 *  never has to guess which of the two old meanings a row is in */
export const LATENCY_CONVENTION = 'first-answer'

/** stamp the first answer on an item. Later answers on the same item do not move
 *  it, which is the whole of "first": a student who changes their mind on a form
 *  has not just started reading the question. */
export function markFirst(stamps: Record<string, number>, id: string, now = Date.now()): void {
  if (stamps[id] === undefined) stamps[id] = now
}

/** the convention, applied. An item with no stamp is one the student never
 *  touched, and it reports the time up to now rather than zero, because zero
 *  would read as an instant answer. */
export function latencyOf(t0: number, stamps: Record<string, number>, id: string, now = Date.now()): number {
  return (stamps[id] ?? now) - t0
}
