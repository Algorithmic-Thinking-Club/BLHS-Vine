import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CutsceneRuntime } from './runtime'
import { isCaptain } from '../captain'
import { BUILD_TAG } from '../buildTag'
import { DialogueBox } from '../hud/DialogueBox'
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

  // hold-to-skip: holding Escape. The plaque itself skips on one press, so the
  // fill below is what a held Escape draws rather than what a held pointer does.
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

        {/* THE SAME BOX THE WORLD USES. This drew its own plaque, its own text node
            and its own hint, and the world's box drew a different set beside it, so a
            line from the counselor and a line from a cutscene were two pictures. One
            component now; the runtime still owns the typing, because it ticks on the
            host scene's clock and a cutscene's pacing may not drift from the world's.
            Never shown empty: it appears WITH its first characters, so a stalled or
            just-begun line cannot read as a blank sheet. */}
        {ui.dialogue && (ui.dialogue.shown > 0 || ui.dialogue.done) && (
          <div style={{ pointerEvents: 'auto' }}>
            <DialogueBox
              line={ui.dialogue}
              onAdvance={() => rt.advance()}
              hint="click to go on ▸"
              /* this overlay already listens for space and enter, because those keys
                 also resolve its confirm and walk-to gates when no line is up */
              bindKeys={false}
            />
          </div>
        )}

        {/* the build stamp: which bundle is on screen, always. Captain also sees the live
            dialogue state so a silent failure diagnoses itself on HIS machine. */}
        <div style={{
          position: 'absolute', bottom: 6, left: 10, fontFamily: 'monospace', fontSize: 11,
          color: 'rgba(220,230,225,.55)', textShadow: '0 1px 2px rgba(0,0,0,.8)', pointerEvents: 'none',
        }}>
          {BUILD_TAG}{isCaptain() && ui.dialogue ? ` · say ${ui.dialogue.shown}/${ui.dialogue.text.length}${ui.dialogue.done ? ' done' : ''}` : ''}
        </div>
        {/* skip plaque — one CLICK skips to the next required beat; the captain's version
            ends the whole cutscene outright (god authority for testing) */}
        {/* A REAL BUTTON, because it was a div with an onClick: a pointer could
            skip and a keyboard could only hold Escape, which is a key path
            nothing on screen names. Tab reaches it now, Enter and Space press it
            because it is a button, and the Escape hold still works. */}
        {ui.skippable && (
          <button
            type="button" className="cs-skip" style={{ pointerEvents: 'auto' }}
            aria-label={isCaptain() ? 'Skip the whole cutscene' : 'Skip to the next beat'}
            /* no pointer hold here on purpose: a click already skips at once, and
               a hold that ALSO skips would fire the timer and then the click and
               skip two beats for one press */
            onClick={(e) => { e.stopPropagation(); if (isCaptain()) rt.godSkip(); else rt.skip() }}
          >
            {/* the fill's duration is the real hold length and is deliberately not
                shortened by reduced motion: it is a progress bar, and a progress
                bar that finishes early lies about when the finger can come up */}
            <span className="cs-skip-fill" style={{ width: holdAt ? '100%' : '0%', transition: holdAt ? `width ${SKIP_HOLD_MS}ms linear` : 'none' }} />
            <span style={{ position: 'relative' }}>{isCaptain() ? 'skip all ⚓' : 'skip ▸'}</span>
          </button>
        )}
      </div>
    </>
  )
}
