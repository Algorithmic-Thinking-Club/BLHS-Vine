import { useEffect, useState } from 'react'
import { collectFact, grantBadge, loadSave } from '../game/save'
import { track } from '../game/telemetry'
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
            <div className="tr-scene-title">{spec.title ?? 'THE OPEN SEA'}</div>
            <div className="tr-scene-bar"><span style={{ animationDuration: `${(spec.holdMs ?? 2600) + 620}ms` }} /></div>
            <div className="tr-scene-fact">{st.fact}</div>
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
