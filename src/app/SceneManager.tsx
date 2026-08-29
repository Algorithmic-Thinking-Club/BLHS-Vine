import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  cover, subscribeTransition, transitionState, transitionVersion, TransitionOverlay,
  type TransitionSpec,
} from './transitions'
import { setContext, startHeartbeat, track } from '../game/telemetry'

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

export function SceneManager({ initial, registry, overlay }: { initial: string; registry: SceneRegistry; overlay?: ReactNode }) {
  const [current, setCurrent] = useState(initial)
  /* THE STATE IS NOT THIS COMPONENT'S ANY MORE (E1). It lives at module scope in
   * transitions.tsx so a door swap inside a painted map can drive the same
   * controller, and this component is now one of three callers rather than the
   * owner. What is left here is re-rendering the overlay when it changes. */
  const [, setTrVersion] = useState(0)
  useEffect(() => subscribeTransition(() => setTrVersion(transitionVersion())), [])

  const go = useCallback((to: string, spec?: TransitionSpec) => {
    if (to === current) return
    if (!registry[to]) { console.warn('SceneManager: scene not registered:', to); return }
    void cover(spec ?? { kind: 'fade' }, () => {
      setCurrent(to)
      // give the new scene two frames to mount before the cover lifts
      return new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    })
  }, [current, registry])

  const nav = useMemo<Nav>(() => ({ go, current }), [go, current])
  const Scene = registry[current]

  /* THE CLOCK STARTS HERE, once, for the whole run, because the scene manager is
   * the one component that outlives every scene. A duration owned by a scene is a
   * duration lost when the scene is torn down, and the bell lands mid-scene far
   * more often than at a boundary. Every heartbeat carries which scene is on
   * screen, so time on task is per scene without any scene knowing about it. */
  useEffect(() => { startHeartbeat() }, [])
  useEffect(() => {
    setContext({ scene: current })
    track('scene_shown', { scene: current })
  }, [current])

  return (
    <NavCtx.Provider value={nav}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#06121a' }}>
        {Scene ? Scene() : null}
        {/* scene-independent chrome (the world HUD) rides above the scene, below covers */}
        {overlay}
        <TransitionOverlay st={transitionState()} version={transitionVersion()} />
      </div>
    </NavCtx.Provider>
  )
}
