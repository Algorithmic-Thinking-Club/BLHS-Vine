import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

// The backbone of the whole game: scenes (boot, title, join, loading, dressing room,
// overworld, the set-sail cutscene, island interiors, the graduation summary) are
// registered by id; navigation between them runs through one place with a transition
// overlay. The specific screens + transition types are built on top of this; this file
// is just the mechanism so nothing has to reinvent routing or fades.

export type SceneRegistry = Record<string, () => ReactNode>

type Nav = { go: (to: string) => void; current: string }
const NavCtx = createContext<Nav | null>(null)
export function useNav() {
  const c = useContext(NavCtx)
  if (!c) throw new Error('useNav must be used inside <SceneManager>')
  return c
}

const FADE_MS = 420

export function SceneManager({ initial, registry }: { initial: string; registry: SceneRegistry }) {
  const [current, setCurrent] = useState(initial)
  const [fade, setFade] = useState(0) // 0 = clear, 1 = black
  const busy = useRef(false)

  const go = useCallback((to: string) => {
    if (busy.current || to === current) return
    if (!registry[to]) { console.warn('SceneManager: scene not registered:', to); return }
    busy.current = true
    setFade(1) // fade out
    window.setTimeout(() => {
      setCurrent(to)
      // let the new scene mount, then fade back in
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setFade(0)
        window.setTimeout(() => { busy.current = false }, FADE_MS)
      }))
    }, FADE_MS)
  }, [current, registry])

  const nav = useMemo<Nav>(() => ({ go, current }), [go, current])
  const Scene = registry[current]

  return (
    <NavCtx.Provider value={nav}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#06121a' }}>
        {Scene ? Scene() : null}
        <div
          style={{
            position: 'absolute', inset: 0, background: '#05070a',
            opacity: fade, transition: `opacity ${FADE_MS}ms ease`,
            pointerEvents: fade > 0 ? 'auto' : 'none',
          }}
        />
      </div>
    </NavCtx.Provider>
  )
}
