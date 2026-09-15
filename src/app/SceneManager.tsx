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
    /* this tab says it is the one having the run, so a refresh mid play comes back to the same map while a pasted address in a fresh window does not (`app/entry.ts`), and it is stamped on scene changes only so a tab left open all afternoon goes stale and lands on the title */
    markTabLive()
  }, [current])

  /* one tab holds the run: a playing scene renews a claim in localStorage every few seconds and the title reads it, because both tabs write the whole save on every change and the older copy would land on top of the newer one, losing a class with nothing said; leaving the world frees the claim at once */
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
