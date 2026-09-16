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

/* take the controls away, with a reason a debug overlay can print when input is stuck */
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

/* what has the controls, for the debug overlay and for a log line */
export const worldHolders = () => [...holds.values()]

/* subscribed scenes are told on change, and a scene that mounts mid-hold reads worldHeld once */
export function onWorldHold(fn: (held: boolean) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/* scene teardown, called only by the shell, so a lock never carries into the next scene */
export function releaseAllWorldHolds() {
  if (!holds.size) return
  console.warn(`[world-bus] releasing stuck holds: ${worldHolders().join(', ')}`)
  holds.clear()
  announce()
}
