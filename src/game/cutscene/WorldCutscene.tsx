/* mounts the cutscene overlay for whatever scene has published a runtime, and nothing otherwise */
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
