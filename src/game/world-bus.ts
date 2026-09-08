/* who currently owns the player's input, counted so the release order stops mattering */

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
    /* releasing twice is normal, and the second call does nothing */
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
