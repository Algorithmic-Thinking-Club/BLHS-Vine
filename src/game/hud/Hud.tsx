import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Handbook, type Tab as HandbookTab } from './Handbook'
import { HelpCard } from './Help'
import { SettingsPanel } from '../../app/SettingsPanel'
import { Planner } from '../planner/Planner'
import { PickYear } from '../planner/PickYear'
import { onCornerChange, plaqueShown, plaquesRevealed } from './corner-bus'
import { TrophyWall } from '../run/TrophyWall'
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
import { onPlaceCard, onSceneDrawn, onStageBusy, placeCardUp, sceneDrawn } from '../stage/stage-bus'
import { FOUNDING_FLAG } from '../run/objective'
import { panelDepth, usePanel } from '../ui/a11y'
import { faceStyle } from '../ui/kitFaceStyle'
import { Glyph, Plank, useKitReady } from '../ui/controls'
import { hudGrants, type HudElement } from './inventory'
import './hud.css'

/* turns a beat id string into the beat itself, which is the only place that happens */
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

// the corner controls, the pause sheet, and the mount point every sit-down panel opens through

export function Hud({ onBlurWorld }: { onBlurWorld?: (b: boolean) => void }) {
  const nav = useNav()
  const [book, setBook] = useState<null | HandbookTab>(null)
  const [planner, setPlanner] = useState(false)
  const [advisory, setAdvisory] = useState(false)
  const [sitClass, setSitClass] = useState<string | null>(null)
  const [yearbook, setYearbook] = useState(false)
  const [graduation, setGraduation] = useState(false)
  const [paused, setPaused] = useState(false)
  const [help, setHelp] = useState(false)
  const [settings, setSettings] = useState(false)
  const [wall, setWall] = useState(false)
  const [wardrobe, setWardrobe] = useState(false)
  /* a beat world code asked for, and the callback waiting for its grade */
  const [playing, setPlaying] = useState<null | { beat: CoreBeat; plain: boolean; done: (g: number | null) => void }>(null)
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  /* redraws when the corner hands over another plaque */
  useEffect(() => onCornerChange(() => bump((v) => v + 1)), [])
  /* whether anything in the world is talking, counted across every scene by the world bus */
  const [held, setHeld] = useState(worldHeld)
  useEffect(() => { setHeld(worldHeld()); return onWorldHold(setHeld) }, [])
  /* whether an arrival card is up, which also counts as the world not being quiet */
  const [cardUp, setCardUp] = useState(placeCardUp)
  useEffect(() => { setCardUp(placeCardUp()); return onStageBusy(() => setCardUp(placeCardUp())) }, [])
  const s = loadSave()
  /* what the run has actually handed over. One pure function, read here and by
   * every other mount, so the corner cannot say two different things in two
   * scenes the way it did when IntroScene had its own gate of none at all. */
  const g = hudGrants(s)
  /* which doors the film has handed over so far, so the one that just landed
     swings in on its hook and the ones still to come stand in the dark */
  const handedOver = plaquesRevealed()
  /* the seasons still in hand, which is a list a fresh run has not been given
   * yet and a spent one has emptied. The corner shows the door in both cases. */
  const left = s?.tokens ?? []
  /* the one plan the cards are for: year one, before the wax */
  const firstPlan = (s?.year ?? 1) === 1 && !s?.plans?.[1]?.stamped
  useKitReady()

  /* which controls became granted on this render, so only those swing in on their hook */
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
    || yearbook || graduation || wardrobe || wall || playing !== null

  /* Escape pauses, but only when no panel is up to answer it first */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (panelDepth() > 0) return                                            // a panel is on top and has already answered
      if (planner || advisory || sitClass || yearbook || graduation) return   // the sheet eats its own Esc; a beat never Esc-quits
      /* a pure toggle; the world lease is taken in the effect below instead */
      setPaused((p) => !p)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [planner, advisory, sitClass, yearbook, graduation, onBlurWorld])

  /* the world hold is derived from what is open, so no panel can forget to release it */
  const heldByUs = useRef(false)
  useEffect(() => {
    const want = anyOpen || paused
    if (want === heldByUs.current) return
    heldByUs.current = want
    onBlurWorld?.(want)
  })

  /* whoever asked for a panel and is parked until every panel is shut again */
  const waiting = useRef<null | (() => void)>(null)
  const sawOpen = useRef(false)
  useEffect(() => {
    if (anyOpen || paused) { sawOpen.current = true; return }
    if (!sawOpen.current) return
    sawOpen.current = false
    const done = waiting.current
    waiting.current = null
    done?.()
  })
  /* and nobody is left parked when the HUD itself goes away, which is what a door
   * out of the room is */
  useEffect(() => () => { waiting.current?.(); waiting.current = null }, [])

  // the ui-bus: the world's diegetic stations open these same panels (ui-bus.ts)
  useEffect(() => onUiRequest((which, done) => {
    setPaused(false)
    /* a second waiter would orphan the first, so the one already parked is let
     * go before this one takes its place */
    if (done) { waiting.current?.(); waiting.current = done }
    if (which === 'planner') { track('planner_requested', { via: 'world' }); setPlanner(true) }
    if (which === 'advisory') { setAdvisory(true) }
    if (which === 'handbook') { setBook('islands') }
    if (which === 'chart') { track('chart_opened'); setBook('chart') }
    if (which === 'wardrobe') { track('wardrobe_opened', { via: 'world' }); setWardrobe(true) }
    if (which === 'settings') { setSettings(true) }
    /* the trophy wall, which fills in every time a student finishes something */
    if (which === 'wall') { track('wall_requested', { via: 'world' }); setWall(true) }
    /* the yearbook, which any island can now send a student to by name */
    if (which === 'yearbook') { track('yearbook_opened', { via: 'world' }); setYearbook(true) }
  }), [onBlurWorld])

  /* a scored activity world code asked for, with its grade going back to whoever asked */
  useEffect(() => onBeatRequest((req) => {
    setPaused(false)
    const beat = beatById(req.beat, s)
    /* REFUSED, NOT ANSWERED NULL. A beat id nobody knows is a typo in somebody's
     * island, and a null grade told them it had worked. */
    if (!beat) { req.refuse(`no activity called "${req.beat}"`); return }
    setPlaying({ beat, plain: req.plain, done: req.done })
  }), [onBlurWorld, s])

  const openBook = (tab: HandbookTab) => { setPaused(false); setBook(tab) }
  const openPlanner = () => { setPaused(false); setPlanner(true) }
  const closeAll = () => {
    setBook(null); setPlanner(false); setAdvisory(false); setSitClass(null); setYearbook(false)
    setGraduation(false); setPaused(false); setSettings(false); setWardrobe(false); setWall(false)
    /* whoever asked for a beat is told it ended, even when it ended by being closed */
    setPlaying((p) => { p?.done(gradeFromLedger(p.beat.id)); return null })
  }
  // resolved per render on purpose: Y4's audit beat is GENERATED from the live save
  /* whether the world has finished arriving, on a timer so nothing waits for ever */
  const [settled, setSettled] = useState(false)
  /* whether a map has drawn its first frame, so nothing opens over a black screen */
  const [drawn, setDrawn] = useState(!!sceneDrawn())
  useEffect(() => {
    let t = window.setTimeout(() => setSettled(true), 2600)
    const off = onPlaceCard(() => {
      setSettled(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setSettled(true), 5200)
    })
    const offDrawn = onSceneDrawn((map) => {
      setDrawn(!!map)
      if (!map) return
      setSettled(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setSettled(true), 2600)
    })
    return () => { window.clearTimeout(t); off(); offDrawn() }
  }, [])

  const yearBeat = s ? coreBeatFor(s.year, s) : null
  const sitClassDef = sitClass ? classById(sitClass) : null
  // the year-start vignette (§7.5 minute one): once per year, only while the
  // world is quiet, and an arrival card on screen is the world not being quiet
  /* and it waits for the arrival card first: where you are, then what the year is */
  /* and never before the principal has been met, which the founding flag records */
  const showVignette = !!s?.introDone && s.flags.includes(FOUNDING_FLAG)
    && !anyOpen && !paused && !held && !s.graduated
    && !cardUp && settled && drawn && !s.flags.includes(`vignette:y${s.year}`)

  return (
    <>
      {/* the corner controls: hanging carved signs with a drawn mark and a word on each */}
      {/* all three doors stand from the first world frame, called Map, Guide and My Year */}
      {/* each door keeps its place in the stack even before it has been handed over */}
      <nav className="hud-stack" aria-label="Game menu">
        {(
        <button
          className={`hud-plaque${plaqueShown('map') ? '' : ' hud-plaque-waiting'}${handedOver.includes('map') ? ' hud-arriving' : ''}${entering.has('chart') ? ' hud-arriving' : ''}`}
          aria-label="Map. The islands you have found."
          aria-hidden={!plaqueShown('map')}
          tabIndex={plaqueShown('map') ? undefined : -1}
          aria-haspopup="dialog"
          onClick={() => { track('chart_opened'); openBook('chart') }}
        >
          <Glyph piece="icon_set" face="compass" size={22} className="hud-plaque-mark" />
          <span className="hud-plaque-word">Map</span>
        </button>
        )}
        {(
        <button
          className={`hud-plaque${plaqueShown('guide') ? '' : ' hud-plaque-waiting'}${handedOver.includes('guide') ? ' hud-arriving' : ''}${entering.has('handbook') ? ' hud-arriving' : ''}`}
          aria-label="Guide. What the school offers, and what you have earned."
          aria-hidden={!plaqueShown('guide')}
          tabIndex={plaqueShown('guide') ? undefined : -1}
          aria-haspopup="dialog"
          /* THE GUIDE OPENS ON THE SCHOOL, not on the game's own island list.
             BRIEF-INTRO-FILM section 5 and the principal's own handover line:
             "The Guide is every club and class at Bonney Lake." */
          onClick={() => openBook('school')}
        >
          {/* a drawn book mark, because a student looking for the Guide looks for a book */}
          <span className="hud-plaque-mark kit-mark kit-mark-book" aria-hidden="true" />
          <span className="hud-plaque-word">Guide</span>
        </button>
        )}
        {(
          <button
            className={`hud-plaque${plaqueShown('my-year') ? '' : ' hud-plaque-waiting'}${handedOver.includes('my-year') ? ' hud-arriving' : ''} hud-tokenbtn${entering.has('tokens') ? ' hud-arriving' : ''}`}
            /* this reads a save that may not exist yet, because the corner outlives the run */
            /* the label says what the button opens and whether the year is still open */
            aria-label={s?.plans?.[s.year]?.stamped
              ? 'My Year. Your schedule, and the classes you picked.'
              : 'My Year. Pick your classes and what you join.'}
            aria-haspopup="dialog"
            onClick={openPlanner}
          >
            {/* the season tokens still in hand, each drawn with its own face rather than a colour */}
            <span className="hud-tokens">
              {left.length > 0
                ? left.map((t, i) => (
                  <span className="hud-token" key={t + i} style={faceStyle('pip', t.toLowerCase())} />
                ))
                : <span className="hud-token hud-token-spent" style={faceStyle('pip', 'ghost')} />}
            </span>
            {/* the word says what the button opens; the pips are the only count on it */}
            <span className="hud-plaque-word">My Year</span>
          </button>
        )}
      </nav>

      {book && <Handbook initialTab={book} onClose={closeAll} />}
      {/* the first plan is a screen of cards; every later one is the full year sheet */}
      {planner && !firstPlan && (
        <Planner
          onClose={closeAll}
          onAdvisory={() => { setPlanner(false); setAdvisory(true) }}
          onSitClass={(id) => { setPlanner(false); setSitClass(id) }}
          onYearbook={() => { setPlanner(false); setYearbook(true) }}
        />
      )}
      {planner && firstPlan && <PickYear year={s?.year ?? 1} onClose={closeAll} />}
      {advisory && yearBeat && <CoreBeatRunner beat={yearBeat} onClose={closeAll} />}
      {playing && <CoreBeatRunner beat={playing.beat} forceArm={playing.plain ? 'plain' : undefined} onClose={closeAll} />}
      {wall && <TrophyWall onClose={closeAll} />}
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
          <Plank wide keyCap="Esc" onClick={closeAll}>Back to the game</Plank>
          {s?.introDone && <Plank wide onClick={openPlanner}>My Year</Plank>}
          {s?.graduated && (
            <Plank wide onClick={() => { setPaused(false); setGraduation(true) }}>
              {s.flags.includes('gear2') ? 'Walk the stage again' : 'Walk the stage'}
            </Plank>
          )}
          <Plank wide onClick={() => { setPaused(false); setBook('islands') }}>Guide</Plank>
          {/* the same help card the corner opens, so the two roads cannot drift apart */}
          <Plank wide onClick={() => { setPaused(false); setHelp(true) }}>How to play</Plank>
          <Plank wide onClick={() => { setPaused(false); setSettings(true) }}>Settings</Plank>
          <Plank wide onClick={() => { closeAll(); nav.go('title') }}>Save and leave</Plank>
        </PausePanel>
      )}
    </>
  )
}

/* the pause sheet, its own component so it can always hold the panel contract */
function PausePanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panel = usePanel({ label: 'Paused', onClose })
  return (
    <div className="pz-veil" onClick={onClose}>
      <div className="pz-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        {/* the title carries no emoji: the words do the work */}
        {/* and the anchor beside them is a drawn mark */}
        <div className="pz-title">
          <span className="pz-mark kit-mark kit-mark-anchor" aria-hidden="true" />
          Paused
        </div>
        {children}
        <div className="pz-note">Your progress saves by itself.</div>
      </div>
    </div>
  )
}
