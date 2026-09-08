// where a scene publishes the cutscene it is running so the overlay can draw it, one at a time
import type { CutsceneRuntime } from './runtime'

let live: CutsceneRuntime | null = null
const listeners = new Set<(rt: CutsceneRuntime | null) => void>()

const announce = () => { for (const fn of listeners) fn(live) }

/** a scene takes the stage. Returns the handle that gives it back. */
export function publishRuntime(rt: CutsceneRuntime): () => void {
  if (live && live !== rt) console.warn('[stage-bus] a second cutscene runtime replaced one that was still published')
  live = rt
  announce()
  return () => {
    if (live !== rt) return
    live = null
    announce()
  }
}

export const liveRuntime = () => live

export function onRuntime(fn: (rt: CutsceneRuntime | null) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
