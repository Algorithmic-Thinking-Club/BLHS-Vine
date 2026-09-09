// what the objective panel is saying: the island outranks the scene, and the scene outranks the year

let said: string | null = null
let world: string | null = null
/* ---- THE LAST SHOT OF THE YEAR (Ash, 2026-09-09) --------------------------
 *
 * `end_run` raises this for the length of the departure. The year's own sentence
 * for a closed run is "Year one is done. Look around.", and it drew across the
 * top of the ship leaving, over a student who was leaving and had nothing left
 * to look at.
 *
 * IT IS STATE ON THIS BUS AND NOT A MARK ON THE DOCUMENT, which was the first
 * try and did not work: the panel reads its sentence when something on this bus
 * changes, and handing the sentence back to the year is a no-op when the island
 * was not holding it, so nothing re-rendered and the bar sat there. */
let ending = false
const subs = new Set<() => void>()

const fire = () => { for (const s of [...subs]) { try { s() } catch (e) { console.error('[objective] a listener threw', e) } } }

/** what the island said, or null when it is not talking */
export const objectiveSaid = (): string | null => said

/** what the scene says when it knows something the year does not */
export const worldObjective = (): string | null => world

/** the `objective(text)` word. null hands the panel back to the year. */
export function setObjectiveSaid(text: string | null) {
  const v = text && text.trim() ? text.trim() : null
  if (v === said) return
  said = v
  fire()
}

/** the scene's own sentence, for the water. Same shape, lower rank. */
export function setWorldObjective(text: string | null) {
  const v = text && text.trim() ? text.trim() : null
  if (v === world) return
  world = v
  fire()
}

/** is the run in its last shot, where the panel is furniture and says nothing */
export const runEnding = (): boolean => ending

/** raised by `end_run` for the departure, and dropped when the title takes over */
export function setRunEnding(on: boolean) {
  if (on === ending) return
  ending = on
  fire()
}

/** subscribe. The current value is read by the caller; this only says "changed". */
export function onObjectiveSaid(f: () => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}
