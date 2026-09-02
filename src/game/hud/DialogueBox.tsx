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
 * ---- WHAT THE UI SESSION OF 2026-09-01 REBUILT, AND WHY EACH PIECE MOVED ----
 *
 * THE PORTRAIT IS DRAWN INSIDE A DRAWN FRAME. It was a bare `<img>` with no frame
 * around it, floating on the paper. `PortraitFrame` wears `portrait_frame`, which
 * MAPVIS drew and nothing in `src/` had ever mounted, and it bottom-anchors the
 * picture, which the kit's own record marks REQUIRED and does not default: a
 * character centred in their own box floats off the bottom of it. The column's
 * width is read off the dialogue piece's own `portrait` region when the platform
 * publishes one, so a repaint moves the layout instead of a percentage in a
 * comment doing it. A portrait nobody has drawn yet leaves a clean empty frame and
 * says which id it wanted, because a silent hide is how an author ships a faceless
 * scene without ever being told.
 *
 * THE ADVANCE CUE IS THE DRAWN PAW. `GAME-DESIGN` §11.1 commissioned "a bouncing
 * paw-print continue cue", MAPVIS drew it as `cue` with frame_1 to frame_4, and
 * nothing in this repository had ever read that piece. Four faces on a slow loop,
 * one shown at a time, stopped on frame one under reduced motion. The words beside
 * it name BOTH paths, click and space, because "press E" is meaningless on a
 * trackpad and a click is meaningless on a keyboard, and neither is the fallback
 * for the other. The default lives here and the cutscene overlay's per-call
 * override is deleted: one box, one sentence.
 *
 * THE CHOICES AND THE BOX ARE ONE COLUMN. `dialogue.css` used to hardcode the
 * choices at `bottom: calc(... + min(190px, 26vh) + 10px)`, which was the box's
 * height back when the box had one. §40.14 made the box grow to its content, so a
 * long question at text size L put the planks straight on top of the paper. They
 * are a bottom-anchored flex column now and the arithmetic is gone.
 *
 * EVERY STATE IS ON THE ELEMENT. §40.41 wants the states enumerated rather than
 * implied, so `data-state` carries typing, complete, asking and answered, and the
 * stylesheet keys off it. `answered` is the one that did not exist: a student
 * pressed a choice and the whole conversation vanished with no acknowledgement
 * that the press had landed.
 *
 * A POINTER PATH FOR EVERY KEY PATH AND THE REVERSE. Every choice is a real
 * button, focusable and clickable, and is also on a number key. Advancing is a
 * click anywhere on the box and is also space or enter.
 *
 * THE SKIN IS ONE STRING. `skin` becomes a data attribute the stylesheet keys off,
 * so a look swaps by adding rules rather than by editing this file. The kit's own
 * skin is the wider one and lives on <html> (`ui/skin.ts`); this prop stays
 * because one line in one scene may want a different box from the rest of the game
 * without changing the rest of the game. The box also carries
 * `kit-surface-dialogue`, which is what a skin with no art paints a background
 * onto: a texture token set to `none` and nothing behind it is an invisible
 * dialogue box, and §16's plain arm is exactly that skin.
 */
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

/* THE FIRST QUARTER SECOND IS DEAD, on purpose. A student holding space through a
 * scene, or mashing it, eats the line they never read. The cutscene runtime has
 * had this rule since it was written and the world box did not, so the same student
 * lost lines in one half of the game and not the other. */
export const ADVANCE_DEAD_MS = 250

/* the four faces of the drawn paw, in the order they were cut off the sheet. A
 * name that is not on the sheet draws nothing at all rather than a blank square,
 * so this list is safe against a kit that has not landed. */
/* ONE PAW, BOUNCING, AND NOT FOUR PAWS FLASHING.
 *
 * `cue` publishes frame_1 to frame_4 and they are not motion frames: they are
 * the same paw in white, brown, gold and green. Cycling them on a cream panel
 * did two wrong things at once. The white frame is INVISIBLE on paper, so a
 * quarter of the loop the cue simply was not there, and the art-direction pass
 * of 2026-09-01 read the result as "a white paw glyph half-buried under the
 * letter r... invisible on cream and reads as a smudge". And a mark that
 * changes colour on a loop is a hue animation, which says nothing on a panel
 * that crushes hue.
 *
 * GAME-DESIGN §11.1 commissioned a "bouncing paw-print continue cue" and bounce
 * is the word. One frame, the brown one, which reads on cream and on wood, and
 * it MOVES, which is what a cue is for. The other three faces stay drawn and
 * unused rather than being cycled for the sake of using them. */
