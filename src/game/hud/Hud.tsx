import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Handbook, type Tab as HandbookTab } from './Handbook'
import { HelpCard } from './Help'
import { UI_PANELS } from '../ui-bus'
import { ChartPanel } from '../world/ChartPanel'
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
import { Tour } from './Tour'
import { Yearbook } from '../run/Yearbook'
import { YearStart } from '../run/YearStart'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { track } from '../telemetry'
import { onBeatRequest, onUiRequest } from '../ui-bus'
import { onWorldHold, worldHeld } from '../world-bus'
import { cinemaOn } from '../stage/cinema'
import { onPlaceCard, onSceneDrawn, onStageBusy, placeCardUp, sceneDrawn } from '../stage/stage-bus'
import { FOUNDING_FLAG } from '../run/objective'
import { announce, panelDepth, usePanel } from '../ui/a11y'
import { grant } from '../grant'
import { attemptsOn } from '../beats/state'
import { checkIdOf, refuseCheck } from '../beats/palette'
import { placeById, programmeById } from '../roster/roster'
import type { BeatRequest } from '../ui-bus'
import { countAsDone, noIslandLine } from '../run/pick'
import { requestVoyage } from '../world/sail-bus'
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

/* an island brings its own items and this beat carries no credit, because the island's `award()` writes the credit row `island:<programme>:y<n>` and a shared id makes `recordGrade` count two attempts and double-weight the GPA; items are validated here since `checksOf` drops a bad one silently */
function islandBeat(req: BeatRequest, s: ReturnType<typeof loadSave>): CoreBeat | string {
  const decl = req.decl
  if (!decl || !s) return `no activity called "${req.beat}"`
  if (!Array.isArray(decl.items) || !decl.items.length) return `"${req.beat}" arrived with no items in it`

  for (const item of decl.items) {
    const why = refuseCheck(item)
    if (why) return `"${req.beat}" cannot be played: ${why}`
  }
  /* two items with one id share one answer slot, so the second write lands on the first and a run answered entirely right scores one of two; name the id rather than hand out half a mark in silence */
  const ids = decl.items.map((i) => checkIdOf(i))
  const twice = ids.find((id, i) => ids.indexOf(id) !== i)
  if (twice !== undefined)
    return `"${req.beat}" has two questions both called "${twice}". `
      + 'An id is how an answer is filed, so two of them would score as one.'

  const programme = decl.programme
  const place = placeById(programmeById(programme)?.place)?.name
  return {
    /* the id carries its own year like every other id in the save: without `y${s.year}` a second-year sitting lands on year one's row, `recordGrade` reads it as a retake, keeps the older higher grade, and awards a credit nobody earned this year */
    id: `${programme ?? 'island'}:${req.beat}:y${s.year}`,
    year: s.year,
    title: decl.title || req.beat,
    place: decl.place || place || '',
    kind: 'island',
    chrome: 'screen',
    tags: [],
    steps: decl.items.map((check) => ({ kind: 'check' as const, check })),
    takeaways: [],
    credit: 0,
  }
}

/* the grade a beat actually landed, read off the ledger rather than passed around, because the ledger is what `recordGrade` wrote and what the GPA sees */
function gradeFromLedger(beatId: string): number | null {
  const e = loadSave()?.ledger.find((x) => x.id === beatId)
  return e ? e.grade : null
}

// the corner controls, the pause sheet, and the mount point every sit-down panel opens through

