import { useEffect, useState, type CSSProperties } from 'react'
import { collectFact, grantBadge, loadSave } from '../game/save'
import { bookwormThreshold } from '../game/badges'
import { track } from '../game/telemetry'
import { announce } from '../game/ui/a11y'
import { Gauge } from '../game/ui/controls'
import { kitCached, kitOptedIn, kitPiece, kitSlot } from '../game/ui/kit'
import { prefersReducedMotion } from '../game/ui/motion'
import { currentSkin } from '../game/ui/skin'
import './transitions.css'

// The transition library (GAME-DESIGN §12.1): one controller owns every scene change,
// cover-in, swap, cover-out, so there is never a hard cut or a raw spinner. Covers are
// PixelLab art animated in code. The chart cover doubles as the loading card: a compass
// needle settling plus one real BLHS fact (§4.9), because the wait should teach.

export type TransitionKind = 'fade' | 'foam' | 'iris' | 'chart' | 'scene'

/* ---- WHAT KIND OF ARRIVAL THIS IS, WHICH IS NOT THE SAME AS WHAT IT LOOKS LIKE
 *
 * §4.1, on the second painted cover a student ever sees: it has to "say something
 * different from the archipelago cover", because "if both are a name over a
 * painting over a fact, the second one teaches the student that covers are a tax
 * rather than an arrival."
 *
 * So a cover carries a VOICE as well as a picture, and the voice moves three
 * things a student can actually see: the word over the plaque, where the plaque
 * sits on the painting, and which painting it is. `covers.ts` chooses it from the
 * destination. Sailing into a place and stepping into a room off a corridor are
 * not the same event and they no longer look like the same event.
 *
 *   arrival   you have reached a place. The plaque sits high, over the horizon.
 *   inside    you have gone into a room. The plaque hangs low, the way a sign in
 *             a room hangs at eye level rather than on the sky.
 *   crossing  you are between two places and have not got there yet.
 *   ceremony  §14.4, and the one cover in the game that carries no fact card. */
export type CoverVoice = 'arrival' | 'inside' | 'crossing' | 'ceremony'

export type TransitionSpec = {
  kind: TransitionKind
  /** minimum time the cover holds fully closed, and the FLOOR rather than the length */
  holdMs?: number
  /** iris focus point in viewport fractions (default center) */
  focus?: { x: number; y: number }
  /** scene cover (the TavernWorld pattern, Ash 2026-07-02): a full-bleed PixelLab
   *  illustration, the kicker, the place's name on a drawn plaque, and a bar */
  image?: string
  title?: string
  /* THE SMALL WORD OVER THE PLAQUE, spaced by hand because the letter-spacing on
   * its own reads as tracking and this reads as lettering. Defaults to the one
   * every cover said before there was a choice. */
  kicker?: string
  voice?: CoverVoice
  /* §14.4, in as many words: "A fact card does not belong on this cover. The run
   * is over, the fact pool exists to teach during a wait, and a freshman-facing
   * club fact under the word Graduation is the wrong instrument at the wrong
   * moment." A per-destination switch rather than a rule inside the renderer,
   * because the destination is the thing that knows. */
  fact?: boolean
}

/* THE LOADING POOL IS A VIEW OF THE FACT TABLE, not a second list of facts.
 * Every statement about Bonney Lake lives in src/game/facts.ts with the document
 * it came out of and the date somebody read it. This file draws the card. It used
 * to own the sentences, and three of them said things no source does. */
export { FACTS, factById, type Fact } from '../game/facts'
import { FACTS } from '../game/facts'

const COVER_MS = 950 // cover-in / cover-out animation time, heavy and calm, never a flash

