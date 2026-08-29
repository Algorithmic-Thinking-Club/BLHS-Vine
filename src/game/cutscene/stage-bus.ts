/* WHICH SCENE IS DIRECTING, AND WHO DRAWS THE LETTERBOX.
 *
 * The cutscene runtime is stage-agnostic already: it ticks on the host scene's own
 * clock and delegates every world-touching step to a `CutsceneStage`. What it has
 * never had is a way for a scene that is NOT the beach to get its overlay on
 * screen. `IntroScene` builds a runtime, wraps `<BeachIso>` in `<CutsceneOverlay>`
 * and passes the stage down by prop, which works exactly once, for one scene, in
 * one component tree.
 *
 * A painted map is Pixi inside a div and the overlay is React mounted beside it by
 * `SceneManager`, so there is no parent holding both. That is the same problem
 * `dialogue.ts` and `ui-bus.ts` already solve, and this is the same answer: the
 * scene publishes its runtime here, `WorldCutscene` renders whatever is published,
 * and neither knows the other exists.
 *
 * ONE AT A TIME, on purpose. Two cutscenes running at once is two scripts fighting
 * over the letterbox and the controls, and a second `publish` while one is live is
 * a bug in the caller rather than a case to support. It replaces, loudly.
 */
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
