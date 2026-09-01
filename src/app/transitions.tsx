import { useEffect, useState, type CSSProperties } from 'react'
import { collectFact, grantBadge, loadSave } from '../game/save'
import { track } from '../game/telemetry'
import { kitCached, kitOptedIn, kitPiece, kitSlot } from '../game/ui/kit'
import { currentSkin } from '../game/ui/skin'
import './transitions.css'

// The transition library (GAME-DESIGN §12.1): one controller owns every scene change —
// cover-in, swap, cover-out — so there is never a hard cut or a raw spinner. Covers are
// PixelLab art animated in code. The chart cover doubles as the loading card: a compass
// needle settling + one real BLHS fact (§4.9), because the wait should teach.

export type TransitionKind = 'fade' | 'foam' | 'iris' | 'chart' | 'scene'

export type TransitionSpec = {
  kind: TransitionKind
  /** minimum time the cover holds fully closed (chart/scene want 2000-3000) */
  holdMs?: number
  /** iris focus point in viewport fractions (default center) */
  focus?: { x: number; y: number }
  /** scene cover (the TavernWorld pattern, Ash 2026-07-02): a full-bleed PixelLab
   *  illustration + ENTERING <title> + a filling bar + code-animated life */
  image?: string
  title?: string
}

/* THE LOADING POOL IS A VIEW OF THE FACT TABLE, not a second list of facts.
 * Every statement about Bonney Lake lives in src/game/facts.ts with the document
 * it came out of and the date somebody read it. This file draws the card. It used
 * to own the sentences, and three of them said things no source does. */
export { FACTS, factById, type Fact } from '../game/facts'
import { FACTS } from '../game/facts'

const COVER_MS = 950 // cover-in / cover-out animation time — heavy and calm, never a flash

type Phase = 'idle' | 'in' | 'hold' | 'out'

export type TransitionState = {
  phase: Phase
  spec: TransitionSpec
  fact: string
}

export function makeTransitionState(): TransitionState {
  return { phase: 'idle', spec: { kind: 'fade' }, fact: FACTS[0].text }
}

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

/** cover the screen, run `swap`, uncover. Resolves when the cover has lifted.
 *  Answers false without doing anything if one is already running. */
export async function cover(spec: TransitionSpec, swap: () => void | Promise<void>): Promise<boolean> {
  if (host.busy) return false
  host.busy = true
  try {
    await runTransition(host.st, emitHost, spec, swap)
    return true
  } finally {
    host.busy = false
  }
}

/** drive a full transition: cover-in -> swap() -> hold -> cover-out */
export async function runTransition(
  st: TransitionState,
  emit: () => void,
  spec: TransitionSpec,
  swap: () => void | Promise<void>,
) {
  st.spec = spec
  // prefer a fact the player hasn't learned yet; collected ones return once the pool empties
  const learned = new Set(loadSave()?.facts ?? [])
  const pool = FACTS.filter((f) => !learned.has(f.id))
  const fact = (pool.length ? pool : FACTS)[Math.floor(Math.random() * (pool.length ? pool.length : FACTS.length))]
  st.fact = fact.text
  if (spec.kind === 'chart' || spec.kind === 'scene') {
    collectFact(fact.id)
    track('loading_fact_shown', { id: fact.id })
    if ((loadSave()?.facts.length ?? 0) >= 25) grantBadge('bookworm')
  }
  st.phase = 'in'; emit()
  await sleep(COVER_MS)
  st.phase = 'hold'; emit()
  const t0 = performance.now()
  await swap()
  const left = (spec.holdMs ?? (spec.kind === 'chart' ? 2400 : 60)) - (performance.now() - t0)
  if (left > 0) await sleep(left)
  st.phase = 'out'; emit()
  await sleep(COVER_MS)
  st.phase = 'idle'; emit()
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

export function TransitionOverlay({ st, version }: { st: TransitionState; version: number }) {
  void version // re-render key from the host
  const { phase, spec } = st
  const [needle, setNeedle] = useState(0)
  useEffect(() => {
    if (phase !== 'hold' || spec.kind !== 'chart') return
    // the compass needle settles as the progress element — eased swings that die out
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
    return (
      <div className={`tr-root ${cls}`}>
        <div className="tr-scene">
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
          <div className="tr-scene-text">
            <div className="tr-scene-entering">E N T E R I N G</div>
            <div className={`tr-scene-band${band.worn ? ' kit-surface-band' : ''}`} style={band.style}>
              <div className="tr-scene-title">{spec.title ?? 'THE OPEN SEA'}</div>
              {/* two names on purpose: the band's authored rectangle is called
                  `subtitle` and this line is what goes in it, and `tr-scene-fact`
                  is the handle `scripts/wave2-proof.mjs` reads the loading fact
                  out of. Renaming it would break a proof run this session does
                  not own. */}
              <div className="tr-scene-subtitle tr-scene-fact">{st.fact}</div>
            </div>
            <div className="tr-scene-bar"><span style={{ animationDuration: `${(spec.holdMs ?? 2600) + 620}ms` }} /></div>
          </div>
        </div>
      </div>
    )
  }
  if (spec.kind === 'chart') {
    return (
      <div className={`tr-root ${cls}`}>
        <div className="tr-chart-field" />
        <div className="tr-chart">
          <img className="pix tr-chart-img" src="/art/ui/chart-cover.png" alt="" draggable={false} />
          <div className="tr-chart-needle" style={{ transform: `translate(-50%, -100%) rotate(${needle}deg)` }} />
          <div className="tr-chart-fact">{st.fact}</div>
        </div>
      </div>
    )
  }
  return <div className={`tr-root ${cls}`}><div className="tr-fade" /></div>
}
