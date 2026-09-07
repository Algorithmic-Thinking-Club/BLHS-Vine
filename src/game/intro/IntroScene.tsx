import { useCallback, useEffect, useRef, useState } from 'react'
import BeachIso, { type BeachStage } from '../BeachIso'
import { CutsceneRuntime } from '../cutscene/runtime'
import { CutsceneOverlay } from '../cutscene/CutsceneOverlay'
import { introI1I2 } from './introScript'
import { I3Session } from './I3Session'
import { loadSave, writeSave } from '../save'
// (?fresh=1 is handled ONCE at boot in main.tsx, gated to dev/captain — a module-level wipe
// here ran on every prod load that carried the param and erased real runs)
import { track } from '../telemetry'
import { GearButton, SettingsPanel } from '../../app/SettingsPanel'
import { Hud } from '../hud/Hud'
import { HelpButton } from '../hud/Help'
import { useNav } from '../../app/SceneManager'
import { SEA_ARRIVAL, enterMap } from '../pmap/route'
import { warmMap } from '../pmap/warm'
import { setCinema } from '../stage/cinema'

// The intro lives ON the beach — one scene, playable and stageable. A fresh player gets the
// I-1/I-2 cutscene the moment the stage reports ready; a returning one just gets the cove.
// The runtime ticks on the Pixi clock (stage.onTick), so cutscene time never drifts from
// world time, and the overlay + the I-3 parchment session render over the live canvas.

export default function IntroScene() {
  const [rt, setRt] = useState<CutsceneRuntime | null>(null)
  const live = useRef<CutsceneRuntime | null>(null)
  const [, bump] = useState(0)
  const nav = useNav()
  const navRef = useRef(nav)
  useEffect(() => { navRef.current = nav }, [nav])
  // when the intro will play, the scene must NEVER flash the raw beach before the script's
  // black takes over — this cover holds until the runtime's own fade owns the frame.
  // ANY unfinished intro replays (not just beat intro:i1): a refresh mid-intro used to fall
  // into free roam with no path to the ship — a permanent soft-lock. The replay is quick for
  // a resumed student because the I-3 gate auto-resolves from the saved identity below.
  const willPlayIntro = useRef(!loadSave()?.introDone)
  const [preCover, setPreCover] = useState(willPlayIntro.current)

  // called once per BeachIso boot — StrictMode double-mounts in dev, so each call REPLACES
  // the runtime (the previous stage's world is destroyed; a runtime bound to it drives a ghost)
  const onStage = useCallback((stage: BeachStage) => {
    const runtime = new CutsceneRuntime(stage)
    stage.onTick((ms) => runtime.tick(ms))
    live.current = runtime
    setRt(runtime)
    // the scene stands its interactables down while the runtime owns the frame
    runtime.subscribe(() => stage.call('setHeld', { on: runtime.ui.active }))
    // resume-at-beat (§7.7): an unfinished intro ALWAYS replays the script (the saved
    // identity fast-forwards I-3), because the free-roam beach has no path to the ship —
    // landing there mid-intro stranded the run permanently
    const save = loadSave()
    if (!save?.introDone) {
      track('cutscene_start', { id: 'intro' })
      runtime.play(introI1I2, () => {
        /* THE WHOLE BEACH ACT IS DONE (I-1..I-5) and the ship is in open water.
         *
         * THE MAP SWITCH (I-6): the BLHS Islands painting covers the load and the
         * ONE OCEAN takes over. It used to be the tile island map, which the
         * walkthrough's §3.0 ruled dead in August and which a student pressing
         * Continue still landed on as late as yesterday: tile palms and a
         * Principal Panther line, on a map nothing else in the game reads.
         *
         * §3.0 is Ash's ruling of 2026-08-28 and it is one sentence: one ocean is
         * the world and every map is a painting placed on it. So the cover lifts
         * on the ocean off the published hub, with Thor aboard, the camera out at
         * sailing scale and the tiller his. `aboard` is the whole of the request;
         * `route.ts` is where the address is spelled and `PmapScene`'s
         * `arriveAboard` is where it is performed.
         *
         * introDone flips true here, so from now on Continue lands in the Maw,
         * not on the beach. */
        writeSave({ beat: 'sea:arrive', introDone: true })
        track('cutscene_complete', { id: 'intro-beach-act' })
        track('sail_started')
        /* the address goes down WITH the navigation and never without it, because
         * PmapScene reads its target off the url at mount (route.ts says why) */
        const go = navRef.current?.go
        /* THE FRAME GOES UP BEFORE THE COVER DOES, so there is no frame of the
         * corner showing between the transition lifting and the island saying
         * `movie(True)`. Ash, watching it: "there can sometimes be a flash,
         * where i can see the three buttons on the top right." The crossing is
         * a watched stretch from the moment this button is pressed, and this is
         * the one line in the game that knows that. */
        setCinema(true)
        if (go) enterMap(go, SEA_ARRIVAL, { kind: 'scene', image: '/art/ui/loading-islands.png', title: 'THE BLHS ISLANDS', holdMs: 2600 })
      })
      /* AND THE HUB COMES DOWN WHILE HE IS STILL ON THE BEACH.
       *
       * BRIEF-ARRIVAL measured the crossing's cover at fourteen seconds of
       * black, and nearly all of it is one bundle download that could have
       * happened during the two minutes of the opening. This asks for it now;
       * `warmMap` is quiet, sequential and cannot fail loudly, so the beach is
       * unchanged whether it finishes, half finishes or never starts. */
      void warmMap(SEA_ARRIVAL.map)
      // hand the black frame from the pre-cover to the script's own fade, seamlessly
      window.setTimeout(() => setPreCover(false), 400)
    } else {
      setPreCover(false)
    }
  }, [])

  useEffect(() => rt?.subscribe(() => bump((v) => v + 1)), [rt])

  const uiGate = rt?.ui.uiGate?.id ?? null

  // a resumed student already answered the parchment (beat intro:i4): the I-3 gate resolves
  // itself from the saved identity instead of re-asking, so the replay fast-forwards to the
  // port walk — this is what makes "any unfinished intro replays" cheap for the student
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
                // castaway rides the save too — net.ts keys the demo-stays-local rule on it
                writeSave({ handle: r.handle, pronouns: r.pronouns, boatName: r.boatName, thorLook: r.thorLook, castaway: r.castaway, beat: 'intro:i4' })
                rt.resolveUi('i3-session')
              }}
            />
          )}
        </CutsceneOverlay>
      )}
      {/* free roam carries the real HUD (§11.1) + pause; the gear stays for muscle memory */}
      {!inCutscene && <Hud onBlurWorld={setBlurred} />}
      {/* AND THE QUESTION MARK, THROUGH THE CUTSCENE AS WELL. Ash, 2026-09-06:
          "the help button should also show on the beach map cutscene part too."
          The corner is the run's furniture and stands down for a cutscene; this
          is the one control that answers "I do not know what is happening", and
          the beach opening is the first two minutes of the game, which is where
          that question gets asked. It is the same component the painted maps
          mount, so there is one question mark in the game and not two. */}
      <HelpButton />
      {!inCutscene && <GearButton onClick={() => setSettingsOpen(true)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {preCover && <div style={{ position: 'absolute', inset: 0, background: '#05070a', zIndex: 60 }} />}
    </div>
  )
}
