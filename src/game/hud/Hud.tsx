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
import { onPlaceCard, onStageBusy, placeCardUp } from '../stage/stage-bus'
import { panelDepth, usePanel } from '../ui/a11y'
import { faceStyle } from '../ui/kitFaceStyle'
import { hudGrants } from './inventory'
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
  /* AND AN ARRIVAL CARD IS THE WORLD NOT BEING QUIET EITHER. An arrival is what
   * starts a year, so the card naming the place and the year's opening line fired
   * on the same instant and shared the bottom of the window with the body behind
   * both of them, which the eyes round caught on the very shot taken to prove
   * that had stopped. They take turns now. */
  const [cardUp, setCardUp] = useState(placeCardUp)
  useEffect(() => { setCardUp(placeCardUp()); return onStageBusy(() => setCardUp(placeCardUp())) }, [])
  const s = loadSave()
  /* what the run has actually handed over. One pure function, read here and by
   * every other mount, so the corner cannot say two different things in two
   * scenes the way it did when IntroScene had its own gate of none at all. */
  const g = hudGrants(s)

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
  /* HAS THE WORLD FINISHED ARRIVING. Set a beat after the last arrival card, and
   * on a timer for a map that shows no card at all (a room the student has
   * already been in this sitting), so nothing waits for ever on a card that is
   * never coming. */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let t = window.setTimeout(() => setSettled(true), 2600)
    const off = onPlaceCard(() => {
      setSettled(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setSettled(true), 5200)
    })
    return () => { window.clearTimeout(t); off() }
  }, [])

  const yearBeat = s ? coreBeatFor(s.year, s) : null
  const sitClassDef = sitClass ? classById(sitClass) : null
  // the year-start vignette (§7.5 minute one): once per year, only while the
  // world is quiet, and an arrival card on screen is the world not being quiet
  /* AND IT WAITS FOR THE ARRIVAL TO FINISH, which is the half `!cardUp` cannot
   * express. Measured cold with scripts/ten-seconds.mjs: Principal Panther's
   * first line of the year landed at 0.6 seconds and the card naming the place
   * landed at 2.0, so the year opened by having somebody talk at a student who
   * did not yet know where they were standing. `!cardUp` is false before a card
   * has been requested as well as after it has gone, so it stopped the two
   * OVERLAPPING and never put them in an order.
   *
   * The comment on `ys-card` records the earlier half of this same bug: "in the
   * Maw the year's first line covered the place card every single time". This is
   * the rest of it. Where you are, then what the year is. */
  const showVignette = !!s?.introDone && !anyOpen && !paused && !held && !s.graduated
    && !cardUp && settled && !s.flags.includes(`vignette:y${s.year}`)

  return (
    <>
      {/* THE HUD IS A LANDMARK AND ITS BUTTONS ARE GLYPHS. A compass emoji is
          announced as "compass" or as nothing at all depending on the reader, so
          each control says what it opens and that it opens a panel.

          AND ONE OF THEM IS DRAWN NOW. MAPVIS's `icon_set` sheet carries eight
          cut faces and `compass` is one of them, so the chart button wears the
          real thing instead of whatever compass the operating system happens to
          ship. THE OTHER THREE DO NOT MOVE: the sheet has no `book` and no
          `anchor`, so the Handbook spine and the pause sheet keep their emoji
          rather than getting a blank square, and `faceStyle` refuses by name
          instead of drawing something that is not there. */}
      {/* THE CORNER IS EMPTY UNTIL THE GAME HAS GIVEN SOMETHING, which is §40.2's
          law arriving in the one place it was broken. `hudGrants` is the single
          answer both mounts read; before it there were two gates, and the second
          one (IntroScene) had no save test at all, which is how the compass got
          onto the beach two sections before anybody hands you a chart.

          A nav with nothing in it is still a landmark a screen reader announces,
          so at n=0 there is no nav either. */}
      {(g.chart || g.handbook || g.tokens) && (
      <nav className="hud-stack" aria-label="Ship's controls">
        {g.chart && (
        <button className="hud-btn" title="The chart" aria-label="The chart" aria-haspopup="dialog" onClick={() => { track('chart_opened'); openBook('chart') }}>
          <KitGlyph piece="icon_set" face="compass">🧭</KitGlyph>
        </button>
        )}
        {g.handbook && (
        <button className="hud-btn" title="The Handbook" aria-label="The Handbook" aria-haspopup="dialog" onClick={() => openBook('islands')}>
          <KitGlyph piece="icon_set" face="book">📖</KitGlyph>
        </button>
        )}
        {s && g.tokens && (
          <button
            className="hud-tokenbtn hud-tokens" title="The year sheet — season tokens"
            aria-label={`The year sheet, ${s.tokens.length} season ${s.tokens.length === 1 ? 'token' : 'tokens'} unspent`}
            aria-haspopup="dialog"
            onClick={openPlanner}
          >
            {/* ---- THE SEASONS, TOLD APART BY THEIR OWN MARK ----------------
                MAPVIS drew a `pip` sheet with five cut faces, fall, winter,
                spring, spent and ghost, and nothing has ever read one. These were
                three identical gold circles from a CSS radial-gradient, so a
                student could count how many they had and could not tell WHICH,
                and the one that meant "all spent" was an inline opacity of .35.

                §11.3's rule is that no state may be carried by hue alone, and an
                inline opacity is worse than hue: it is lightness alone, on the
                hardware that crushes lightness hardest. Three struck faces say
                which season each one is without a word, and `ghost` is a drawn
                empty socket rather than a faded copy of a full one.

                An undrawn face falls back to the gradient, so a build with no
                platform looks exactly as it did. */}
            {s.tokens.length > 0
              ? s.tokens.map((t, i) => (
                <span className="hud-token" key={t + i} style={faceStyle('pip', t.toLowerCase())} />
              ))
              : <span className="hud-token hud-token-spent" style={faceStyle('pip', 'ghost')} />}
          </button>
        )}
      </nav>
      )}

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

/* A GLYPH THAT PREFERS THE DRAWN MARK AND FALLS BACK TO THE ONE THE MACHINE HAS.
 *
 * The whole of the swap, in one place, so a control never has to know whether
 * the art exists. `faceStyle` hands back CSS only when the kit is worn and the
 * face was really cut; otherwise this renders the children, which is the emoji
 * the button has always shown. There is no third state and no empty square. */
function KitGlyph({ piece, face, children }: { piece: string; face: string; children: ReactNode }) {
  const style = faceStyle(piece, face)
  if (!style) return <>{children}</>
  return <span className="hud-glyph" style={style} aria-hidden="true" />
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
