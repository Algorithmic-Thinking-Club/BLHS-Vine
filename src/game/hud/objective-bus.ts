// what the objective panel is saying: the island outranks the scene, and the scene outranks the year

let said: string | null = null
let world: string | null = null
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

/** subscribe. The current value is read by the caller; this only says "changed". */
export function onObjectiveSaid(f: () => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}
