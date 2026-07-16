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

// every fact here is verified BLHS reality (docs/research/blhs-specifics.md); nothing
// invented. Facts collect into the Handbook (§8.5); the picker prefers ones not yet learned
// (§4.9 — the wait teaches), so waits stay fresh until the pool is exhausted.
export const FACTS: { id: string; text: string }[] = [
  { id: 'f-opened', text: 'Bonney Lake High School opened in 2005. The Panthers have been teal and black from day one.' },
  { id: 'f-ap-school', text: 'BLHS is the AP school of the Sumner-Bonney Lake district. AP Capstone lives here.' },
  { id: 'f-power', text: 'The POWER values are the school’s compass. You’ll meet all five letters.' },
  { id: 'f-students', text: 'Around 1,700 students walk the halls of BLHS. Every one of them started as a freshman.' },
  { id: 'f-becu', text: 'BLHS runs a real in-school BECU branch. It opened back in 2006.' },
  { id: 'f-cte-cord', text: 'Earn two CTE credits and the Career Readiness cord is yours at graduation.' },
  { id: 'f-seal', text: 'Three or more years of one world language can earn the Seal of Biliteracy.' },
  { id: 'f-cords', text: 'The counseling office tracks every honor cord. So does your Handbook.' },
  // core-beat takeaways (§7.3) land in this same pool — one truth per fact, one id per card
  { id: 'f-power-full', text: 'Panther POWER: Perseverance, Ownership, Work Ethic, Engagement, Respect. Five letters, the whole culture.' },
  { id: 'f-monday', text: 'Mondays start late at 8:30 and advisory meets that morning. Every other day starts at 7:25.' },
  { id: 'f-25th-credit', text: 'Passing advisory pays .125 elective credit each semester. The catalog calls it the 25th credit.' },
  { id: 'f-join-clubs', text: 'Joining a club is finding its meeting and walking in. DECA meets Thursdays 2:10 in the 200 Flex.' },
  { id: 'f-honor-gpa', text: 'Double gold cords mean Highest Honors: a 3.76 to 4.0 GPA. Black and silver is High Honors, 3.5 and up.' },
  { id: 'f-retake', text: 'Score under 79% with real effort behind it and the Universal Retake Policy lets you take the summative again.' },
  { id: 'f-24-credits', text: 'A diploma takes 24 credits: 4 English, 3 math, 3 science, 3 social studies, 2 arts, 2 language, 2 health and fitness, 1 CTE, 4 electives.' },
  { id: 'f-capstone', text: 'AP Capstone is a recipe: AP Seminar, then AP Research, plus four more APs, with the exams passed.' },
  { id: 'f-running-start', text: 'Juniors and seniors can Running Start: real courses at local colleges, credit on both transcripts.' },
  { id: 'f-hsbp', text: 'Every Washington graduate finishes a High School and Beyond Plan: where you are headed after the stage, and how.' },
]

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
