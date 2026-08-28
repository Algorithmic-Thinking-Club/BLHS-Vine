/* THE WORLD BUS: who currently owns the player's input.
 *
 * The other half of ui-bus.ts. That one carries "open the planner" from the
 * world to the HUD; this one carries "the world is not yours right now" from
 * the HUD back to whatever scene is mounted.
 *
 * It has to be a bus and not a prop because the two live in different component
 * trees: WorldHud is mounted globally by SceneManager and the scene is mounted
 * beside it, so there is no parent holding both. Hud already takes an
 * `onBlurWorld` callback for the visual blur and WorldHud has never passed it.
 *
 * WHY IT COUNTS INSTEAD OF TOGGLING. A cutscene can start while the planner is
 * open, and the planner can be closed from inside a beat. A boolean gets that
 * wrong in one specific way that looks like a bug and is very hard to find: the
 * inner thing finishes, sets the flag false, and the player gets the controls
 * back while a panel is still on screen, so Thor walks off behind it. Counting
 * holds makes the release order stop mattering.
 *
 * THE BUG THIS FIXES, which is live today: PmapScene attaches keydown to window
 * and Walker.step reads that map every frame with nothing in between. Open the
 * year sheet from the chart table and Thor keeps walking underneath it, and the
 * `e` that closed the panel re-fires into the station and opens it again.
 */

export type HoldRelease = () => void

const holds = new Map<symbol, string>()
const listeners = new Set<(held: boolean) => void>()

let lastHeld = false
function announce() {
  const held = holds.size > 0
  if (held === lastHeld) return
  lastHeld = held
  for (const fn of listeners) fn(held)
}

/* Take the controls away. The reason is not decoration: it is what a debug
 * overlay prints when input is stuck, and a stuck input with no name is an
 * afternoon. */
export function holdWorld(reason: string): HoldRelease {
  const key = Symbol(reason)
  holds.set(key, reason)
  announce()
  let released = false
  return () => {
    /* releasing twice is normal, not a mistake: a React effect cleanup can run
     * after the same code path already released on its own. Second call is a
     * no-op rather than a decrement, or the count goes negative and the world
     * unlocks under something that still owns it. */
    if (released) return
    released = true
    holds.delete(key)
    announce()
  }
}

export const worldHeld = () => holds.size > 0

/* what has the controls, for the debug overlay and for a log line when something
 * forgets to let go */
export const worldHolders = () => [...holds.values()]

/* Subscribed scenes are told on change. A scene that mounts while a panel is
 * already open reads worldHeld() once at setup; this is only the edges. */
export function onWorldHold(fn: (held: boolean) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/* Scene teardown. A scene that unmounts mid-hold would otherwise leave the lock
 * on for the next one, and the next one is a black screen you cannot walk out
 * of. Only the shell calls this. */
export function releaseAllWorldHolds() {
  if (!holds.size) return
  console.warn(`[world-bus] releasing stuck holds: ${worldHolders().join(', ')}`)
  holds.clear()
  announce()
}