const CUE_FACE = 'frame_2'

/* WHAT THE HINT SAYS, ONCE, FOR BOTH BOXES. The cutscene passed its own string
 * ending in a right-pointing triangle character, which `docs/ART.md` forbids
 * outright, and the world box passed the single word `click`, which tells a
 * keyboard player nothing. Both paths, in words, in one place. */
const DEFAULT_HINT = 'click, or press space'

/* HOW WIDE THE PICTURE'S COLUMN IS, ASKED OF THE ART RATHER THAN GUESSED.
 *
 * `docs/UI-KIT.md`'s opening complaint is that the inside of every painted
 * surface is a percentage somebody measured in an image editor and typed into a
 * stylesheet. The dialogue piece can publish a `portrait` region, so when it does
 * the column is that region's own share of the piece's width and Ash repainting
 * the box moves the layout with it. When it does not, the stylesheet's own
 * fallback stands, and that is a stated default rather than a silent one. */
function portraitColumn(): string | undefined {
  const pieces = kitCached()
  if (!pieces?.length) return undefined
  const piece = kitPiece(pieces, 'dialogue')
  const slot = kitSlot(pieces, 'dialogue', 'portrait')
  if (!piece || !slot || !(piece.w > 0) || !(slot.w > 0)) return undefined
  return `${Math.round((slot.w / piece.w) * 1000) / 10}%`
}

