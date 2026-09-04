import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Handbook } from './Handbook'
import { HelpCard } from './Help'
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
import { Glyph, Plank, useKitReady } from '../ui/controls'
import { hudGrants, type HudElement } from './inventory'
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
  const [help, setHelp] = useState(false)
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
  /* the seasons still in hand, which is a list a fresh run has not been given
   * yet and a spent one has emptied. The corner shows the door in both cases. */
  const left = s?.tokens ?? []
  useKitReady()

  /* ---- WHICH CONTROLS ARE ARRIVING RIGHT NOW ------------------------------
   *
   * §40.2: "an element enters the HUD when the run first contains the thing it
   * opens, and the entrance is a moment rather than a state change." `hudGrants`
   * has answered the first half since it was written and nothing did the second,
   * so the compass and the binder appeared between two frames the way a bug
   * appears.
   *
   * A grant that was false on the previous render and is true on this one is an
   * ARRIVAL and swings in on its hook. A grant that was already true when the
   * page loaded is not: a student who reloads mid-run should not watch their own
   * corner reassemble every time. The ref is seeded from the first render for
   * exactly that reason. */
  const seen = useRef<Set<HudElement> | null>(null)
  const entering = new Set<HudElement>()
  {
    const now = new Set<HudElement>((Object.keys(g) as HudElement[]).filter((k) => g[k]))
    if (seen.current === null) seen.current = now
    else {
      for (const k of now) if (!seen.current.has(k)) entering.add(k)
      seen.current = now
    }
  }

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
      /* THE SIDE EFFECT CAME OUT OF THE UPDATER, 2026-09-01.
       *
       * This read `setPaused((p) => { onBlurWorld?.(!p); return !p })`, and React
       * runs an updater function DURING RENDER. `onBlurWorld` takes a world-bus
       * lease, the bus tells its subscribers, and one of those subscribers is now
       * the Heading, so pressing Escape logged "Cannot update a component
       * (Heading) while rendering a different component (Hud)" on every pause.
       *
       * It was latent for as long as nothing but this component listened to the
       * bus, which is the shape of every bug of this kind: correct until somebody
       * else subscribes. The toggle is pure now and the lease is taken in the
       * effect below, where a side effect belongs. */
      setPaused((p) => !p)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [planner, advisory, sitClass, yearbook, graduation, onBlurWorld])

  /* ---- WHO HOLDS THE CONTROLS, DERIVED RATHER THAN REMEMBERED --------------
   *
   * There were TWELVE `onBlurWorld?.(...)` calls scattered through this
   * component, one beside every `setX(true)` and one in `closeAll`, and the
   * lease behind them is a single shared one. Two bugs came out of that on
   * 2026-09-01 and both are the same bug.
   *
   * The first was loud: `setPaused((p) => { onBlurWorld?.(!p); return !p })`
   * took the lease INSIDE a state updater, and React runs an updater during
   * render, so pressing Escape logged "Cannot update a component (Heading) while
   * rendering a different component (Hud)" every single time. It was latent for
   * as long as nothing but this component listened to the world bus, which is
   * the shape of every bug of this kind: correct until somebody else subscribes.
   *
   * The second is quiet and worse. Opening a panel from the pause sheet runs
   * `setPaused(false)` and `onBlurWorld(true)` in one handler, so a
   * pause-shaped effect would then fire `onBlurWorld(false)` on the next render
   * and hand the controls back with a panel still on screen. That is exactly the
   * failure `world-bus.ts` counts leases to prevent, defeated one layer up.
   *
   * So the hold is a FUNCTION OF WHAT IS OPEN. Nothing takes it, nothing
   * releases it, and a panel added next month cannot forget either half: it only
   * has to be in `anyOpen`. The ref keeps a re-render with no change from
   * touching the bus, because `onBlurWorld` is redefined by its parent on every
   * render and would otherwise be a new dependency sixty times a second. */
  const heldByUs = useRef(false)
  useEffect(() => {
    const want = anyOpen || paused
    if (want === heldByUs.current) return
    heldByUs.current = want
    onBlurWorld?.(want)
  })

  // the ui-bus: the world's diegetic stations open these same panels (ui-bus.ts)
  useEffect(() => onUiRequest((which) => {
    setPaused(false)
    if (which === 'planner') { track('planner_requested', { via: 'world' }); setPlanner(true) }
    if (which === 'advisory') { setAdvisory(true) }
    if (which === 'handbook') { setBook('islands') }
    if (which === 'chart') { track('chart_opened'); setBook('chart') }
    if (which === 'wardrobe') { track('wardrobe_opened', { via: 'world' }); setWardrobe(true) }
    if (which === 'settings') { setSettings(true) }
    /* THE SIXTH DOOR, and the page had exactly one before it: a button inside the
     * planner that only appears while THIS year is closable. So a student could
     * not look at year one the moment year one ended, and no island and no
     * station could ever send them to their own book. `open('yearbook')` is a
     * word a member's Python can already say. */
    if (which === 'yearbook') { track('yearbook_opened', { via: 'world' }); setYearbook(true) }
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
    setPlaying({ beat, plain: req.plain, done: req.done })
  }), [onBlurWorld, s])

  const openBook = (tab: 'chart' | 'islands') => { setPaused(false); setBook(tab) }
  const openPlanner = () => { setPaused(false); setPlanner(true) }
  const closeAll = () => {
    setBook(null); setPlanner(false); setAdvisory(false); setSitClass(null); setYearbook(false)
    setGraduation(false); setPaused(false); setSettings(false); setWardrobe(false)
    /* whoever asked for a beat is told it ended, even when it ended by being
     * closed. A station body awaiting a grade that never resolves would hold
     * the world lock for ever, and the map would have no controls and no
     * explanation. The ledger is the truth about what was scored. */
    setPlaying((p) => { p?.done(gradeFromLedger(p.beat.id)); return null })
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
      {/* ---- THE CORNER, DRAWN --------------------------------------------
          §40.6's law names exactly four things that may float and the corner is
          three of them. What was here was a `linear-gradient` square carrying an
          operating-system compass and an operating-system book, which
          `docs/ART.md` forbids in as many words ("Icons are drawn, never an
          emoji or a font glyph") and which the brief's do-not list forbids
          again.

          THEY ARE SIGNS NOW, NOT MYSTERY GLYPHS. A hanging carved plate with the
          drawn mark AND the word, which is `plaque-small.png` at very close to
          its own drawn 2:1. Three reasons, in order of weight: a fourteen year
          old in an advisory room reads a word faster than they decode an icon;
          a 120x56 sign is a real trackpad target where a 46px square is not; and
          `icon_set` has no book face, so an icon-only Handbook control could
          only ever have been an emoji.

          THE ENTRANCE IS A MOMENT (§40.2). `hudGrants` has gated these since it
          was written, but a control that blinks into existence between two
          frames is a state change and the law asks for a moment, so a newly
          granted control ARRIVES: it swings down on its hook once, and never
          again for the life of the page. */}
      {/* ---- THE CORNER IS COMPLETE FROM THE FIRST FRAME -------------------
          BRIEF-PLAYTHROUGH-1 law 2, which OVERRULES §40.2 and the paragraph
          above it, on Ash's own play of the deploy: "two buttons in a corner
          read as broken, not as earned. Chart, Handbook and the year sheet are
          all present from the first world frame, aligned as one stack. What a
          student has not earned yet is shown inside the panel, honestly, not by
          hiding the door to it."

          §40.2's argument was that a control for a thing you cannot do yet is
          furniture. It is a good argument and it lost to a freshman looking at
          the screen: a gap where a third button belongs does not read as "not
          yet", it reads as a broken game, and the arrival animation that was
          supposed to make the grant a moment mostly happened off screen.

          `hudGrants` is NOT deleted and its rows are not edited. It is still the
          honest answer to "has this been earned", the panels still read it, and
          the arrival flourish still plays the first time a thing is really
          granted. What changed is that the DOOR is always there. */}
      <nav className="hud-stack" aria-label="Ship's controls">
        {(
        <button
          className={`hud-plaque${entering.has('chart') ? ' hud-arriving' : ''}`}
          aria-label="The chart, showing every island you have found"
          aria-haspopup="dialog"
          onClick={() => { track('chart_opened'); openBook('chart') }}
        >
          <Glyph piece="icon_set" face="compass" size={22} className="hud-plaque-mark" />
          <span className="hud-plaque-word">Chart</span>
        </button>
        )}
        {(
        <button
          className={`hud-plaque${entering.has('handbook') ? ' hud-arriving' : ''}`}
          aria-label="The Handbook"
          aria-haspopup="dialog"
          onClick={() => openBook('islands')}
        >
          {/* A BOOK, DRAWN 2026-09-01. This wore the school's panther crest,
              which `docs/ART.md` puts on the Handbook's COVER and which is the
              right mark for the school and the wrong mark for the control: a
              student looking for their Handbook is looking for a book. The
              platform's `icon_set` has no book face and still does not; this is
              a local mark drawn beside three others in one job. */}
          <span className="hud-plaque-mark kit-mark kit-mark-book" aria-hidden="true" />
          <span className="hud-plaque-word">Handbook</span>
        </button>
        )}
        {(
          <button
            className={`hud-plaque hud-tokenbtn${entering.has('tokens') ? ' hud-arriving' : ''}`}
            /* THE CORNER OUTLIVES THE RUN NOW (law 2), so this reads a save that
               may not exist yet. A student on the first world frame of a fresh
               run has no tokens because they have not been handed any, which is
               a different sentence from having spent them all. */
            aria-label={left.length === 0
              ? (s ? 'The year sheet. Every season is spent.' : 'The year sheet.')
              : `The year sheet. ${left.length} season ${left.length === 1 ? 'token' : 'tokens'} unspent: `
                + `${left.join(', ')}.`}
            aria-haspopup="dialog"
            onClick={openPlanner}
          >
            {/* ---- THE SEASONS, TOLD APART BY THEIR OWN MARK ----------------
                MAPVIS drew a `pip` sheet with five cut faces, fall, winter,
                spring, spent and ghost, and until the corner was rebuilt these
                were three identical gold circles from a CSS radial-gradient, so
                a student could count how many they had and could not tell WHICH,
                and the one that meant "all spent" was an inline opacity of .35.

                §11.3's rule is that no state may be carried by hue alone, and an
                inline opacity is worse than hue: it is lightness alone, on the
                hardware that crushes lightness hardest. Three struck faces say
                which season each one is without a word, and `ghost` is a drawn
                empty socket rather than a faded copy of a full one.

                An undrawn face falls back to the coin, so a build with no
                platform still counts correctly. */}
            <span className="hud-tokens">
              {left.length > 0
                ? left.map((t, i) => (
                  <span className="hud-token" key={t + i} style={faceStyle('pip', t.toLowerCase())} />
                ))
                : <span className="hud-token hud-token-spent" style={faceStyle('pip', 'ghost')} />}
            </span>
            {/* THE WORD IS THE DOOR, NEVER THE COUNT.
                Ash, 2026-09-02: "3 left is still a bit inaccurate. is it 3 left
                or 4 left or something completely different." He is right, twice
                over, and §40.4 had already said so:

                  "A student can read how much of their year is unspent without
                   opening anything, and the thing they read is the thing they
                   press. There is no separate count, no label, no tooltip, and
                   no number."

                The pips ARE the readout. A number beside them is the same fact
                said twice, and the second telling is the one that can be wrong.

                And it WAS wrong, in the way he suspected. "3 left" reads as
                three things left to do, and a year is three season tokens AND
                two focus classes: `canStamp` refuses a sheet until two classes
                are picked, so a student holding three tokens and no classes has
                five decisions left, not three. Every count on a control that is
                not counting everything is a lie about the rest.

                So it says what it OPENS, the way "Chart" and "Handbook" do two
                rows above it. The number a reader needs is on the aria-label,
                where it can be exact without competing with the pips. */}
            <span className="hud-plaque-word">Year sheet</span>
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

      {help && <HelpCard onClose={() => setHelp(false)} />}
      {paused && !anyOpen && (
        <PausePanel onClose={closeAll}>
          <Plank wide keyCap="Esc" onClick={closeAll}>Back to it</Plank>
          {s?.introDone && <Plank wide onClick={openPlanner}>The Year Sheet</Plank>}
          {s?.graduated && (
            <Plank wide onClick={() => { setPaused(false); setGraduation(true) }}>
              {s.flags.includes('gear2') ? 'The diploma, again' : 'Walk the stage'}
            </Plank>
          )}
          <Plank wide onClick={() => { setPaused(false); setBook('islands') }}>Handbook</Plank>
          {/* THE SAME CARD THE QUESTION MARK OPENS, which brief item 3b asks for
              in as many words ("Same card from the pause menu"). One component,
              so the two roads cannot drift apart: the corner is where a student
              finds it and the pause sheet is where a teacher tells them to look
              when they have already pressed Escape. */}
          <Plank wide onClick={() => { setPaused(false); setHelp(true) }}>How to play</Plank>
          <Plank wide onClick={() => { setPaused(false); setSettings(true) }}>Settings</Plank>
          <Plank wide onClick={() => { closeAll(); nav.go('title') }}>Save and leave</Plank>
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
        {/* NO GLYPH, AND THAT IS THE HONEST ANSWER RATHER THAN A COMPROMISE.
            This read `⚓ Dropped anchor` with an operating-system anchor in the
            school's off-brand blue, and `icon_set` has no anchor face, so the
            choice was a drawn mark that does not exist or none at all.
            `docs/ART.md` decides it: an emoji is not an option, and a title is
            not a control, so the words carry it. The anchor face is an art gap
            to be asked for, written down in the handoff rather than papered
            over. */}
        {/* AND THE ANCHOR IS DRAWN NOW. This carried an operating-system anchor
            in the school's off-brand blue until 2026-09-01, then nothing at all
            because `icon_set` had no anchor face and `docs/ART.md` has no clause
            for a placeholder. It has one now. */}
        <div className="pz-title">
          <span className="pz-mark kit-mark kit-mark-anchor" aria-hidden="true" />
          Dropped anchor
        </div>
        {children}
        <div className="pz-note">your voyage saves itself</div>
      </div>
    </div>
  )
}
