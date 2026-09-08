import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CutsceneRuntime } from './runtime'
import { isCaptain } from '../captain'
import { BUILD_TAG } from '../buildTag'
import { DialogueBox } from '../hud/DialogueBox'
import { Glyph } from '../ui/controls'
import './ui-kit.css'

// screen-space chrome for a running cutscene: bars, vignette, fades, the box and plaques

const SKIP_HOLD_MS = 600

/* which layer a cutscene draws on: over the world, under any panel a student opens */
const CUTSCENE_LAYER = 72

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

  /* the document says when there are bars, so a control allowed to stay can climb over them */
  useEffect(() => {
    const on = rt.ui.active && rt.ui.letterbox > 0.02
    if (on) document.documentElement.dataset.letterbox = '1'
    else delete document.documentElement.dataset.letterbox
    return () => { delete document.documentElement.dataset.letterbox }
  }, [rt.ui.active, rt.ui.letterbox])

  const ui = rt.ui
  if (!ui.active) return <>{children}</>

  const barH = `${(ui.letterbox * 10).toFixed(2)}vh`

  return (
    <>
      {children}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: CUTSCENE_LAYER }} onClick={() => rt.advance()}>
        {/* vignette, the I-1 eyes-opening aperture; radial so the middle stays alive */}
        {ui.vignette > 0.003 && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse ${100 - ui.vignette * 78}% ${100 - ui.vignette * 80}% at 50% 46%, transparent 38%, rgba(4,6,9,${0.55 + ui.vignette * 0.45}) 100%)`,
          }} />
        )}
        {/* letterbox. The height is animated so it stays inline; the class is what
            lets the control arm decline the bars, the way it declines a plank. */}
        <div className="cs-letterbox" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, background: '#04060a' }} />
        <div className="cs-letterbox" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: barH, background: '#04060a' }} />
        {/* full fade */}
        {ui.fade > 0.003 && <div style={{ position: 'absolute', inset: 0, background: ui.fadeColor, opacity: ui.fade }} />}

        {/* caption: a floating one-liner, no box */}
        {ui.caption && (
          <div className="cs-caption" style={{ opacity: ui.caption.alpha }}>{ui.caption.text}</div>
        )}

        {/* prompt plaque ("walk to it") */}
        {ui.prompt && <div className="cs-prompt">{ui.prompt.text}</div>}

        {/* the same box the world uses, shown with its first characters and never empty */}
        {ui.dialogue && (ui.dialogue.shown > 0 || ui.dialogue.done) && (
          <div style={{ pointerEvents: 'auto' }}>
            <DialogueBox
              line={ui.dialogue}
              onAdvance={() => rt.advance()}
              /* this overlay already listens for space and enter, because those keys
                 also resolve its confirm and walk-to gates when no line is up */
              bindKeys={false}
            />
          </div>
        )}

        {/* the build stamp, behind the captain door rather than in every student's corner */}
        {isCaptain() && (
          <div className="cs-debug">
            {BUILD_TAG}{ui.dialogue ? ` · say ${ui.dialogue.shown}/${ui.dialogue.text.length}${ui.dialogue.done ? ' done' : ''}` : ''}
          </div>
        )}
        {/* skip plaque: one CLICK skips to the next required beat; the captain's version
            ends the whole cutscene outright (god authority for testing) */}
        {/* a real button, so tab reaches it and enter or space presses it */}
        {ui.skippable && (
          <button
            type="button" className="cs-skip" style={{ pointerEvents: 'auto' }}
            aria-label={isCaptain() ? 'Skip the whole scene' : 'Skip this part of the scene'}
            /* no pointer hold here on purpose: a click already skips at once, and
               a hold that ALSO skips would fire the timer and then the click and
               skip two beats for one press */
            onClick={(e) => { e.stopPropagation(); if (isCaptain()) rt.godSkip(); else rt.skip() }}
          >
            {/* the fill's duration is the real hold length and is deliberately not
                shortened by reduced motion: it is a progress bar, and a progress
                bar that finishes early lies about when the finger can come up */}
            <span className="cs-skip-fill" style={{ width: holdAt ? '100%' : '0%', transition: holdAt ? `width ${SKIP_HOLD_MS}ms linear` : 'none' }} />
            {/* words and a drawn arrow, because an icon here is drawn or it is words */}
            <span className="cs-skip-words">{isCaptain() ? 'skip all' : 'skip'}</span>
            <Glyph piece="icon_set" face="arrow" size={12} className="cs-skip-mark" />
          </button>
        )}
      </div>
    </>
  )
}
