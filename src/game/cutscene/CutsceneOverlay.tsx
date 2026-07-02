import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CutsceneRuntime } from './runtime'
import './ui-kit.css'

// Screen-space renderer for a running cutscene: letterbox bars, the eyes-opening vignette,
// fades, the standard lower-third dialogue box (GAME-DESIGN §11.1), floating captions, the
// input prompt plaque and the hold-to-skip plaque. Pure DOM over the canvas — the world
// underneath stays live. The paper/wood chrome comes from the PixelLab UI kit; ui-kit.css
// owns those textures so this file is only structure + behavior.

const SKIP_HOLD_MS = 600

export function CutsceneOverlay({ rt, children }: { rt: CutsceneRuntime; children?: ReactNode }) {
  const [, bump] = useState(0)
  useEffect(() => rt.subscribe(() => bump((v) => v + 1)), [rt])

  // advance on click / space / enter, anywhere
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { rt.advance(); e.preventDefault() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [rt])

  // hold-to-skip (pointer on the plaque, or holding Escape)
  const [holdAt, setHoldAt] = useState<number | null>(null)
  const holdTimer = useRef<number | null>(null)
  const beginHold = () => {
    if (!rt.ui.skippable) return
    setHoldAt(performance.now())
    holdTimer.current = window.setTimeout(() => { rt.skip(); setHoldAt(null) }, SKIP_HOLD_MS)
  }
  const endHold = () => {
    if (holdTimer.current !== null) { clearTimeout(holdTimer.current); holdTimer.current = null }
    setHoldAt(null)
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.repeat && rt.ui.active) beginHold() }
    const up = (e: KeyboardEvent) => { if (e.key === 'Escape') endHold() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt])

  const ui = rt.ui
  if (!ui.active) return <>{children}</>

  const barH = `${(ui.letterbox * 10).toFixed(2)}vh`

  return (
    <>
      {children}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 40 }} onClick={() => rt.advance()}>
        {/* vignette — the I-1 eyes-opening aperture; radial so the middle stays alive */}
        {ui.vignette > 0.003 && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse ${100 - ui.vignette * 78}% ${100 - ui.vignette * 80}% at 50% 46%, transparent 38%, rgba(4,6,9,${0.55 + ui.vignette * 0.45}) 100%)`,
          }} />
        )}
        {/* letterbox */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, background: '#04060a' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: barH, background: '#04060a' }} />
        {/* full fade */}
        {ui.fade > 0.003 && <div style={{ position: 'absolute', inset: 0, background: ui.fadeColor, opacity: ui.fade }} />}

        {/* caption — floating one-liner, no box */}
        {ui.caption && (
          <div className="cs-caption" style={{ opacity: ui.caption.alpha }}>{ui.caption.text}</div>
        )}

        {/* prompt plaque ("walk to it") */}
        {ui.prompt && <div className="cs-prompt">{ui.prompt.text}</div>}

        {/* dialogue — the standard paper box (never shown empty: it appears WITH its first
            characters, so a stalled or just-begun line can't read as a blank sheet) */}
        {ui.dialogue && (ui.dialogue.shown > 0 || ui.dialogue.done) && (
          <div className="cs-dialogue" style={{ pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); rt.advance() }}>
            {ui.dialogue.who && <div className="cs-nameplaque">{ui.dialogue.who}</div>}
            <div className="cs-dialogue-text">
              {ui.dialogue.text.slice(0, ui.dialogue.shown)}
              {ui.dialogue.done && <span className="cs-continue">🐾</span>}
            </div>
          </div>
        )}

        {/* skip plaque */}
        {ui.skippable && (
          <div
            className="cs-skip" style={{ pointerEvents: 'auto' }}
            onPointerDown={beginHold} onPointerUp={endHold} onPointerLeave={endHold}
          >
            <span className="cs-skip-fill" style={{ width: holdAt ? '100%' : '0%', transition: holdAt ? `width ${SKIP_HOLD_MS}ms linear` : 'none' }} />
            <span style={{ position: 'relative' }}>skip ▸</span>
          </div>
        )}
      </div>
    </>
  )
}
