/* THE OVERLAY, ON EVERY WORLD SCENE.
 *
 * `CutsceneOverlay` has only ever been mounted by `IntroScene`, wrapped around the
 * beach, which is why the beach is the only place in the game a cutscene could be
 * seen. This mounts it from the world HUD instead, driven by whatever scene has
 * published a runtime, so a painted map gets letterbox, vignette, fades, captions,
 * the prompt plaque and hold-to-skip without knowing any of them exist.
 *
 * It renders nothing at all when no runtime is published, which is nearly always.
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
