import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { makeTransitionState, runTransition, TransitionOverlay, type TransitionSpec } from './transitions'

// The backbone of the whole game: scenes (boot, title, the intro beach, the island map,
// interiors, the graduation summary) register by id; every navigation runs through ONE
// transition controller (GAME-DESIGN §12.1) — cover-in, swap, cover-out — so there is never
// a hard cut or a blank frame. `go(to)` keeps the old fade; `go(to, spec)` picks a crafted
// cover (foam wash, iris on a focus point, the chart-unroll loading card).

export type SceneRegistry = Record<string, () => ReactNode>

type Nav = { go: (to: string, spec?: TransitionSpec) => void; current: string }
const NavCtx = createContext<Nav | null>(null)
export function useNav() {
  const c = useContext(NavCtx)
  if (!c) throw new Error('useNav must be used inside <SceneManager>')
  return c
}

export function SceneManager({ initial, registry }: { initial: string; registry: SceneRegistry }) {
  const [current, setCurrent] = useState(initial)
  const busy = useRef(false)
  const trState = useRef(makeTransitionState())
  const [trVersion, setTrVersion] = useState(0)

  const go = useCallback((to: string, spec?: TransitionSpec) => {
    if (busy.current || to === current) return
    if (!registry[to]) { console.warn('SceneManager: scene not registered:', to); return }
    busy.current = true
    void runTransition(
      trState.current,
      () => setTrVersion((v) => v + 1),
      spec ?? { kind: 'fade' },
      () => {
        setCurrent(to)
        // give the new scene two frames to mount before the cover lifts
        return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      },
    ).finally(() => { busy.current = false })
  }, [current, registry])

  const nav = useMemo<Nav>(() => ({ go, current }), [go, current])
  const Scene = registry[current]

  return (
    <NavCtx.Provider value={nav}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#06121a' }}>
        {Scene ? Scene() : null}
        <TransitionOverlay st={trState.current} version={trVersion} />
      </div>
    </NavCtx.Provider>
  )
}
