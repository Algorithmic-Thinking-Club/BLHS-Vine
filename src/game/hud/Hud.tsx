import { useEffect, useState, type ReactNode } from 'react'
import { Handbook } from './Handbook'
import { SettingsPanel } from '../../app/SettingsPanel'
import { Planner } from '../planner/Planner'
import { Graduation } from '../run/Graduation'
import { CoreBeatRunner } from '../beats/ActivityRunner'
import { coreBeatFor, coreBeatId } from '../beats/beats'
import { classBeat } from '../beats/classes'
import { classById } from '../planner/catalog'
import type { CoreBeat } from '../beats/frames'
import { Wardrobe } from './Wardrobe'
import { Yearbook } from '../run/Yearbook'
import { YearStart } from '../run/YearStart'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { track } from '../telemetry'
import { onBeatRequest, onUiRequest } from '../ui-bus'
import { onWorldHold, worldHeld } from '../world-bus'
import { panelDepth, usePanel } from '../ui/a11y'
import './hud.css'

/* WHAT A BEAT ID RESOLVES TO. World code names a beat as a string, the way a
 * grape will, and this is the only place a string becomes a CoreBeat. Y4's is
 * generated from the live save, so it has to be asked for rather than looked up
 * in a table, which is exactly why coreBeatFor takes the save. */
function beatById(id: string, s: ReturnType<typeof loadSave>): CoreBeat | null {
  if (!s) return null
  for (let y = 1; y <= 4; y++) if (id === coreBeatId(y)) return coreBeatFor(y, s)
  const cls = classById(id.replace(/^class:/, ''))
  return cls ? classBeat(cls, s.year) : null
}

/* the grade a beat actually landed, read off the ledger rather than passed
 * around, because the ledger is what recordGrade wrote and what the GPA sees */
function gradeFromLedger(beatId: string): number | null {
  const e = loadSave()?.ledger.find((x) => x.id === beatId)
  return e ? e.grade : null
}

// The diegetic HUD (§11.1): corner compass (the chart), the Handbook spine, and the
// season tokens while unspent. NOTHING else floats. Esc pauses (§4.8): the world blurs,
// a small anchor panel — saves happen anyway, the button is reassurance.
// The HUD is also the mount point every sit-down UI opens through: world code (any
// lane's POI or cutscene) calls requestUi('planner'|'handbook'|...) on the ui-bus and
// the HUD answers — the Maw's chart table opens the SAME planner the token pips do.

