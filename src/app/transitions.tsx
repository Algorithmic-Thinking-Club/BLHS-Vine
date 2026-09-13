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

// one controller owns every scene change: cover the screen, swap, uncover

export type TransitionKind = 'fade' | 'foam' | 'iris' | 'chart' | 'scene'

/** what kind of arrival a cover is, which moves its word, its plaque and its picture */
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
  /* ---- PICTURES TO TRY, IN ORDER, BEFORE THE ONE THAT CANNOT MISS ----------
   *
   * A map's own cover lives inside its bundle, and a bundle is fetched from one of
   * two roots depending on how the game was started. Nothing here waits on a
   * request to find out which: the overlay renders the first candidate, and an
   * `onError` walks to the next. So a map with no cover drawn for it yet costs
   * exactly one failed image request and shows the generic art, and a map that has
   * one shows it on the first frame.
   *
   * `image` stays as the single answer for every cover that is not a destination's
   * own, and it is the last candidate when this list is given. */
  images?: string[]
  title?: string
  /* THE SMALL WORD OVER THE PLAQUE, spaced by hand because the letter-spacing on
   * its own reads as tracking and this reads as lettering. Defaults to the one
   * every cover said before there was a choice. */
  kicker?: string
  voice?: CoverVoice
  /** whether this cover carries a fact card, decided by the destination */
  fact?: boolean
}

/* the loading pool is a view of the fact table, never a second list of facts */
export { FACTS, factById, type Fact } from '../game/facts'
import { FACTS } from '../game/facts'

const COVER_MS = 950 // cover-in / cover-out animation time, heavy and calm, never a flash

/** the shortest a cover of this kind is allowed to be, so a fast load does not flash */
export function holdFloorMs(spec: TransitionSpec): number {
  if (typeof spec.holdMs === 'number') return spec.holdMs
  if (spec.kind === 'chart') return 2400
  if (spec.kind === 'scene') return 1800
  return 60
}

type Phase = 'idle' | 'in' | 'hold' | 'out'

/** what the cover is actually doing, which the bar alone cannot say */
export type TransitionWork = 'idle' | 'working' | 'done'

export type TransitionState = {
  phase: Phase
  spec: TransitionSpec
  fact: string
  /** 0 to 1 when a caller reports real work, and null when nobody has */
  progress: number | null
  work: TransitionWork
}

export function makeTransitionState(): TransitionState {
  return { phase: 'idle', spec: { kind: 'fade' }, fact: FACTS[0].text, progress: null, work: 'idle' }
}

/** how a swap says how far along it is. `total` defaults to 1, so a caller with a
 *  fraction passes one number and a caller counting files passes two. */
export type CoverProgress = (done: number, total?: number) => void

/* the transition state at module scope, so any caller can ask for a cover, one at a time */
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

/* the same reporter, reachable at module scope for the length of one cover */
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
  /* ---- A FACT IS COLLECTED WHERE A STUDENT IS (Ash, 2026-09-08 item 8) ----
   *
   * *"The Facts tab reads 0 of 19 forever because facts only collect on covers
   * no student sees: collect them where a student actually is."*
   *
   * The one cover that carried a fact was `kind: 'chart'`, and nothing in the
   * shipped game ever asks for one: every door and every voyage goes through
   * `coverFor`, which returns `kind: 'scene'`. So the pool was nineteen facts
   * about the school that a student could not collect by playing, the Guide's
   * Facts tab read 0 of 19 for the whole of year one, and the Bookworm badge was
   * unreachable.
   *
   * THE SCENE COVER IS WHERE HE IS. It is up for a second and a half every time
   * he goes through the tunnel, sails anywhere or comes home, and it has room
   * under the loading bar that was empty. It is the one screen in this game a
   * student is already looking at with nothing to do. */
  const carriesFact = spec.fact !== false && (spec.kind === 'chart' || spec.kind === 'scene')
  if (carriesFact) {
    collectFact(fact.id)
    track('loading_fact_shown', { id: fact.id })
  }
  /* the bookworm threshold is derived from the fact pool, so it cannot drift from it */
  if ((loadSave()?.facts.length ?? 0) >= bookwormThreshold) grantBadge('bookworm')
  st.phase = 'in'; emit()
  /* one polite announcement of where the player is going, for a screen reader */
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
  /* the bar completes when the swap answers, never on a clock */
  st.progress = 1; st.work = 'done'; emit()
  const left = holdFloorMs(spec) - (performance.now() - t0)
  if (left > 0) await sleep(left)
  st.phase = 'out'; emit()
  await sleep(COVER_MS)
  st.phase = 'idle'; st.work = 'idle'; st.progress = null; emit()
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/* the arrival band, with its type placed by the rectangles MAPVIS marked on the piece */
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

/* what the cover says out loud about itself, in words rather than a colour */
const WORK_WORD: Record<TransitionWork, string> = {
  idle: '',
  working: 'Still loading',
  done: 'Ready',
}

const DEFAULT_KICKER = 'E N T E R I N G'

/* THE COVER'S PICTURE, WALKING ITS CANDIDATES. The last one in the list is the art
 * committed in this repo, so the walk always ends somewhere. Nothing is fetched
 * ahead of time and nothing is awaited: a cover that cannot find a destination's own
 * picture is one aborted request slower and looks identical. */
function CoverImage({ candidates }: { candidates: string[] }) {
  const [i, setI] = useState(0)
  /* a new cover starts its own walk, or the second destination inherits the first
   * one's fallbacks and can never show its own picture */
  const key = candidates.join('|')
  useEffect(() => { setI(0) }, [key])
  const src = candidates[Math.min(i, candidates.length - 1)]
  return (
    <img
      className="pix tr-scene-img"
      src={src}
      alt=""
      draggable={false}
      onError={() => setI((n) => (n + 1 < candidates.length ? n + 1 : n))}
    />
  )
}

export function TransitionOverlay({ st, version }: { st: TransitionState; version: number }) {
  void version // re-render key from the host
  const { phase, spec } = st
  const [needle, setNeedle] = useState(0)
  useEffect(() => {
    if (phase !== 'hold' || spec.kind !== 'chart') return
    /* a settling needle is motion, so under reduced motion it arrives already pointing */
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
    /* the plain arm gets no painting; the name, the fact and the bar are the same words */
    const painted = currentSkin() === 'paper'
    const title = spec.title ?? 'THE SEA'
    return (
      <div className={`tr-root ${cls}`}>
        <div className={`tr-scene tr-voice-${spec.voice ?? 'arrival'}`}>
          {painted && (
            <>
              <CoverImage
                candidates={[
                  ...(spec.images ?? []),
                  spec.image ?? '/art/ui/loading-voyage.png',
                ]}
              />
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
            {/* one class dresses the plaque in whichever skin is on, and the nine-slice is its inset */}
            {/* the name of the place, and nothing under it */}
            <div className="tr-scene-band kit-surface-band" style={band.style}>
              <h1 className="tr-scene-title">{title}</h1>
            </div>
            <div className="tr-scene-meter">
              <Gauge
                value={st.progress}
                label={`Loading ${title}`}
                reading={st.progress === null ? undefined : `${Math.round(st.progress * 100)}%`}
              />
              <p className="tr-scene-work">{WORK_WORD[st.work]}</p>
            </div>
            {/* and the thing he learns while he waits, which is the only place in
                year one nineteen true sentences about the school can reach him */}
            {spec.fact !== false && <p className="tr-scene-fact">{st.fact}</p>}
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
