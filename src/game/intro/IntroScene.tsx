import { useCallback, useEffect, useRef, useState } from 'react'
import BeachIso, { type BeachStage } from '../BeachIso'
import { CutsceneRuntime } from '../cutscene/runtime'
import { CutsceneOverlay } from '../cutscene/CutsceneOverlay'
import { introI1I2 } from './introScript'
import { I3Session } from './I3Session'
import { loadSave, writeSave } from '../save'
// ?fresh=1 is handled once at boot in main.tsx and gated to dev/captain, because a module-level wipe here ran on every prod load that carried the param and erased real runs
import { track } from '../telemetry'
import { GearButton, SettingsPanel } from '../../app/SettingsPanel'
import { Hud } from '../hud/Hud'
import { HelpButton } from '../hud/Help'
import { useNav } from '../../app/SceneManager'
import { SEA_ARRIVAL, enterMap } from '../pmap/route'
import { warmMap } from '../pmap/warm'
import { setCinema } from '../stage/cinema'

// the intro plays on the beach itself, with the cutscene runtime ticking on the Pixi clock

export default function IntroScene() {
  const [rt, setRt] = useState<CutsceneRuntime | null>(null)
  const live = useRef<CutsceneRuntime | null>(null)
  const [, bump] = useState(0)
  const nav = useNav()
  const navRef = useRef(nav)
  useEffect(() => { navRef.current = nav }, [nav])
// an unfinished intro always replays, and this cover holds until the script's own fade starts
  const willPlayIntro = useRef(!loadSave()?.introDone)
  const [preCover, setPreCover] = useState(willPlayIntro.current)

  // called once per BeachIso boot, and StrictMode double-mounts in dev, so each call replaces the runtime: the previous stage's world is destroyed and a runtime bound to it drives a ghost
  const onStage = useCallback((stage: BeachStage) => {
    const runtime = new CutsceneRuntime(stage)
    stage.onTick((ms) => runtime.tick(ms))
    live.current = runtime
    setRt(runtime)
    // the scene stands its interactables down while the runtime owns the frame
    runtime.subscribe(() => stage.call('setHeld', { on: runtime.ui.active }))
    // an unfinished intro always replays the script and the saved identity fast-forwards I-3, because the free-roam beach has no path to the ship and landing there mid-intro stranded the run permanently
    const save = loadSave()
    if (!save?.introDone) {
      track('cutscene_start', { id: 'intro' })
      runtime.play(introI1I2, () => {
        /* the beach act is over: the intro is marked done and the ship crosses to the hub */
        writeSave({ beat: 'sea:arrive', introDone: true })
        track('cutscene_complete', { id: 'intro-beach-act' })
        track('sail_started')
        /* the address goes down with the navigation and never without it, because PmapScene reads its target off the url at mount, and route.ts says why */
        const go = navRef.current?.go
        /* the movie frame goes up before the cover lifts, so the corner never flashes */
        setCinema(true)
        if (go) enterMap(go, SEA_ARRIVAL, { kind: 'scene', image: '/art/ui/loading-islands.png', title: 'THE BLHS ISLANDS', holdMs: 2600 })
      })
      /* the hub's bundle is fetched quietly while he is still on the beach */
      void warmMap(SEA_ARRIVAL.map)
      // hand the black frame from the pre-cover to the script's own fade, seamlessly
      window.setTimeout(() => setPreCover(false), 400)
    } else {
      setPreCover(false)
    }
  }, [])

  useEffect(() => rt?.subscribe(() => bump((v) => v + 1)), [rt])

  const uiGate = rt?.ui.uiGate?.id ?? null

  // a resumed student already answered the parchment at beat intro:i4, so the I-3 gate resolves itself from the saved identity instead of re-asking and the replay fast-forwards to the port walk
  useEffect(() => {
    if (uiGate !== 'i3-session' || !rt) return
    const s = loadSave()
    if (s && !s.introDone && s.beat === 'intro:i4' && s.handle) rt.resolveUi('i3-session')
  }, [uiGate, rt])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [blurred, setBlurred] = useState(false)
  const inCutscene = rt?.ui.active ?? false

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0 }} className={blurred ? 'hud-blur' : undefined}>
        <BeachIso onStage={onStage} />
      </div>
      {rt && (
        <CutsceneOverlay rt={rt}>
          {uiGate === 'set-sail' && (
            <div className="i5-setsail">
              <button
                className="i3-plank i5-plank"
                onClick={() => { track('sail_confirmed'); rt.resolveUi('set-sail') }}
              >Set Sail</button>
            </div>
          )}
          {uiGate === 'i3-session' && (
            <I3Session
              onDone={(r) => {
                // castaway rides the save too, because net.ts keys the demo-stays-local rule on it
                writeSave({ handle: r.handle, pronouns: r.pronouns, boatName: r.boatName, thorLook: r.thorLook, castaway: r.castaway, beat: 'intro:i4' })
                rt.resolveUi('i3-session')
              }}
            />
          )}
        </CutsceneOverlay>
      )}
      {/* free roam carries the real HUD (§11.1) + pause; the gear stays for muscle memory */}
      {!inCutscene && <Hud onBlurWorld={setBlurred} />}
      {/* the help button stays through the cutscene, since that is when the question is asked */}
      <HelpButton />
      {!inCutscene && <GearButton onClick={() => setSettingsOpen(true)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {preCover && <div style={{ position: 'absolute', inset: 0, background: '#05070a', zIndex: 60 }} />}
    </div>
  )
}
