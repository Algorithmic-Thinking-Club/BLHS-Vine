/* THE ONE BOX.
 *
 * Ash ruled on 2026-08-28 that the two dialogue renderers collapse into one
 * component, and this is it. There were two: `cutscene/CutsceneOverlay.tsx` drew
 * the cutscene's box and `hud/Dialogue.tsx` drew the world's, which is the one
 * `PmapScene`'s `say` reaches. Two components, two behaviours, one job.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. The dialogue box is the delivery surface for
 * nearly every measured piece of content in the run: every station, every NPC,
 * every tutorial line, every island host and every member's Python speaks through
 * it. Twelve islands will not all reach the same one, so whichever box an island's
 * host happened to hit is the text sizing, the advance behaviour and the portrait
 * support that island inherits. The plain arm makes that structural rather than
 * cosmetic: §16 is the same content with the world taken away, and if the split is
 * made at two components it gets made twice, or once at the wrong layer.
 *
 * WHAT IT OWNS. The picture and the behaviour: the portrait frame, the name
 * plaque, the text that is being typed, the caret, the advance affordance, and the
 * choices. It does NOT own the typewriter's clock, because the two callers pace it
 * differently for real reasons: the cutscene runtime ticks on the host scene's own
 * ticker so cutscene time and world time cannot drift, and the world box runs on
 * rAF because there is no scene clock to ride. Both hand this component a `shown`
 * count and a `done` flag, so the picture is identical either way.
 *
 * PORTRAIT AND EMOTE ARE RENDERED. `SceneLine` and `DialogueLine` have both
 * carried a `portrait` field for months and nothing anywhere drew it, so an author
 * could set one, see no error, and ship a scene where nobody has a face.
 *
 * A POINTER PATH FOR EVERY KEY PATH AND THE REVERSE. "Press E" is meaningless on
 * a trackpad and a click on a choice is meaningless on a keyboard, and neither is
 * the fallback for the other. Every choice is a real button, focusable and
 * clickable, and is also on a number key. Advancing is a click anywhere on the box
 * and is also space or enter.
 *
 * THE SKIN IS ONE STRING. `skin` becomes a data attribute the stylesheet keys off,
 * so the §11 UI batch swaps the whole look by adding rules rather than by editing
 * this file. Today there is one skin and it is the paper box.
 */
import { useEffect, useRef } from 'react'
import './dialogue.css'

export type DialogueSkin = 'paper'

export type BoxLine = {
  who?: string
  text: string
  /** how many characters the caller's typewriter has revealed */
  shown: number
  done: boolean
  /** a portrait id; drawn from /art/portraits/<id>.png, silent when there is none */
  portrait?: string
  emote?: string
}

/* THE FIRST QUARTER SECOND IS DEAD, on purpose. A student holding space through a
 * scene, or mashing it, eats the line they never read. The cutscene runtime has
 * had this rule since it was written and the world box did not, so the same student
 * lost lines in one half of the game and not the other. */
export const ADVANCE_DEAD_MS = 250

export function DialogueBox({
  line, options, onAdvance, onPick, skin = 'paper', bindKeys = true, hint = 'click',
}: {
  line: BoxLine
  /** when present the box is asking rather than telling, and does not advance */
  options?: string[]
  onAdvance?: () => void
  onPick?: (i: number) => void
  skin?: DialogueSkin
  /* the cutscene overlay already listens for space and enter, because those keys
   * also resolve its confirm and walk-to gates when no line is up. It passes false
   * so one press does not advance twice. */
  bindKeys?: boolean
  hint?: string
}) {
  const shownAt = useRef(performance.now())
  const firstChoice = useRef<HTMLButtonElement>(null)
  const asking = !!options?.length

  // a new line resets the dead zone, so it is per line rather than per box
  useEffect(() => { shownAt.current = performance.now() }, [line.text])

  /* focus lands on the first choice when the question finishes typing, and only
   * then: moving focus mid-line would let a fast keyboard answer a question whose
   * text is still arriving. */
  useEffect(() => {
    if (asking && line.done) firstChoice.current?.focus()
  }, [asking, line.done])

  const live = () => performance.now() - shownAt.current > ADVANCE_DEAD_MS

  const advance = () => { if (!asking && live()) onAdvance?.() }

  useEffect(() => {
    if (!bindKeys) return
    const key = (e: KeyboardEvent) => {
      if (asking) {
        // 1..9 pick a choice, which is the key path beside the pointer path
        const n = Number(e.key)
        if (line.done && n >= 1 && n <= (options?.length ?? 0)) { onPick?.(n - 1); e.preventDefault() }
        return
      }
      if (e.key === ' ' || e.key === 'Enter') { advance(); e.preventDefault() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  return (
    <>
      {/* THE CHOICES SIT ABOVE THE BOX rather than inside it: .cs-dialogue is a
          fixed-height paper window measured off the art, and growing it to fit
          three buttons would stretch the picture. §11.1 wants them fanned like
          held cards anyway, which is a thing you do beside a box, not in one. */}
      {asking && line.done && (
        <div className="dlg-choices" role="group" aria-label="Choices" onClick={(e) => e.stopPropagation()}>
          {options!.map((o, i) => (
            <button
              key={o + i}
              ref={i === 0 ? firstChoice : undefined}
              className="dlg-choice"
              onClick={() => onPick?.(i)}
            >
              <span className="dlg-choice-key" aria-hidden="true">{i + 1}</span>{o}
            </button>
          ))}
        </div>
      )}

      <div
        className={`cs-dialogue dlg-box${line.portrait ? ' has-portrait' : ''}`}
        data-skin={skin}
        role={asking ? 'group' : 'button'}
        tabIndex={asking ? -1 : 0}
        aria-live="polite"
        onClick={(e) => { e.stopPropagation(); advance() }}
      >
        {line.portrait && (
          <img
            className="cs-portrait pix"
            src={`/art/portraits/${line.portrait}.png`}
            alt=""
            draggable={false}
            /* a portrait that is not drawn yet leaves the frame empty rather than
             * putting a broken-image glyph in a character's face */
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <div className="cs-dialogue-body">
          {line.who && (
            <div className="cs-nameplaque">
              {line.who}
              {line.emote && <span className="cs-emote"> {line.emote}</span>}
            </div>
          )}
          <div className="cs-dialogue-text">
            {line.text.slice(0, line.shown)}
            {!line.done && <span className="dlg-caret" />}
          </div>
        </div>
        {line.done && !asking && <div className="cs-continue-hint">{hint}</div>}
      </div>
    </>
  )
}
