// what the objective panel is saying: the island outranks the scene, and the scene outranks the year

let said: string | null = null
let world: string | null = null
/* the last shot of the year, raised for the length of the departure */
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
