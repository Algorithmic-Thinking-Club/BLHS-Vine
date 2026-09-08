// one timing convention for both study arms: from an item becoming answerable to the first answer

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
