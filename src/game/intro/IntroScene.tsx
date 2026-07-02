import { useCallback, useEffect, useRef, useState } from 'react'
import BeachIso, { type BeachStage } from '../BeachIso'
import { CutsceneRuntime } from '../cutscene/runtime'
import { CutsceneOverlay } from '../cutscene/CutsceneOverlay'
import { introI1I2 } from './introScript'
import { I3Session } from './I3Session'
import { loadSave, writeSave } from '../save'
import { track } from '../telemetry'

// The intro lives ON the beach — one scene, playable and stageable. A fresh player gets the
// I-1/I-2 cutscene the moment the stage reports ready; a returning one just gets the cove.
// The runtime ticks on the Pixi clock (stage.onTick), so cutscene time never drifts from
// world time, and the overlay + the I-3 parchment session render over the live canvas.

export default function IntroScene() {
  const [rt, setRt] = useState<CutsceneRuntime | null>(null)
  const live = useRef<CutsceneRuntime | null>(null)
  const [, bump] = useState(0)

  // called once per BeachIso boot — StrictMode double-mounts in dev, so each call REPLACES
  // the runtime (the previous stage's world is destroyed; a runtime bound to it drives a ghost)
  const onStage = useCallback((stage: BeachStage) => {
    const runtime = new CutsceneRuntime(stage)
    stage.onTick((ms) => runtime.tick(ms))
    live.current = runtime
    setRt(runtime)
    const save = loadSave()
    if (!save?.introDone) {
      track('cutscene_start', { id: 'intro' })
      runtime.play(introI1I2, () => {
        writeSave({ beat: 'intro:i4' })
        track('cutscene_complete', { id: 'intro-i1-i2' })
      })
    }
  }, [])

  useEffect(() => rt?.subscribe(() => bump((v) => v + 1)), [rt])

  const uiGate = rt?.ui.uiGate?.id ?? null

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <BeachIso onStage={onStage} />
      {rt && (
        <CutsceneOverlay rt={rt}>
          {uiGate === 'i3-session' && (
            <I3Session
              onDone={(r) => {
                writeSave({ handle: r.handle, pronouns: r.pronouns, boatName: r.boatName, beat: 'intro:i4' })
                rt.resolveUi('i3-session')
              }}
            />
          )}
        </CutsceneOverlay>
      )}
    </div>
  )
}
