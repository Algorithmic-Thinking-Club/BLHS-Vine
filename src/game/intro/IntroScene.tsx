import { useCallback, useEffect, useRef, useState } from 'react'
import BeachIso, { type BeachStage } from '../BeachIso'
import { CutsceneRuntime } from '../cutscene/runtime'
import { CutsceneOverlay } from '../cutscene/CutsceneOverlay'
import { introI1I2 } from './introScript'
import { I3Session } from './I3Session'
import { clearSave, loadSave, writeSave } from '../save'

// dev: ?fresh=1 wipes the save before the scene reads it, so the intro always replays
if (new URLSearchParams(location.search).has('fresh')) clearSave()
import { track } from '../telemetry'
import { GearButton, SettingsPanel } from '../../app/SettingsPanel'

// The intro lives ON the beach — one scene, playable and stageable. A fresh player gets the
// I-1/I-2 cutscene the moment the stage reports ready; a returning one just gets the cove.
// The runtime ticks on the Pixi clock (stage.onTick), so cutscene time never drifts from
// world time, and the overlay + the I-3 parchment session render over the live canvas.

export default function IntroScene() {
  const [rt, setRt] = useState<CutsceneRuntime | null>(null)
  const live = useRef<CutsceneRuntime | null>(null)
  const [, bump] = useState(0)
  // when the intro will play, the scene must NEVER flash the raw beach before the script's
  // black takes over — this cover holds until the runtime's own fade owns the frame
  const willPlayIntro = useRef(!loadSave()?.introDone && (loadSave()?.beat ?? 'intro:i1') === 'intro:i1')
  const [preCover, setPreCover] = useState(willPlayIntro.current)

  // called once per BeachIso boot — StrictMode double-mounts in dev, so each call REPLACES
  // the runtime (the previous stage's world is destroyed; a runtime bound to it drives a ghost)
  const onStage = useCallback((stage: BeachStage) => {
    const runtime = new CutsceneRuntime(stage)
    stage.onTick((ms) => runtime.tick(ms))
    live.current = runtime
    setRt(runtime)
    // resume-at-beat (§7.7): a refresh after finishing I-3 lands in free roam at the beach,
    // not back at the wake-up — the local save is the resume truth until the backend lands
    const save = loadSave()
    const beat = save?.beat ?? 'intro:i1'
    if (!save?.introDone && beat === 'intro:i1') {
      track('cutscene_start', { id: 'intro' })
      runtime.play(introI1I2, () => {
        writeSave({ beat: 'intro:i4' })
        track('cutscene_complete', { id: 'intro-i1-i2' })
      })
      // hand the black frame from the pre-cover to the script's own fade, seamlessly
      window.setTimeout(() => setPreCover(false), 400)
    } else {
      setPreCover(false)
    }
  }, [])

  useEffect(() => rt?.subscribe(() => bump((v) => v + 1)), [rt])

  const uiGate = rt?.ui.uiGate?.id ?? null
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inCutscene = rt?.ui.active ?? false

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <BeachIso onStage={onStage} />
      {rt && (
        <CutsceneOverlay rt={rt}>
          {uiGate === 'i3-session' && (
            <I3Session
              onDone={(r) => {
                writeSave({ handle: r.handle, pronouns: r.pronouns, boatName: r.boatName, thorLook: r.thorLook, beat: 'intro:i4' })
                rt.resolveUi('i3-session')
              }}
            />
          )}
        </CutsceneOverlay>
      )}
      {/* the in-world settings gear (§4.7) — tucked away while a cutscene holds the frame */}
      {!inCutscene && <GearButton onClick={() => setSettingsOpen(true)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {preCover && <div style={{ position: 'absolute', inset: 0, background: '#05070a', zIndex: 60 }} />}
    </div>
  )
}
