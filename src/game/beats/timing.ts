// one timing convention for both study arms: from an item becoming answerable to the first answer

/** the name of the convention, carried on the events so an export says which meaning a row is in */
export const LATENCY_CONVENTION = 'first-answer'

/** stamp the first answer on an item, and later answers on the same item do not move it */
export function markFirst(stamps: Record<string, number>, id: string, now = Date.now()): void {
  if (stamps[id] === undefined) stamps[id] = now
}

/** an item with no stamp reports the time up to now rather than zero */
export function latencyOf(t0: number, stamps: Record<string, number>, id: string, now = Date.now()): number {
  return (stamps[id] ?? now) - t0
}
