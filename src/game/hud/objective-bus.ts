/* WHAT THE PANEL AT THE TOP OF THE SCREEN IS SAYING, AND WHO GETS TO SAY IT.
 *
 * BRIEF-MAW-RAIL-3 A, Ash after playing rail-2: *"A panel at the top centre of
 * the screen that says the current objective at every moment, during cutscenes
 * AND normal play. One short imperative, nothing else. It reads `nextObjective`
 * outside a cutscene and the cutscene's own current step inside one (the island
 * sets it with a word, `objective("Follow the principal"), so a member can
 * too)."*
 *
 * So there are three voices and they have a fixed order:
 *
 *   1  THE ISLAND, through the `objective` word. It outranks everything, because
 *      inside a cutscene the year's own state machine is describing a step the
 *      student is being walked past rather than the one he is looking at.
 *   2  THE SCENE, for the one thing only the scene knows: he is on the water
 *      holding the tiller, and the sentence is about the sea. It used to be said
 *      by the plaque over his head and that plaque is gone.
 *   3  THE YEAR, `run/objective.ts`, which has computed this sentence since the
 *      day it was written.
 *
 * WHY A BUS AND NOT A PROP. The three writers are a python worker, a Pixi scene
 * and a pure function over the save, and the reader is one React component that
 * mounts and unmounts underneath all of them. `stage-bus`, `world-bus` and
 * `cinema` are the same shape for the same reason.
 *
 * THE ISLAND'S LINE CANNOT BE LEFT ON. It is cleared when the bars come down
 * (`intent-engine.movie`) and when a scene is torn down, for the reason the
 * movie ceiling exists: a sentence about a step that finished four minutes ago
 * is worse than no sentence, because a student steering by it is being steered
 * wrong.
 */

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