export function Hud({ onBlurWorld }: { onBlurWorld?: (b: boolean) => void }) {
  const nav = useNav()
  const [book, setBook] = useState<null | 'chart' | 'islands'>(null)
  const [planner, setPlanner] = useState(false)
  const [advisory, setAdvisory] = useState(false)
  const [sitClass, setSitClass] = useState<string | null>(null)
  const [yearbook, setYearbook] = useState(false)
  const [graduation, setGraduation] = useState(false)
  const [paused, setPaused] = useState(false)
  const [settings, setSettings] = useState(false)
  const [wardrobe, setWardrobe] = useState(false)
  /* a beat world code asked for, and the callback waiting for its grade */
  const [playing, setPlaying] = useState<null | { beat: CoreBeat; plain: boolean; done: (g: number | null) => void }>(null)
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  /* IS THE WORLD ACTUALLY QUIET. The vignette's own rule has always been "only
   * while the world is quiet" and it only ever checked this component's own
   * panels, so a station mid-sentence or a cutscene mid-shot counted as quiet and
   * the year's opening lines mounted straight over the top of them. Measured on
   * the Maw stand-in: the founding cutscene's second line and the year-one
   * vignette were on screen at once, in two boxes, in the same corner.
   *
   * world-bus.ts already knows the answer for every case at once, which is the
   * whole reason it counts holds rather than toggling a boolean. */
  const [held, setHeld] = useState(worldHeld)
  useEffect(() => { setHeld(worldHeld()); return onWorldHold(setHeld) }, [])
  const s = loadSave()

  const anyOpen = book !== null || planner || settings || advisory || sitClass !== null
    || yearbook || graduation || wardrobe || playing !== null

  /* Esc = pause, only while nothing else owns the frame (the planner eats its own Esc).
   *
   * ESCAPE CLOSES THE INNERMOST THING, and this used to be the only rule about
   * it: one handler here that knew which of its own panels were open and closed
   * whichever it recognised. A panel it did not know about, a station's dialogue
   * or a member's grape, would have had Escape pause the game underneath it. The
   * panels that open through `usePanel` now answer for themselves on the capture
   * phase, so this only ever runs when no panel is up at all. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (panelDepth() > 0) return                                            // a panel is on top and has already answered
      if (planner || advisory || sitClass || yearbook || graduation) return   // the sheet eats its own Esc; a beat never Esc-quits
      setPaused((p) => { onBlurWorld?.(!p); return !p })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [planner, advisory, sitClass, yearbook, graduation, onBlurWorld])

  // the ui-bus: the world's diegetic stations open these same panels (ui-bus.ts)
  useEffect(() => onUiRequest((which) => {
    setPaused(false)
    if (which === 'planner') { track('planner_requested', { via: 'world' }); setPlanner(true); onBlurWorld?.(true) }
    if (which === 'advisory') { setAdvisory(true); onBlurWorld?.(true) }
    if (which === 'handbook') { setBook('islands'); onBlurWorld?.(true) }
    if (which === 'chart') { track('chart_opened'); setBook('chart'); onBlurWorld?.(true) }
    if (which === 'wardrobe') { track('wardrobe_opened', { via: 'world' }); setWardrobe(true); onBlurWorld?.(true) }
    if (which === 'settings') { setSettings(true) }
    /* THE SIXTH DOOR, and the page had exactly one before it: a button inside the
     * planner that only appears while THIS year is closable. So a student could
     * not look at year one the moment year one ended, and no island and no
     * station could ever send them to their own book. `open('yearbook')` is a
     * word a member's Python can already say. */
    if (which === 'yearbook') { track('yearbook_opened', { via: 'world' }); setYearbook(true); onBlurWorld?.(true) }
  }), [onBlurWorld])

  /* A SCORED ACTIVITY ASKED FOR BY WORLD CODE, WITH ITS GRADE COMING BACK.
   *
   * The Maw's hearth yields `{kind:'play', beat:'core:y1'}` and waits for the
   * number. Same call a grape's `score = yield self.play(DebugRace)` will make,
   * so it is here from the first station rather than invented for the first
   * island. The runner is the existing two-arm one, so the plain study arm is
   * honoured by construction and not by a second code path. */
  useEffect(() => onBeatRequest((req) => {
    setPaused(false)
    const beat = beatById(req.beat, s)
    /* REFUSED, NOT ANSWERED NULL. A beat id nobody knows is a typo in somebody's
     * island, and a null grade told them it had worked. */
    if (!beat) { req.refuse(`no activity called "${req.beat}"`); return }
    onBlurWorld?.(true)
    setPlaying({ beat, plain: req.plain, done: req.done })
  }), [onBlurWorld, s])

  const openBook = (tab: 'chart' | 'islands') => { setPaused(false); setBook(tab); onBlurWorld?.(true) }
  const openPlanner = () => { setPaused(false); setPlanner(true); onBlurWorld?.(true) }
  const closeAll = () => {
    setBook(null); setPlanner(false); setAdvisory(false); setSitClass(null); setYearbook(false)
    setGraduation(false); setPaused(false); setSettings(false); setWardrobe(false)
    /* whoever asked for a beat is told it ended, even when it ended by being
     * closed. A station body awaiting a grade that never resolves would hold
     * the world lock for ever, and the map would have no controls and no
     * explanation. The ledger is the truth about what was scored. */
    setPlaying((p) => { p?.done(gradeFromLedger(p.beat.id)); return null })
    onBlurWorld?.(false)
  }
  // resolved per render on purpose: Y4's audit beat is GENERATED from the live save
  const yearBeat = s ? coreBeatFor(s.year, s) : null
  const sitClassDef = sitClass ? classById(sitClass) : null
  // the year-start vignette (§7.5 minute one): once per year, only while the world is quiet
  const showVignette = !!s?.introDone && !anyOpen && !paused && !held && !s.graduated
    && !s.flags.includes(`vignette:y${s.year}`)

  return (
    <>
      {/* THE HUD IS A LANDMARK AND ITS BUTTONS ARE GLYPHS. A compass emoji is
          announced as "compass" or as nothing at all depending on the reader, so
          each control says what it opens and that it opens a panel. */}
      <nav className="hud-stack" aria-label="Ship's controls">
        <button className="hud-btn" title="The chart" aria-label="The chart" aria-haspopup="dialog" onClick={() => { track('chart_opened'); openBook('chart') }}>🧭</button>
        <button className="hud-btn" title="The Handbook" aria-label="The Handbook" aria-haspopup="dialog" onClick={() => openBook('islands')}>📖</button>
        {s && s.introDone && (
          <button
            className="hud-tokenbtn hud-tokens" title="The year sheet — season tokens"
            aria-label={`The year sheet, ${s.tokens.length} season ${s.tokens.length === 1 ? 'token' : 'tokens'} unspent`}
            aria-haspopup="dialog"
            onClick={openPlanner}
          >
            {s.tokens.length > 0
              ? s.tokens.map((t, i) => <span className="hud-token" key={t + i} />)
              : <span className="hud-token" style={{ opacity: .35 }} />}
          </button>
        )}
      </nav>

      {book && <Handbook initialTab={book} onClose={closeAll} />}
      {planner && (
        <Planner
          onClose={closeAll}
          onAdvisory={() => { setPlanner(false); setAdvisory(true) }}
          onSitClass={(id) => { setPlanner(false); setSitClass(id) }}
          onYearbook={() => { setPlanner(false); setYearbook(true) }}
        />
      )}
      {advisory && yearBeat && <CoreBeatRunner beat={yearBeat} onClose={closeAll} />}
      {playing && <CoreBeatRunner beat={playing.beat} forceArm={playing.plain ? 'plain' : undefined} onClose={closeAll} />}
      {wardrobe && <Wardrobe onClose={closeAll} />}
      {sitClass && sitClassDef && s && (
        <CoreBeatRunner beat={classBeat(sitClassDef, s.year)} onClose={() => { setSitClass(null); setPlanner(true) }} />
      )}
      {yearbook && <Yearbook onClose={closeAll} onGraduate={() => { setYearbook(false); setGraduation(true) }} />}
      {graduation && <Graduation onClose={closeAll} />}
      {showVignette && s && <YearStart year={s.year} onDone={() => bump((v) => v + 1)} />}
      {settings && <SettingsPanel onClose={() => { setSettings(false); setPaused(true) }} />}

      {paused && !anyOpen && (
        <PausePanel onClose={closeAll}>
          <button className="pz-btn" onClick={closeAll}>Back to it</button>
          {s?.introDone && <button className="pz-btn" onClick={openPlanner}>The Year Sheet</button>}
          {s?.graduated && (
            <button className="pz-btn" onClick={() => { setPaused(false); setGraduation(true) }}>
              {s.flags.includes('gear2') ? 'The diploma, again' : 'Walk the stage'}
            </button>
          )}
          <button className="pz-btn" onClick={() => { setPaused(false); setBook('islands'); }}>Handbook</button>
          <button className="pz-btn" onClick={() => { setPaused(false); setSettings(true) }}>Settings</button>
          <button className="pz-btn" onClick={() => { closeAll(); nav.go('title') }}>Save &amp; leave</button>
        </PausePanel>
      )}
    </>
  )
}

/* THE PAUSE SHEET, AS ITS OWN COMPONENT so it can hold the panel contract: a
 * hook cannot be called inside a conditional branch of the HUD, and a panel that
 * only sometimes traps focus is worse than one that never does, because the
 * failure is intermittent. The line under the buttons was an inline style, which
 * is the one place a skin cannot reach, and it is `.pz-note` now. */
function PausePanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panel = usePanel({ label: 'Paused', onClose })
  return (
    <div className="pz-veil" onClick={onClose}>
      <div className="pz-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <div className="pz-title">⚓ Dropped anchor</div>
        {children}
        <div className="pz-note">your voyage saves itself</div>
      </div>
    </div>
  )
}
