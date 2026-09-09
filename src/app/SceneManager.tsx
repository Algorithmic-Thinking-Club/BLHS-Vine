import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  cover, subscribeTransition, transitionState, transitionVersion, TransitionOverlay,
  type TransitionSpec,
} from './transitions'
import { setContext, startHeartbeat, track } from '../game/telemetry'
import { CLAIM_BEAT_MS, PLAYING_SCENES, claimPlaying, markTabLive, releasePlaying } from './entry'

// scenes register by id, and every navigation runs through one covered transition

export type SceneRegistry = Record<string, () => ReactNode>

type Nav = { go: (to: string, spec?: TransitionSpec) => void; current: string }
const NavCtx = createContext<Nav | null>(null)
export function useNav() {
  const c = useContext(NavCtx)
  if (!c) throw new Error('useNav must be used inside <SceneManager>')
  return c
}

/** the navigator if there is one, and null if there is not, so a caller can go without it */
export function useNavMaybe(): Nav | null {
  return useContext(NavCtx)
}

export function SceneManager({ initial, registry, overlay }: { initial: string; registry: SceneRegistry; overlay?: ReactNode }) {
  const [current, setCurrent] = useState(initial)
  /* the transition state lives at module scope, so all this does is re-render the overlay */
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

  /* the run's clock starts here once, since this component outlives every scene */
  useEffect(() => { startHeartbeat() }, [])
  useEffect(() => {
    setContext({ scene: current })
    track('scene_shown', { scene: current })
    /* AND THIS TAB SAYS IT IS THE ONE HAVING THE RUN. It is what makes a
     * refresh mid-play come back to the same map while a pasted address in a
     * fresh window does not (`app/entry.ts`). Stamped on scene changes only, so
     * a tab left open all afternoon goes stale and lands on the title. */
    markTabLive()
  }, [current])

  /* ---- ONE TAB HOLDS THE RUN (Ash, 2026-09-09) ---------------------------
   *
   * A scene that is having the run renews a claim in localStorage every few
   * seconds; the title reads it and tells a second tab what is going on. Both
   * tabs write the whole save on every change, so without this the older copy
   * lands on top of the newer one and a student loses a class with nothing said.
   * Leaving the world lets the claim go at once, so walking out to the title in
   * one tab frees the other on its next look. */
  useEffect(() => {
    if (!PLAYING_SCENES.has(current)) { releasePlaying(); return }
    claimPlaying()
    const beat = window.setInterval(claimPlaying, CLAIM_BEAT_MS)
    return () => { window.clearInterval(beat); releasePlaying() }
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
