import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CutsceneRuntime } from './runtime'
import { isCaptain } from '../captain'
import { BUILD_TAG } from '../buildTag'
import { DialogueBox } from '../hud/DialogueBox'
import { Glyph } from '../ui/controls'
import './ui-kit.css'

// Screen-space renderer for a running cutscene: letterbox bars, the eyes-opening vignette,
// fades, the standard lower-third dialogue box (GAME-DESIGN §11.1), floating captions, the
// input prompt plaque and the hold-to-skip plaque. Pure DOM over the canvas, and the world
// underneath stays live. The paper/wood chrome comes from the PixelLab UI kit; ui-kit.css
// owns those textures so this file is only structure + behavior.

const SKIP_HOLD_MS = 600

/* WHICH LAYER A CUTSCENE IS ON, AND WHY IT MOVED.
 *
 * It was 40, which is BELOW the HUD stack (50), the heading (46) and the arrival
 * card (68), all three of which draw over a running cutscene. So the compass and
 * the Handbook spine sat on top of a letterbox, an arrival plaque could land in
 * the middle of a scripted beat, and the fade to black faded everything except
 * the furniture.
 *
 * A cutscene is the game taking the screen. It goes over everything the world
 * puts on it and under every panel the student can open, which is the same band
 * the conversation's own veil sits in (`hud/dialogue.css`: 72, with the panels
 * from 74 to 79 above it). The two never collide, because `hud/Dialogue.tsx`
 * stands the world's box down while a cutscene is up. */
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

  const ui = rt.ui
  if (!ui.active) return <>{children}</>

  /* THE DOCUMENT SAYS WHEN THERE ARE BARS, so the one control that is allowed
   * to stay through them can climb over them.
   *
   * Ash, 2026-09-06: "the help button should also show on the beach map cutscene
   * part too." It mounts there now, and it was still invisible: the question mark
   * lives at z-index 50 with a 2.4vh bottom margin, and these bars are 10vh of ink
   * at 72, so it was drawn underneath one. `cinema.css` already lifts it over the
   * MOVIE frame; this is the same signal from the cutscene runtime's own frame,
   * and the same rule catches both. */
  useEffect(() => {
    const on = ui.active && ui.letterbox > 0.02
    if (on) document.documentElement.dataset.letterbox = '1'
    else delete document.documentElement.dataset.letterbox
    return () => { delete document.documentElement.dataset.letterbox }
  }, [ui.active, ui.letterbox])

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
        {/* letterbox */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, background: '#04060a' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: barH, background: '#04060a' }} />
        {/* full fade */}
        {ui.fade > 0.003 && <div style={{ position: 'absolute', inset: 0, background: ui.fadeColor, opacity: ui.fade }} />}

        {/* caption: a floating one-liner, no box */}
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
            just-begun line cannot read as a blank sheet.

            AND THE HINT IS NO LONGER OVERRIDDEN HERE. It passed a sentence of its
            own ending in a right-pointing triangle character, which is a font
            glyph (`docs/ART.md`: "Icons are drawn, never an emoji or a font
            glyph"), and which named only the pointer path in the one scene a
            student is most likely to be pressing space through. The box owns one
            sentence naming both paths, and the drawn paw beside it is `cue`. */}
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

        {/* THE BUILD STAMP IS A DEBUG AFFORDANCE AND IT IS BEHIND THE DEBUG DOOR NOW.
            It was drawn for everybody, so "fable-i14" sat in the corner of every
            cutscene a student would ever see and of every proof capture, which is
            what the eyes round told it to stop doing. Captain keeps it, plus the
            live dialogue state, because diagnosing a silent typewriter on HIS
            machine is the whole reason it was written. */}
        {isCaptain() && (
          <div className="cs-debug">
            {BUILD_TAG}{ui.dialogue ? ` · say ${ui.dialogue.shown}/${ui.dialogue.text.length}${ui.dialogue.done ? ' done' : ''}` : ''}
          </div>
        )}
        {/* skip plaque: one CLICK skips to the next required beat; the captain's version
            ends the whole cutscene outright (god authority for testing) */}
        {/* A REAL BUTTON, because it was a div with an onClick: a pointer could
            skip and a keyboard could only hold Escape, which is a key path
            nothing on screen names. Tab reaches it now, Enter and Space press it
            because it is a button, and the Escape hold still works. */}
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
            {/* IT PRINTED A TRIANGLE CHARACTER, and the captain's version printed an
                anchor emoji beside it. One is a font glyph and the other is an
                operating-system emoji, and the repo law is that an icon is drawn
                or it is words. `icon_set` has a drawn arrow, so the arrow is worn; there is
                no anchor face on the sheet, so the captain's version says what it
                does in words instead of borrowing a character from the operating
                system. */}
            <span className="cs-skip-words">{isCaptain() ? 'skip all' : 'skip'}</span>
            <Glyph piece="icon_set" face="arrow" size={12} className="cs-skip-mark" />
          </button>
        )}
      </div>
    </>
  )
}
