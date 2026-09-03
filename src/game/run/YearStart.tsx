import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { setFlag } from '../save'
import { announce, usePanel } from '../ui/a11y'
import { Glyph, PortraitFrame, useFace } from '../ui/controls'
import { PP_FACE } from '../beats/y1'
import { bandFromRects, setUiBand } from '../ui/frame'
import { VIGNETTES } from './vignettes'
import './run.css'

/* THE YEAR-START VIGNETTE (§7.5, minute one of a year): Principal Panther, three
 * lines, once per year, then never again (the flag remembers). It rides the world
 * as a small card rather than as a cutscene; the Maw's staged version replaces
 * this front when the cave wiring lands, and the lines and the flag stay the same.
 *
 * ---- IT WAS A KEYBOARD DEAD END, AND IT IS A REQUIRED BEAT -----------------
 *
 * Found 2026-09-01. This was a bare `<div onClick>` with no `role`, no
 * `tabIndex` and no key handler, exactly as §14.34 found the ceremony:
 *
 *   *"a student who has played the whole run on a keyboard reaches the last
 *   screen and has to find the mouse."*
 *
 * Here it is worse than at the ceremony, because THE YEAR CANNOT START WITHOUT
 * THIS BEAT. `Hud.tsx` mounts it while the world is quiet and `onDone` writes
 * `vignette:y<N>`; until that flag exists the objective system is still pointing
 * at the vignette. A student driving from the keyboard, which §11.3 says is a
 * supported way to play and which on a school Chromebook is the FASTER way
 * because the trackpad is bad, had no way past the first thirty seconds of a
 * year.
 *
 * So the card is a real control, in the shape the dialogue box already uses
 * (`DialogueBox.tsx`): the card carries `role="button"` and a real tab stop, its
 * accessible name is words, space and enter advance it on a window listener, and
 * the LINE goes through `announce` because a named button hands a reader its name
 * and not its contents. The whole surface stays a pointer target underneath it,
 * because a student on a trackpad expects a tap anywhere to go on.
 *
 * `usePanel` with `closeOnEscape: false`, for the same reason the ceremony takes
 * it: this beat is not dismissible, and a panel that only sometimes traps focus
 * is worse than one that never does.
 *
 * ---- AND THE CUE WAS AN OPERATING-SYSTEM PAW -------------------------------
 *
 * The advance cue was the character U+1F43E, which `docs/ART.md` rules out in as
 * many words: *"Icons are drawn, never an emoji or a font glyph."* MAPVIS drew a
 * `cue` sheet with four frames of a paw print for exactly this, and nothing had
 * ever shown one. `AdvanceCue` wears it, and the WORDS are always there whether
 * or not the kit landed, so a build with no platform still says what to do
 * instead of showing a blank square. */

/* ---- THE ADVANCE CUE, SHARED BY THE RUN'S THREE OVERLAYS -------------------
 *
 * It lives here because this is the cue's simplest use and the one it was drawn
 * for, and `Graduation.tsx` imports it rather than drawing a second one. Four
 * frames are mounted at once and cross-faded in CSS, because a face is a
 * background-position computed in JS and a keyframe cannot compute one.
 *
 * The paw only appears when the sheet is actually worn. `faceStyle` refuses when
 * the kit was not fetched, when the platform kit is not opted into, or when
 * nobody cut a face by that name, and the honest answer to a refusal is the
 * words on their own rather than a hole where a picture goes. */
export function AdvanceCue({ words, className = '' }: { words: string; className?: string }) {
  const drawn = useFace('cue', 'frame_1')
  return (
    <span className={`ys-cue ${className}`}>
      {drawn && (
        <span className="ys-paw" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <Glyph key={n} piece="cue" face={`frame_${n}`} size={20} className={`ys-paw-f ys-paw-f${n}`} />
          ))}
        </span>
      )}
      <span className="ys-cue-word">{words}</span>
    </span>
  )
}

export function YearStart({ year, onDone }: { year: number; onDone: () => void }) {
  const lines = VIGNETTES[year] ?? VIGNETTES[1]
  const [i, setI] = useState(0)
  const cardEl = useRef<HTMLDivElement>(null)
  const panel = usePanel({ label: `Principal Panther, year ${year}`, closeOnEscape: false })
  const last = i + 1 >= lines.length
  const next = () => {
    if (last) { setFlag(`vignette:y${year}`); onDone() }
    else setI(i + 1)
  }
  /* SPACE AND ENTER GO ON, which is `DialogueBox.tsx:236`'s own contract and the
   * reason this card does not grow a key handler of its own shape. The card is a
   * region with `role="button"` for the same reason the dialogue box is one: a
   * reader is handed the name rather than the contents, so the LINE is announced
   * separately below and never lost. */
  const advance = useRef(next)
  advance.current = next
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      advance.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => { announce(`Principal Panther. ${lines[i]}`) }, [lines, i])
  /* THIS CARD IS ALONG THE BOTTOM OF THE WINDOW TOO, so it says how tall it is
   * for the same reason the dialogue box does (src/game/ui/frame.ts). It lands
   * in the same second as a map arrival, so before this the arrival card was
   * drawn entirely behind it and the camera composed the body into it: on the
   * Maw the year's first line covered the place card every single time. */
  useLayoutEffect(() => {
    const measure = () => setUiBand('yearstart', bandFromRects([cardEl.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBand('yearstart', 0) }
  }, [i])
  return (
    <div className="ys-veil" {...panel}>
      <div className="ys-wrap" onClick={next}>
        <div
          ref={cardEl}
          className="ys-card kit-surface-dialogue"
          role="button"
          tabIndex={0}
          aria-label={last ? 'Read it and begin the year' : `Read it and go on, line ${i + 1} of ${lines.length}`}
          onClick={(e) => { e.stopPropagation(); next() }}
        >
          {/* THE FACE, THE SAME LOCKED ONE THE BEAT WEARS TWO SCREENS LATER.
              Ash ruled the portrait to `principal-pro` out of the Maw's library
              and it reached the beat only, so the principal opened a year as a
              name with nobody behind it and then turned up with a face in the
              Hearth. The frame is `PortraitFrame`, which is the one place that
              decides what a portrait looks like, so this card cannot drift from
              the beat's. No caption: the plate beside it is already his name. */}
          <span className="ys-body">
            <PortraitFrame id={PP_FACE} />
            <span className="ys-col">
              <span className="ys-speaker">Principal Panther · Year {year}</span>
              <span className="ys-text">{lines[i]}</span>
            </span>
          </span>
          <span className="ys-foot">
            {/* HOW MANY LINES ARE LEFT, AS A ROW OF MARKS. Three identical lines
                with no count is a student who cannot tell whether they are one
                tap from the world or five. The mark that has been read is filled
                and the ones to come are open, so the state is a SHAPE and not a
                lightness (§40.31). */}
            <span className="ys-dots" aria-hidden="true">
              {lines.map((_, n) => (
                <span key={n} className={`ys-dot${n <= i ? ' ys-dot-on' : ''}`} />
              ))}
            </span>
            <AdvanceCue words={last ? 'begin the year' : 'go on'} />
          </span>
        </div>
      </div>
    </div>
  )
}