/* AND WHETHER THERE IS A DRAWN FRAME AT ALL.
 *
 * `portrait_frame` is one of the eleven grounds MAPVIS publishes and there is no
 * committed fallback for it in `public/art/ui/`, so on a build with no platform
 * (a member on a train, `?kit=0`, a district filter) `.kit-surface-portrait_frame`
 * resolves to nothing and the picture would float exactly the way it did before
 * any of this. When the piece is not there the column wears a plain token plate
 * instead, so a portrait that has not been drawn yet still leaves a clean empty
 * frame rather than a hole. */
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
  /* the cutscene overlay already listens for space and enter, because those keys
   * also resolve its confirm and walk-to gates when no line is up. It passes false
   * so one press does not advance twice. */
  bindKeys?: boolean
  hint?: string
}) {
  const shownAt = useRef(performance.now())
  const firstChoice = useRef<HTMLButtonElement>(null)
  const stackEl = useRef<HTMLDivElement>(null)
  const asking = !!options?.length

  /* WHICH ONE THEY PRESSED, HELD LONG ENOUGH TO BE SEEN. The driver usually tears
   * the box down on the next tick, so this is a frame or two of acknowledgement
   * rather than a screen a student sits in. It is also the guard that stops a
   * second press answering a question that has already been answered. */
  const [picked, setPicked] = useState<number | null>(null)

  /* the kit lands after the first render, and a face asked for before it arrives
   * answers `undefined` for the life of the page unless something re-renders */
  useKitReady()
  const pawDrawn = !!useFace('cue', CUE_FACE)
  const keyPlate = useFace('chip', 'plate')

  // a new line resets the dead zone and the answer, so both are per line
  useEffect(() => { shownAt.current = performance.now(); setPicked(null) }, [line.text])

  /* HOW MUCH OF THE WINDOW THE CONVERSATION IS USING, PUBLISHED.
   *
   * The eyes round found choice planks drawn on top of the player: the box lays
   * itself out from the bottom of the window and the camera composes the
   * painting into the whole window, so nothing stopped them wanting the same
   * pixels. This box is the only thing that knows how tall the stack really is
   * (a two-choice question and a four-choice one are 130px apart), so it says,
   * and `src/game/pmap/PmapScene.tsx` lifts the picture by that much.
   *
   * ONE ELEMENT ANSWERS IT NOW. It used to be measured off the box and the
   * choices separately, which was right while they were two absolutely
   * positioned things; they are one column, so the column is the measurement.
   *
   * Layout effect, because the number has to be right before the next frame the
   * ticker draws, and re-measured whenever the stack can have changed height:
   * a question opening, a question being answered, or the window resizing. */
  useLayoutEffect(() => {
    const measure = () => setUiBand('dialogue', bandFromRects([stackEl.current]))
    measure()
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); setUiBand('dialogue', 0) }
  }, [asking, line.done, options?.length, line.portrait])

  /* focus lands on the first choice when the question finishes typing, and only
   * then: moving focus mid-line would let a fast keyboard answer a question whose
   * text is still arriving. */
  useEffect(() => {
    if (asking && line.done) firstChoice.current?.focus()
  }, [asking, line.done])

  /* THE LINE, SAID ONCE, WHEN IT IS FINISHED. Every measured piece of content in
   * the run comes through this box, so a student using a reader who cannot hear
   * a line cannot hear the game. Announced on completion rather than while it is
   * typing, because the partial text changes every frame. */
  useEffect(() => {
    if (!line.done) return
    announce(line.who ? `${line.who}: ${line.text}` : line.text)
  }, [line.done, line.text, line.who])

  const live = () => performance.now() - shownAt.current > ADVANCE_DEAD_MS

  const advance = () => { if (!asking && live()) onAdvance?.() }

  /* one door for both the pointer and the number key, so the answered state and
   * the double-answer guard cannot be true on one path and false on the other */
  const pick = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    /* the press LANDED, said out loud. The box usually closes on the next tick,
     * so a reader would otherwise hear the question and then silence. */
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
        return
      }
      if (e.key === ' ' || e.key === 'Enter') { advance(); e.preventDefault() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    /* the deps are the things the handler branches on, not nothing. With no array
     * at all this tore down and re-registered a window listener on every render,
     * and the world box re-renders once per animation frame while a line is
     * typing: sixty add/remove pairs a second, on the lowest-end machine in the
     * deployment target, during the most common interaction in the game. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindKeys, asking, line.done, options, onPick, onAdvance, picked])

  /* §40.41 asks for the states to be counted up front rather than implied, and
   * this is the count for this surface: it is arriving, it has arrived, it is
   * asking, or it has been answered. The stylesheet reads exactly this. */
  const state = asking
    ? (picked === null ? 'asking' : 'answered')
    : line.done ? 'complete' : 'typing'

  return (
    <div ref={stackEl} className="dlg-stack" data-state={state}>
      {/* THE CHOICES SIT ABOVE THE BOX rather than inside it, dealt like held
          cards (§11.1). They are the same column as the box now, so the box may
          grow to whatever a member wrote without the planks landing on the paper:
          the old rule positioned them off a hardcoded 190px that stopped being
          the box's height the day §40.14 was fixed. */}
      {asking && line.done && (
        <div className="dlg-choices" role="group" aria-label="Choices" onClick={(e) => e.stopPropagation()}>
          {options!.map((o, i) => (
            <button
              key={o + i}
              ref={i === 0 ? firstChoice : undefined}
              className={`dlg-choice kit-surface-plank${picked === i ? ' dlg-choice-chosen' : ''}`}
              /* the chosen card stays and the others stand down. A shape and a
                 position move, never a hue on its own (§40.31), because a school
                 Chromebook panel crushes both lightness and saturation. */
              disabled={picked !== null && picked !== i}
              onClick={() => pick(i)}
            >
              <span className="dlg-choice-key" style={keyPlate} aria-hidden="true">{i + 1}</span>
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
        /* NOT A LIVE REGION, WHICH IT USED TO BE. `aria-live` sat on this box
           while the typewriter rewrote its text forty-five times a second, so a
           reader was handed a new announcement every 22ms and could not follow
           one sentence. The finished line is announced once instead, above. */
        aria-label={asking ? undefined : 'Continue'}
        onClick={(e) => { e.stopPropagation(); advance() }}
      >
        {line.portrait && (
          <span
            className={`dlg-portrait${frameIsDrawn() ? '' : ' dlg-portrait-bare'}`}
            style={{ width: portraitColumn() }}
          >
            {/* the frame is the kit's own `portrait_frame`, and it warns with the
                path it wanted when the art is not drawn yet. There is no
                public/art/portraits/ in this repository, so today every portrait
                takes that path and leaves a clean empty frame. */}
            <PortraitFrame id={line.portrait} />
          </span>
        )}
        {/* THE PLAQUE HANGS OFF THE BOX, not off the text column. It is absolutely
            positioned at the box's own top edge, so making it a child of the text
            column positioned it against that column instead and dropped it onto
            the first line. A sibling, so its containing block is the box.
            The picture is `--kit-art-plaque`, the small carved plate Ash already
            has on the HUD, stretched as a SHAPE and never nine-sliced: eighty
            pixels of carving on a twenty-pixel plate is the `6851a68` lesson. */}
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
            {pawDrawn && (
              <span className="dlg-paw" aria-hidden="true">
                <Glyph piece="cue" face={CUE_FACE} size={16} className="dlg-paw-f" />
              </span>
            )}
            <span className="dlg-hint-words">{hint}</span>
          </div>
        )}
      </div>
    </div>
  )
}