export function Hud({ onBlurWorld }: { onBlurWorld?: (b: boolean) => void }) {
  const nav = useNav()
  const [book, setBook] = useState<null | HandbookTab>(null)
  const [planner, setPlanner] = useState(false)
  /* false, true to sit it, or 'review' to look at what was scored */
  const [advisory, setAdvisory] = useState<false | true | 'review'>(false)
  const [yearbook, setYearbook] = useState(false)
  const [graduation, setGraduation] = useState(false)
  const [paused, setPaused] = useState(false)
  const [help, setHelp] = useState(false)
  /* the chart on its own screen, which the corner sign and E at a dock both open */
  const [chart, setChart] = useState(false)
  const [settings, setSettings] = useState(false)
  const [wall, setWall] = useState(false)
  /* whether the wall or the wardrobe was opened from the year sheet, so shutting it returns there rather than dropping the player back in the room */
  const fromSheet = useRef(false)
  const [wardrobe, setWardrobe] = useState(false)
  /* the handover tutorial, holding whoever is waiting for it to be over */
  const [tour, setTour] = useState<null | (() => void)>(null)
  /* a beat world code asked for, and the callback waiting for its grade */
  const [playing, setPlaying] = useState<null | { beat: CoreBeat; done: (g: number | null) => void; triesAt: number }>(null)
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
  /* what the run has actually handed over, one pure function read here and by every other mount, so the corner cannot say two different things in two scenes the way it did when `IntroScene` had no gate at all */
  const g = hudGrants(s)
  /* which doors the film has handed over so far, so the one that just landed swings in on its hook and the ones still to come stand in the dark */
  const handedOver = plaquesRevealed()
  /* the seasons still in hand: a fresh run has not been given the list yet and a spent one has emptied it, and the corner shows the door in both cases */
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


  const anyOpen = book !== null || planner || settings || advisory
    || yearbook || graduation || wardrobe || wall || chart || playing !== null

  /* Escape pauses, but only when no panel is up to answer it first */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (panelDepth() > 0) return                                            // a panel is on top and has already answered
      if (planner || advisory || yearbook || graduation) return   // the sheet eats its own Esc; a beat never Esc-quits
      /* never raise the pause sheet inside a film: `PickYear` reads `cinemaOn()` as proof the film opened it, so it comes up with no close plank and a dead Escape, and stamping it sets `planned` before the film awaits it, which silently kills the rest of the introduction */
      if (cinemaOn()) return
      /* a pure toggle; the world lease is taken in the effect below instead */
      setPaused((p) => !p)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [planner, advisory, yearbook, graduation, onBlurWorld])

  /* the world hold is derived from what is open, so no panel can forget to release it */
  const heldByUs = useRef(false)
  useEffect(() => {
    const want = !!(anyOpen || paused)
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
  /* and nobody is left parked when the HUD itself goes away, which is what a door out of the room is */
  useEffect(() => () => { waiting.current?.(); waiting.current = null }, [])

  // the ui-bus: the world's diegetic stations open these same panels (ui-bus.ts)
  useEffect(() => onUiRequest((which, done) => {
    setPaused(false)
    /* a second waiter would orphan the first, so the parked one is let go before this one lands */
    if (done) { waiting.current?.(); waiting.current = done }
    if (which === 'planner') { track('planner_requested', { via: 'world' }); setPlanner(true) }
    if (which === 'advisory') { setAdvisory(true) }
    /* every door marked Guide opens the school book the sign promises */
    if (which === 'handbook') { setBook('school') }
    /* the same binder, opened on the page the beat is about */
    if (which === 'cords') { track('handbook_opened', { tab: 'cords', via: 'world' }); setBook('cords') }
    /* the chart opens as the chart rather than as a book about school */
    if (which === 'chart') { setChart(true) }
    /* a name nothing here matches releases its waiter, because this is a chain of equality tests with no else and an unhandled name parked a caller only the bus's ten minute ceiling could settle, with the world held for all of it; `performIntent` refuses an unknown panel by name and this is the fence behind it */
    if (!(UI_PANELS as readonly string[]).includes(which)) {
      console.warn(`[hud] nothing here opens "${which}", so whoever asked is let go`)
      waiting.current?.()
      waiting.current = null
    }
    if (which === 'wardrobe') { fromSheet.current = false; track('wardrobe_opened', { via: 'world' }); setWardrobe(true) }
    if (which === 'settings') { setSettings(true) }
    /* the trophy wall, which fills in every time a student finishes something */
    if (which === 'wall') { fromSheet.current = false; track('wall_requested', { via: 'world' }); setWall(true) }
    /* the yearbook, which any island can now send a student to by name */
    if (which === 'yearbook') { track('yearbook_opened', { via: 'world' }); setYearbook(true) }
    /* the tour is not a panel and does not go through `anyOpen`: it is fourteen seconds of the corner explained with the world still under it, and it answers its own waiter when it ends, because holding the world would stop the very controls it points at */
    if (which === 'tour') {
      track('tour_opened')
      if (done) { waiting.current = null }
      setTour(() => done ?? (() => { /* nobody is waiting on it */ }))
    }
  }), [onBlurWorld])

  /* a scored activity world code asked for, with its grade going back to whoever asked */
  useEffect(() => onBeatRequest((req) => {
    setPaused(false)
    /* the engine's own table first, always, because a bare catalog id already resolves here and an island must never be able to shadow a real class */
    const known = beatById(req.beat, s)
    const built = known ?? islandBeat(req, s)
    /* refused, not answered null: a beat id nobody knows is a typo in somebody's island, and a null grade told them it had worked */
    if (typeof built === 'string') { req.refuse(built); return }
    const beat = built
    /* the attempt count as it stands, so closing without sitting can be told apart from closing after a sitting (`closeAll` says why) */
    setPlaying({ beat, done: req.done, triesAt: attemptsOn(loadSave(), beat.id) })
  }), [onBlurWorld, s])

  const openBook = (tab: HandbookTab) => { setPaused(false); setBook(tab) }
  const openPlanner = () => { setPaused(false); setPlanner(true) }
  const closeAll = () => {
    setBook(null); setPlanner(false); setAdvisory(false); setYearbook(false)
    setGraduation(false); setPaused(false); setSettings(false); setWardrobe(false); setWall(false)
    /* whoever asked for a beat is told it ended, even when it ended by being closed */
    /* an abandoned beat answers nothing, since gradeFromLedger reads whatever row is on the transcript */
    setPlaying((p) => {
      if (!p) return null
      const now = attemptsOn(loadSave(), p.beat.id)
      p.done(now > p.triesAt ? gradeFromLedger(p.beat.id) : null)
      return null
    })
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
  // the year-start vignette: once per year, only while the world is quiet, and an arrival card on screen is the world not being quiet
  /* and it waits for the arrival card first: where you are, then what the year is */
  /* and never before the principal has been met, which the founding flag records */
  const showVignette = !!s?.introDone && s.flags.includes(FOUNDING_FLAG)
    && !anyOpen && !paused && !held && !s.graduated
    && !cardUp && settled && drawn && !s.flags.includes(`vignette:y${s.year}`)

  return (
    <>
      {/* the corner controls: hanging carved signs with a drawn mark and a word on each */}
      {/* a door stands only once it has been handed over, and each waits for its own grant: `plaqueShown` is `!armed || shown.has(which)` and nothing ever calls `armHandover`, so all three signs stood on screen from the first frame; `plaqueShown` still has the last word so a staged handover can hold one back */}
      {/* each door keeps its place in the stack even before it has been handed over */}
      <nav className="hud-stack" aria-label="Game menu">
        {(
        <button
          className={`hud-plaque${plaqueShown('map') && g.chart ? '' : ' hud-plaque-waiting'}${handedOver.includes('map') ? ' hud-arriving' : ''}${entering.has('chart') ? ' hud-arriving' : ''}`}
          data-tour="map"
          aria-label="Map. The islands you have found."
          aria-hidden={!(plaqueShown('map') && g.chart)}
          tabIndex={plaqueShown('map') && g.chart ? undefined : -1}
          aria-haspopup="dialog"
          /* the corner's own Map sign, which is the same door: one chart, three ways in, and none of them a six-tab binder */
          onClick={() => setChart(true)}
        >
          <Glyph piece="icon_set" face="compass" size={22} className="hud-plaque-mark" />
          <span className="hud-plaque-word">Map</span>
        </button>
        )}
        {(
        <button
          className={`hud-plaque${plaqueShown('guide') && g.handbook ? '' : ' hud-plaque-waiting'}${handedOver.includes('guide') ? ' hud-arriving' : ''}${entering.has('handbook') ? ' hud-arriving' : ''}`}
          data-tour="guide"
          aria-label="Guide. What the school offers, and what you have earned."
          aria-hidden={!(plaqueShown('guide') && g.handbook)}
          tabIndex={plaqueShown('guide') && g.handbook ? undefined : -1}
          aria-haspopup="dialog"
          /* the Guide opens on the school and not on the game's own island list, because the handover line promises every club and class at Bonney Lake */
          onClick={() => openBook('school')}
        >
          {/* a drawn book mark, because a student looking for the Guide looks for a book */}
          <span className="hud-plaque-mark kit-mark kit-mark-book" aria-hidden="true" />
          <span className="hud-plaque-word">Guide</span>
        </button>
        )}
        {(
          <button
            className={`hud-plaque${plaqueShown('my-year') && g.tokens ? '' : ' hud-plaque-waiting'}${handedOver.includes('my-year') ? ' hud-arriving' : ''} hud-tokenbtn${entering.has('tokens') ? ' hud-arriving' : ''}`}
            data-tour="my-year"
            /* this reads a save that may not exist yet, because the corner outlives the run */
            /* the label says what the button opens and whether the year is still open */
            aria-label={s?.plans?.[s.year]?.stamped
              ? 'My Year. Your schedule, and the classes you picked.'
              : 'My Year. Pick your classes and what you join.'}
            /* hidden means hidden from a keyboard too, so the plaque carries the pair */
            aria-hidden={!(plaqueShown('my-year') && g.tokens)}
            tabIndex={plaqueShown('my-year') && g.tokens ? undefined : -1}
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
        {/* only three plaques in the corner, because five read as a list of buttons rather than as a shape, and the wall and the wardrobe are things to look at rather than places the year sends you, so they live on the year sheet's own foot in `planner/Planner.tsx` */}
      </nav>

      {book && <Handbook initialTab={book} onClose={closeAll} />}
      {/* the first plan is a screen of cards; every later one is the full year sheet */}
      {planner && !firstPlan && (
        <Planner
          onClose={closeAll}
          onAdvisory={(review) => { setPlanner(false); setAdvisory(review ? 'review' : true) }}
          onPlayPick={(pick) => {
            /* one button per pick: with an island it sails, without one a card counts the pick as done */
            setPlanner(false)
            /* through `grant`, because `awarded` is a bare stamp while `grant` also compares the save either side, so a credit that tips a cord over its line raises the cord's own card; finishing picks from the sheet is the only road to a cord and it was the one road that skipped this */
            const countIt = () => {
              const beforePick = loadSave()
              countAsDone(pick)
              track('pick_counted', { id: pick.id, kind: pick.kind })
              grant(beforePick, loadSave(), {
                what: noIslandLine(pick),
                detail: 'It goes on your year sheet and on the wall.',
              })
              announce(noIslandLine(pick))
            }
            if (pick.map) {
              void requestVoyage(pick.map).then((a) => {
                if (a.ok) { announce(`Sailing to ${pick.name}.`); return }
                /* a row whose map cannot be reached is, from where the player stands, a programme with no island yet, so it takes that road and the year moves; `sail_to`'s refusal is written for whoever builds the island and goes to the console, because on screen it was a dead end the pick stayed owed on */
                console.warn(`[pick ${pick.id}] counted as done, because it cannot be sailed to: ${a.why}`)
                countIt()
              })
              return
            }
            countIt()
          }}
          onLook={(what) => {
            /* remembered so the Back plank comes back HERE (see the mounts below) */
            fromSheet.current = true
            setPlanner(false)
            if (what === 'wall') { track('wall_requested', { via: 'sheet' }); setWall(true) }
            else { track('wardrobe_opened', { via: 'sheet' }); setWardrobe(true) }
          }}
          onYearbook={() => { setPlanner(false); setYearbook(true) }}
        />
      )}
      {planner && firstPlan && <PickYear year={s?.year ?? 1} onClose={closeAll} />}
      {advisory && yearBeat && (
        <CoreBeatRunner beat={yearBeat} review={advisory === 'review'} onClose={closeAll} />
      )}
      {playing && <CoreBeatRunner beat={playing.beat} onClose={closeAll} />}
      {/* a door opened from the year sheet closes back to the sheet */}
      {wall && <TrophyWall onClose={() => { setWall(false); if (fromSheet.current) setPlanner(true) }} />}
      {wardrobe && <Wardrobe onClose={() => { setWardrobe(false); if (fromSheet.current) setPlanner(true) }} />}
      {/* the fourteen seconds that explain the corner */}
      {tour && <Tour onDone={() => { const f = tour; setTour(null); f() }} />}
      {yearbook && <Yearbook onClose={closeAll} onGraduate={() => { setYearbook(false); setGraduation(true) }} />}
      {graduation && <Graduation onClose={closeAll} />}
      {showVignette && s && <YearStart year={s.year} onDone={() => bump((v) => v + 1)} />}
      {settings && <SettingsPanel onClose={() => { setSettings(false); setPaused(true) }} />}

      {help && <HelpCard onClose={() => setHelp(false)} />}
      {chart && <ChartPanel onClose={() => setChart(false)} />}
      {/* and the sheet is gone for the length of a film, the way the corner is */}
      {paused && !anyOpen && !cinemaOn() && (
        <PausePanel onClose={closeAll}>
          <Plank wide keyCap="Esc" onClick={closeAll}>Back to the game</Plank>
          {s?.introDone && <Plank wide onClick={openPlanner}>My Year</Plank>}
          {s?.graduated && (
            <Plank wide onClick={() => { setPaused(false); setGraduation(true) }}>
              {s.flags.includes('gear2') ? 'Walk the stage again' : 'Walk the stage'}
            </Plank>
          )}
          <Plank wide onClick={() => { setPaused(false); setBook('school') }}>Guide</Plank>
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