/* ---- ONE FLOOR, READ BY THE CONTROLLER AND BY THE BAR --------------------
 *
 * THESE WERE TWO NUMBERS AND THEY DISAGREED. The controller waited
 * `spec.holdMs ?? (kind === 'chart' ? 2400 : 60)` and the bar's CSS animation ran
 * for `(spec.holdMs ?? 2600) + 620`, so a scene cover with no `holdMs` held for
 * 60 milliseconds while its bar was drawn to take 3.2 seconds. The bar was not
 * slightly optimistic, it was measuring a different transition.
 *
 * It is one function now and the bar does not run on a clock at all, so the only
 * thing this number still decides is the FLOOR: the shortest a cover is allowed
 * to be, so a bundle that comes back in eighty milliseconds does not flash.
 * §3.1's rule is the reason there is a floor and the reason it is only a floor:
 * "A cover that finishes early and waits, or lifts before the world is ready, is
 * worse than a longer honest one." */
export function holdFloorMs(spec: TransitionSpec): number {
  if (typeof spec.holdMs === 'number') return spec.holdMs
  if (spec.kind === 'chart') return 2400
  if (spec.kind === 'scene') return 1800
  return 60
}

type Phase = 'idle' | 'in' | 'hold' | 'out'

/* WHAT THE COVER IS ACTUALLY DOING, which is the half of the honesty the bar
 * cannot carry on its own. A bar at 34 percent and a bar that has finished look
 * different; a bar that has finished and a cover that is only serving out its
 * floor look identical, and they are not the same thing to a student watching. */
export type TransitionWork = 'idle' | 'working' | 'done'

export type TransitionState = {
  phase: Phase
  spec: TransitionSpec
  fact: string
  /* 0..1 WHEN SOMETHING IS REALLY COUNTING, AND null WHEN NOTHING IS.
   *
   * §4.1 and §3.1 both ask for a bar driven by the real load. The honest shape of
   * that is two values and not one: a fraction when a caller has told us how much
   * of its work is done, and NOTHING when nobody has, which `Gauge` draws as a
   * pacing bar rather than as a number it does not have. The one thing this is
   * never allowed to be is a clock. */
  progress: number | null
  work: TransitionWork
}

export function makeTransitionState(): TransitionState {
  return { phase: 'idle', spec: { kind: 'fade' }, fact: FACTS[0].text, progress: null, work: 'idle' }
}

/** how a swap says how far along it is. `total` defaults to 1, so a caller with a
 *  fraction passes one number and a caller counting files passes two. */
export type CoverProgress = (done: number, total?: number) => void

/* ---- E1: THE TRANSITION CONTROLLER, SEPARATED FROM SCENE ROUTING -----------
 *
 * §80.4's first load-bearing entry, and the reason it is load-bearing is one
 * sentence: `runTransition` was owned by `SceneManager.go()`, and a `PmapScene`
 * door swap runs its own 400 millisecond black fade and never calls it, so the
 * five covers and the whole fact pool were unreachable from THE MOST COMMON
 * ACTION IN THE GAME. Every door on every island, covered by nothing.
 *
 * A transition is a thing the game does, not a thing a route does. So the state
 * lives here, at module scope, and three callers can ask for one: the router,
 * a door swap inside a scene, and a station or a cutscene that wants a page to
 * turn without owning a scene change. The overlay is mounted once by
 * `SceneManager` and subscribes; it does not own the state any more.
 *
 * ONE AT A TIME, and the second caller is refused rather than queued. Two covers
 * over each other is a black screen with no way out, and the refusal is a value
 * the caller can act on. */
const host = {
  st: makeTransitionState(),
  version: 0,
  busy: false,
  listeners: new Set<() => void>(),
}

const emitHost = () => { host.version++; for (const fn of host.listeners) fn() }

export function subscribeTransition(fn: () => void): () => void {
  host.listeners.add(fn)
  return () => { host.listeners.delete(fn) }
}

export const transitionState = (): TransitionState => host.st
export const transitionVersion = (): number => host.version
export const transitionBusy = (): boolean => host.busy

/* ---- REPORTING FROM SOMEWHERE DEEP IN THE LOAD ----------------------------
 *
 * The swap is handed a reporter, which is the right shape when the thing doing
 * the work is the thing that was handed it. It usually is not: the door swap in
 * `PmapScene` calls `setTarget` and waits for a scene several components away to
 * raise a flag, and threading a callback through a React effect boundary to get
 * one number back is a worse cure than the disease.
 *
 * So the same reporter is reachable at module scope for the length of one cover.
 * It is a no-op when no cover is up, which is what makes it safe to call from a
 * loader that does not know or care whether anything is covering the screen. */
