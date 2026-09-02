/* THE OVERLAY, ON EVERY WORLD SCENE.
 *
 * `CutsceneOverlay` has only ever been mounted by `IntroScene`, wrapped around the
 * beach, which is why the beach is the only place in the game a cutscene could be
 * seen. This mounts it from the world HUD instead, driven by whatever scene has
 * published a runtime, so a painted map gets letterbox, vignette, fades, captions,
 * the prompt plaque and hold-to-skip without knowing any of them exist.
 *
 * It renders nothing at all when no runtime is published, which is nearly always.
 *
 * IT AND `hud/Dialogue.tsx` ARE MOUNTED SIDE BY SIDE AND ONLY ONE MAY SPEAK.
 * `WorldHud` renders both, and until 2026-09-01 neither knew the other existed,
 * so a station line arriving while a script was running drew two paper boxes on
 * the same pixels with two plaques and two advance rules. The arbiter is in
 * `Dialogue`, on purpose and not here: this component is a mount for whatever
 * scene took the stage and has no business knowing about the world's queue,
 * while the world's queue is the thing that has to WAIT. A cutscene holds the
 * controls for its whole length; a station is something a student walked up to
 * and can walk up to again.
 */
import { useEffect, useState } from 'react'
import { CutsceneOverlay } from './CutsceneOverlay'
import { liveRuntime, onRuntime } from './stage-bus'
import type { CutsceneRuntime } from './runtime'

export function WorldCutscene() {
  const [rt, setRt] = useState<CutsceneRuntime | null>(liveRuntime)
  useEffect(() => onRuntime(setRt), [])
  if (!rt) return null
  return <CutsceneOverlay rt={rt} />
}
