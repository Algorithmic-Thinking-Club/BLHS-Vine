/* the one dialogue box: portrait, name plaque, the typed line, the cue and the choices */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { announce } from '../ui/a11y'
import { bandFromRects, setUiBand } from '../ui/frame'
import { Glyph, PortraitFrame, useFace, useKitReady } from '../ui/controls'
import { kitCached, kitOptedIn, kitPiece, kitSlot } from '../ui/kit'
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

/* how long after a line appears presses are ignored, so a held key does not eat it */
export const ADVANCE_DEAD_MS = 250

/* the four drawn paw faces in sheet order, and a name not on the sheet draws nothing rather than a blank square, so this list is safe against a kit that has not landed */
/* which drawn paw face the continue cue wears */
const CUE_FACE = 'frame_2'

/* the words under the cue, naming both the click and the key */
const DEFAULT_HINT = 'click, or press space'

/* how wide the portrait column is, read off the dialogue art when it publishes a region */
function portraitColumn(): string | undefined {
  const pieces = kitCached()
  if (!pieces?.length) return undefined
  const piece = kitPiece(pieces, 'dialogue')
  const slot = kitSlot(pieces, 'dialogue', 'portrait')
  if (!piece || !slot || !(piece.w > 0) || !(slot.w > 0)) return undefined
  return `${Math.round((slot.w / piece.w) * 1000) / 10}%`
}

/* whether the kit published a drawn portrait frame */
const frameIsDrawn = (): boolean =>
  kitOptedIn() && !!kitPiece(kitCached() ?? [], 'portrait_frame')