let liveReport: CoverProgress | null = null

/** say how much of the real work behind the current cover is done. Ignored when
 *  no cover is running, so a loader can call it unconditionally. */
export function reportCoverProgress(done: number, total = 1): void {
  liveReport?.(done, total)
}

/** cover the screen, run `swap`, uncover. Resolves when the cover has lifted.
 *  Answers false without doing anything if one is already running. */
export async function cover(
  spec: TransitionSpec,
  swap: (report: CoverProgress) => void | Promise<void>,
): Promise<boolean> {
  if (host.busy) return false
  host.busy = true
  try {
    await runTransition(host.st, emitHost, spec, swap)
    return true
  } finally {
    host.busy = false
  }
}

/** drive a full transition: cover-in -> swap() -> the floor -> cover-out */
export async function runTransition(
  st: TransitionState,
  emit: () => void,
  spec: TransitionSpec,
  swap: (report: CoverProgress) => void | Promise<void>,
) {
  st.spec = spec
  st.progress = null
  st.work = 'idle'
  // prefer a fact the player hasn't learned yet; collected ones return once the pool empties
  const learned = new Set(loadSave()?.facts ?? [])
  const pool = FACTS.filter((f) => !learned.has(f.id))
  const fact = (pool.length ? pool : FACTS)[Math.floor(Math.random() * (pool.length ? pool.length : FACTS.length))]
  st.fact = fact.text
  const carriesFact = spec.fact !== false && (spec.kind === 'chart' || spec.kind === 'scene')
  if (carriesFact) {
    collectFact(fact.id)
    track('loading_fact_shown', { id: fact.id })
    /* THE THRESHOLD IS THE POOL, READ FROM THE POOL. Twenty-five was typed here
     * against a pool of eighteen; the pool has been nineteen for months, and the
     * Handbook stated a goal to a student that the game could not honour. A
     * number derived from `FACTS` cannot drift away from the content again, and
     * `badges.ts` states the same criterion off the same constant so the card and
     * the grant can never disagree. */
    if ((loadSave()?.facts.length ?? 0) >= bookwormThreshold) grantBadge('bookworm')
  }
  st.phase = 'in'; emit()
  /* THE READER IS TOLD WHERE THEY ARE GOING, ONCE. A cover replaces the entire
   * screen and, until this line, said nothing at all to a screen reader: no
   * heading, no live region, no name. One polite announcement rather than an
   * aria-live on the overlay, because a live overlay would read the bar's
   * percentage out loud every time it moved. */
  if (spec.kind === 'scene' || spec.kind === 'chart') {
    const said = [spec.title, carriesFact ? st.fact : ''].filter(Boolean).join('. ')
    if (said) announce(said)
  }
  await sleep(COVER_MS)
  st.phase = 'hold'; st.work = 'working'; emit()
  const t0 = performance.now()
  /* the reporter lives exactly as long as the swap does, so a loader that answers
   * late cannot move a bar belonging to the next cover */
  const report: CoverProgress = (done, total = 1) => {
    if (!(total > 0) || !Number.isFinite(done)) return
    const p = Math.max(0, Math.min(1, done / total))
    if (st.progress === p) return
    st.progress = p
    emit()
  }
  liveReport = report
  try {
    await swap(report)
  } finally {
    liveReport = null
  }
  /* THE BAR COMPLETES ON THE WORK AND NOT ON THE CLOCK. Nobody has to report for
   * this to be true: the swap answering IS the work finishing, so the bar reaches
   * the end at the moment the map is really there. What the floor below adds is a
   * held FULL bar, which reads as "ready, one moment" rather than as a bar that
   * is still filling. Those two are different pictures and the student is owed
   * the true one. */
  st.progress = 1; st.work = 'done'; emit()
  const left = holdFloorMs(spec) - (performance.now() - t0)
  if (left > 0) await sleep(left)
  st.phase = 'out'; emit()
  await sleep(COVER_MS)
  st.phase = 'idle'; st.work = 'idle'; st.progress = null; emit()
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/* ---- the arrival band, dressed from the piece MAPVIS drew for it -----------
 *
 * `band` is published as 636x161 with a nine-slice and two marked rectangles,
 * `title` and `subtitle`. The rectangles are the point: the inside of a painted
 * surface used to be a percentage somebody measured in an image editor and typed
 * into a stylesheet, and `docs/UI-KIT.md` opens by complaining about exactly
 * that. These are read off the piece, so when Ash repaints the band and re-marks
 * it the lettering follows with no edit here.
 *
 * THE RECTANGLES ARE USED EVEN WHEN THE ART IS NOT. `?kit=1` decides whether the
 * platform's border-image paints, and that is a judgement about how the whole
 * chrome looks that only Ash makes. Where the type sits inside the band is not
 * that judgement, so the authored insets dress the fallback plaque too, and the
 * flag changes the frame rather than the layout.
 *
 * `worn` is refused for the plain arm on purpose: §16 is the study's independent
 * variable and it does not get drawn art from anywhere, including the platform. */
type BandDress = { worn: boolean; style?: CSSProperties }

export function bandDress(
  pieces = kitCached(),
  worn = kitOptedIn() && currentSkin() === 'paper',
): BandDress {
  if (!pieces?.length) return { worn: false }
  const piece = kitPiece(pieces, 'band')
  const title = kitSlot(pieces, 'band', 'title')
  const sub = kitSlot(pieces, 'band', 'subtitle')
  /* a piece that is missing a rectangle is a piece nobody finished marking, and
   * the honest answer is the stylesheet's own numbers rather than a half-read
   * one that puts the name of a place through the frame */
  if (!piece || !title || !sub || !(piece.w > 0 && piece.h > 0)) return { worn: false }
  return {
    worn,
    style: {
      '--band-pad-l': `${title.x}px`,
      '--band-pad-r': `${piece.w - (title.x + title.w)}px`,
      '--band-pad-t': `${title.y}px`,
      '--band-pad-b': `${piece.h - (sub.y + sub.h)}px`,
      '--band-title-h': `${title.h}px`,
      '--band-sub-h': `${sub.h}px`,
    } as CSSProperties,
  }
}

/* ---- what the cover says out loud about itself ---------------------------
 *
 * WORDS RATHER THAN A COLOUR, and a word that changes rather than a bar that
 * creeps. §40.31 forbids a state carried by hue alone and a school Chromebook
 * panel is the reason: it crushes the difference between a gold bar at 90 percent
 * and a gold bar at 100. The sentence under the bar moves instead. */
const WORK_WORD: Record<TransitionWork, string> = {
  idle: '',
  working: 'Still loading',
  done: 'Ready',
}

const DEFAULT_KICKER = 'E N T E R I N G'

export function TransitionOverlay({ st, version }: { st: TransitionState; version: number }) {
  void version // re-render key from the host
  const { phase, spec } = st
  const [needle, setNeedle] = useState(0)
  useEffect(() => {
    if (phase !== 'hold' || spec.kind !== 'chart') return
    /* W12: A SETTLING NEEDLE IS MOTION AND THE SETTING REACHES IT. This ran
     * unconditionally, so the one reduced-motion student in the room watched a
     * compass swing for two and a half seconds with nothing able to stop it. The
     * needle still points; it just arrives already pointing. */
    if (prefersReducedMotion()) { setNeedle(0); return }
    // the compass needle settles as the progress element: eased swings that die out
    let raf = 0
    const t0 = performance.now()
    const step = () => {
      const t = (performance.now() - t0) / 1000
      setNeedle(52 * Math.exp(-t * 1.4) * Math.sin(t * 7 + 1.2))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phase, spec.kind])

  if (phase === 'idle') return null
  const cls = phase === 'in' ? 'tr-in' : phase === 'out' ? 'tr-out' : 'tr-hold'

  if (spec.kind === 'foam') {
    return (
      <div className={`tr-root ${cls}`}>
        <div className="tr-foam-wash" />
        <div className="tr-foam-lace" />
      </div>
    )
  }
  if (spec.kind === 'iris') {
    const f = spec.focus ?? { x: 0.5, y: 0.5 }
    return (
      <div className={`tr-root ${cls}`}>
        <div className="tr-iris" style={{ ['--fx' as string]: `${f.x * 100}%`, ['--fy' as string]: `${f.y * 100}%` }} />
      </div>
    )
  }
  if (spec.kind === 'scene') {
    const band = bandDress()
    /* §16: THE PLAIN ARM GETS NO PAINTING, and that is the whole of what it does
     * not get. The place's name, the fact and the bar are content and are the
     * same words in both arms, per the 2026-08-28 content-and-vehicle rule
     * §10.4 restates: "the card is content, so it renders in both arms as the
     * same sentence." The picture, the vignette and the twinkles are vehicle. */
    const painted = currentSkin() === 'paper'
    const carriesFact = spec.fact !== false
    const title = spec.title ?? 'THE SEA'
    return (
      <div className={`tr-root ${cls}`}>
        <div className={`tr-scene tr-voice-${spec.voice ?? 'arrival'}`}>
          {painted && (
            <>
              <img className="pix tr-scene-img" src={spec.image ?? '/art/ui/loading-voyage.png'} alt="" draggable={false} />
              <div className="tr-scene-vig" />
              <div className="tr-scene-twinkles">
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} className="tr-twinkle" style={{
                    left: `${(i * 71 + 13) % 100}%`, top: `${(i * 37 + 9) % 72}%`,
                    animationDelay: `${(i * 0.37) % 2.4}s`,
                  }} />
                ))}
              </div>
            </>
          )}
          <div className="tr-scene-text">
            <div className="tr-scene-entering">{spec.kicker ?? DEFAULT_KICKER}</div>
            {/* THE PLAQUE IS DRAWN IN EVERY SKIN THAT HAS ART, which is what
                `kit-surface-band` buys and what a conditional class was costing.
                The class used to go on only when the PLATFORM's band had landed,
                so the ordinary run of the game, with no `?kit=1`, drew the one
                surface in the game that was not an object: a CSS gradient with
                four box-shadows pretending to be a carved rail. tokens.css
                already answers `.kit-surface-band` with the drawn dialogue frame
                when the platform has sent nothing, and answers it with a flat
                bordered sheet under `data-skin='plain'`, so one class gives all
                three arms the right thing and the nine-slice is the inset. */}
            <div className="tr-scene-band kit-surface-band" style={band.style}>
              <h1 className="tr-scene-title">{title}</h1>
              {/* two names on purpose: the band's authored rectangle is called
                  `subtitle` and this line is what goes in it, and `tr-scene-fact`
                  is the handle `scripts/wave2-proof.mjs` reads the loading fact
                  out of. Renaming it would break a proof run this session does
                  not own. */}
              {carriesFact && <p className="tr-scene-subtitle tr-scene-fact">{st.fact}</p>}
            </div>
            <div className="tr-scene-meter">
              <Gauge
                value={st.progress}
                label={`Loading ${title}`}
                reading={st.progress === null ? undefined : `${Math.round(st.progress * 100)}%`}
              />
              <p className="tr-scene-work">{WORK_WORD[st.work]}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (spec.kind === 'chart') {
    const painted = currentSkin() === 'paper'
    return (
      <div className={`tr-root ${cls}`}>
        <div className="tr-chart-field" />
        <div className="tr-chart">
          {painted && (
            <>
              <img className="pix tr-chart-img" src="/art/ui/chart-cover.png" alt="" draggable={false} />
              <div className="tr-chart-needle" style={{ transform: `translate(-50%, -100%) rotate(${needle}deg)` }} />
            </>
          )}
          {spec.fact !== false && <p className="tr-chart-fact">{st.fact}</p>}
        </div>
      </div>
    )
  }
  return <div className={`tr-root ${cls}`}><div className="tr-fade" /></div>
}