export function DialogueBox({
  line, options, onAdvance, onPick, skin = 'paper', bindKeys = true, hint = DEFAULT_HINT,
}: {
  line: BoxLine
  /** when present the box is asking rather than telling, and does not advance */
  options?: string[]
  onAdvance?: () => void
  onPick?: (i: number) => void
  skin?: DialogueSkin
  /* the cutscene overlay already listens for space and enter to resolve its own confirm and walk-to gates, so it passes false here and one press does not advance twice */
  bindKeys?: boolean
  hint?: string
}) {
  const shownAt = useRef(performance.now())
  const firstChoice = useRef<HTMLButtonElement>(null)
  const stackEl = useRef<HTMLDivElement>(null)
  const asking = !!options?.length

  /* which choice they pressed, held long enough to be seen */
  const [picked, setPicked] = useState<number | null>(null)

  /* the kit lands after the first render, and a face asked for before it arrives answers `undefined` for the life of the page unless something re-renders */
  useKitReady()
  const pawDrawn = !!useFace('cue', CUE_FACE)
  const keyPlate = useFace('chip', 'plate')

  // a new line resets the dead zone and the answer, so both are per line
  useEffect(() => { shownAt.current = performance.now(); setPicked(null) }, [line.text])

  /* publishes how tall the conversation is, so the scene can lift the picture above it */
  useLayoutEffect(() => {
    const measure = () => setUiBand('dialogue', bandFromRects([stackEl.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBand('dialogue', 0) }
  }, [asking, line.done, options?.length, line.portrait])

  /* focus lands on the first choice only once the question finishes typing, because moving it mid line lets a fast keyboard answer text that is still arriving */
  useEffect(() => {
    if (asking && line.done) firstChoice.current?.focus()
  }, [asking, line.done])

  /* says the finished line once, for a student using a screen reader */
  useEffect(() => {
    if (!line.done) return
    announce(line.who ? `${line.who}: ${line.text}` : line.text)
  }, [line.done, line.text, line.who])

  const live = () => performance.now() - shownAt.current > ADVANCE_DEAD_MS

  const advance = () => { if (!asking && live()) onAdvance?.() }

  /* one door for both the pointer and the number key, so the answered state and the double-answer guard cannot be true on one path and false on the other */
  const pick = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    /* says the press landed out loud, because the box usually closes on the next tick and a screen reader would otherwise hear the question and then silence */
    announce(`Chose ${options?.[i] ?? i + 1}`)
    onPick?.(i)
  }

  useEffect(() => {
    if (!bindKeys) return
    const key = (e: KeyboardEvent) => {
      if (asking) {
        // 1..9 pick a choice, which is the key path beside the pointer path
        const n = Number(e.key)
        if (line.done && n >= 1 && n <= (options?.length ?? 0)) { pick(n - 1); e.preventDefault() }
        /* up, down, home and end move the focus between the choices */
        const n2 = options?.length ?? 0
        if (line.done && n2 > 1 && /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) {
          const btns = [...(stackEl.current?.querySelectorAll<HTMLButtonElement>('.dlg-choice') ?? [])]
          if (btns.length) {
            const at = btns.findIndex((b) => b === document.activeElement)
            const step = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1
            const to = e.key === 'Home' ? 0
              : e.key === 'End' ? btns.length - 1
              : at < 0 ? 0
              : (at + step + btns.length) % btns.length
            btns[to]?.focus()
            e.preventDefault()
          }
        }
        return
      }
      if (e.key === ' ' || e.key === 'Enter') { advance(); e.preventDefault() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    /* the deps are what the handler branches on, so the listener is not rebuilt each frame */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindKeys, asking, line.done, options, onPick, onAdvance, picked])

  /* the four states of this surface counted up front rather than implied, typing, complete, asking and answered, and the stylesheet reads exactly these */
  const state = asking
    ? (picked === null ? 'asking' : 'answered')
    : line.done ? 'complete' : 'typing'

  return (
    <div ref={stackEl} className="dlg-stack" data-state={state}>
      {/* the choices sit above the box, dealt like held cards */}
      {asking && line.done && (
        <div className="dlg-choices" role="group" aria-label="Choices" onClick={(e) => e.stopPropagation()}>
          {options!.map((o, i) => (
            <button
              key={o + i}
              ref={i === 0 ? firstChoice : undefined}
              className={`dlg-choice kit-surface-plank${picked === i ? ' dlg-choice-chosen' : ''}`}
              /* the chosen card stays and the others stand down by shape and position, never by hue alone, because a school Chromebook panel crushes both lightness and saturation */
              disabled={picked !== null && picked !== i}
              /* the accessible name carries the option and then the key that picks it */
              aria-label={`${o}. Press ${i + 1}`}
              onClick={() => pick(i)}
            >
              {/* the keyline round the number is the fallback so it has to be conditional: written unconditionally it put a square css keyline around a round drawn plate */}
              <span className={`dlg-choice-key${keyPlate ? '' : ' kit-bare'}`} style={keyPlate} aria-hidden="true">{i + 1}</span>
              <span className="dlg-choice-label">{o}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={`cs-dialogue dlg-box kit-surface-dialogue${line.portrait ? ' has-portrait' : ''}`}
        data-skin={skin}
        data-state={state}
        role={asking ? 'group' : 'button'}
        tabIndex={asking ? -1 : 0}
        /* not a live region: the finished line is announced once instead, above */
        aria-label={asking ? undefined : 'Continue'}
        onClick={(e) => { e.stopPropagation(); advance() }}
      >
        {line.portrait && (
          <span
            className={`dlg-portrait${frameIsDrawn() ? '' : ' dlg-portrait-bare'}`}
            style={{ width: portraitColumn() }}
          >
            {/* the kit's own portrait frame, which says so when the picture is not drawn yet */}
            <PortraitFrame id={line.portrait} />
          </span>
        )}
        {/* the name plaque hangs off the box's own top edge */}
        {line.who && (
          <div className="cs-nameplaque">
            {line.who}
            {line.emote && <span className="cs-emote"> {line.emote}</span>}
          </div>
        )}
        <div className="cs-dialogue-body">
          <div className="cs-dialogue-text">
            {line.text.slice(0, line.shown)}
            {!line.done && <span className="dlg-caret" />}
          </div>
        </div>
        {line.done && !asking && (
          <div className="cs-continue-hint">
            {/* the paw from the platform when it answered, and the local one when it did not */}
            <span className="dlg-paw" aria-hidden="true">
              {pawDrawn
                ? <Glyph piece="cue" face={CUE_FACE} size={16} className="dlg-paw-f" />
                : <span className="dlg-paw-f kit-mark kit-mark-paw" />}
            </span>
            <span className="dlg-hint-words">{hint}</span>
          </div>
        )}
      </div>
    </div>
  )
}
