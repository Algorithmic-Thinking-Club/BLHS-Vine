/* THE CONTROLS THE WHOLE GAME IS MADE OF, DRAWN ONCE.
 *
 * `docs/ops/BRIEF-UI.md` item 16: the feedback set is "kit behaviour used
 * everywhere rather than per panel", and item 17 asks for every state of every
 * control and every panel. Both of those are impossible while a button is a
 * `linear-gradient` retyped in nine stylesheets, which is what
 * `build-shots/ui/before/` photographs: the pause sheet, the year sheet, the
 * Handbook, the yearbook and the wardrobe each draw their own rectangle, each
 * with its own hover, none with a press, a busy or a disabled that reads as
 * anything but paler.
 *
 * WHAT THIS FILE IS. The dozen controls the game actually presses, each wearing
 * a piece MAPVIS already drew, each carrying the full state grammar in one
 * place. A surface asks for `<Plank>` and gets rest, hover, press, disabled,
 * focus and busy without knowing they exist.
 *
 * THE ART IS ALREADY PAID FOR AND WAS NOT BEING WORN. Read off `/api/v1/ui` on
 * 2026-09-01: eleven stretchable grounds (band, dialogue, field, gauge,
 * highlight_edge, panel, plank, portrait_frame, rail, socket, tab) and seven
 * sheets of cut faces (chip, cover_plate, cue, icon_set, pip, pointer, stamp).
 * Of the twenty-six named faces on those sheets, `src/` read THREE before this
 * file: compass on the chart button and two pips. The rest were drawn, hosted,
 * and never once shown to a student.
 *
 * EVERY CONTROL HERE REFUSES RATHER THAN INVENTS. `faceStyle` hands back nothing
 * when a face was not drawn or the kit never arrived, and the fallback is always
 * a shape the token layer owns, never an operating-system glyph: `docs/ART.md`
 * says "Icons are drawn, never an emoji or a font glyph" and the brief's do-not
 * list says it again. A face nobody drew is a gap to be reported, not a gap to
 * be filled with whatever the Chromebook happens to ship.
 */
import {
  useEffect, useState, useSyncExternalStore,
  type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode,
} from 'react'
import { faceStyle } from './kitFaceStyle'
import { kitCached, kitFace, kitGeneration, onKitLanded } from './kit'
import './controls.css'

/* ---- the kit arriving ----------------------------------------------------
 *
 * `main.tsx` fires `loadKit()` and never waits for it, so a component that
 * mounts before the fetch answers asks a kit that is not there and draws its
 * fallback for the life of the page. One subscription, and every control
 * redraws on the frame the art lands. */
export function useKitReady(): number {
  return useSyncExternalStore(onKitLanded, kitGeneration, () => 0)
}

/* ---- a drawn mark --------------------------------------------------------
 *
 * The one way a face gets onto the screen. `piece`/`face` name a rectangle the
 * platform published; `fallback` is what stands in when nobody drew it, and it
 * is a NODE rather than a string so a caller can hand over a token-coloured
 * shape instead of a character. A `Glyph` with no face and no fallback renders
 * nothing at all, which is the honest answer and is never an empty square. */
export function Glyph({
  piece, face, size = 22, fallback = null, className = '', title,
}: {
  piece: string
  face: string
  /** the square the mark is drawn into, in CSS pixels */
  size?: number
  fallback?: ReactNode
  className?: string
  title?: string
}) {
  useKitReady()
  const style = faceStyle(piece, face)
  if (!style) return <>{fallback}</>
  /* THE FACE KEEPS ITS OWN PROPORTION. `faceStyle` scales the whole sheet so the
   * cut rectangle fills the element exactly, so forcing every face into a square
   * stretches any that is not one, and nothing about a 512x256 sheet carrying
   * eight marks guarantees square cuts. `size` is the HEIGHT and the width
   * follows the drawing. */
  const cut = kitFace(kitCached() ?? [], piece, face)
  const w = cut && cut.h > 0 ? Math.round(size * (cut.w / cut.h)) : size
  return (
    <span
      className={`kit-glyph ${className}`}
      style={{ ...style, width: w, height: size }}
      aria-hidden="true"
      title={title}
    />
  )
}

/** the same mark as a plain style object, for a caller that owns its own box */
export function useFace(piece: string, face: string): CSSProperties | undefined {
  useKitReady()
  return faceStyle(piece, face)
}

/* ---- THE PLANK, which is every button in the game ------------------------
 *
 * Ash, 2026-09-01: the plank is `public/art/ui/plank-button.png` and not the
 * platform's parchment one. `src/game/ui/kit.ts`'s LOCAL_ART set is what keeps
 * that true; this is what presses it.
 *
 * THE SIX STATES, AND WHAT EACH ONE IS MADE OF. §40.41 asks for rest, hover,
 * press, disabled, focus and busy on every control, and the rule underneath all
 * six is §40.31: no state carried by hue alone. So each one moves the WOOD as
 * well as the ink.
 *
 *   rest      the drawn plank, pale ink cut into it
 *   hover     lifts 1px and warms; the keyline brightens
 *   press     sits 1px INTO the page and the drop shadow closes up, because a
 *             sign that is pressed goes down, it does not change colour
 *   disabled  desaturated and unlit, no lift, `cursor: not-allowed`, and the
 *             REASON is carried in `title` by every caller that has one
 *   focus     the kit's one ring, from tokens.css, on the element and not on a
 *             wrapper, so it draws around the wood
 *   busy      the label is replaced by a filling bar and `aria-busy` is set, so
 *             a reader is told rather than left on a button that does nothing
 *
 * `keyCap` is the key that also does this, drawn into the left end of the sign.
 * A pointer path for every key path and the reverse (§40.28). */
export type PlankSize = 'sm' | 'md' | 'lg'

export function Plank({
  children, keyCap, busy = false, size = 'md', wide = false, glyph, className = '',
  disabled, ...rest
}: {
  children: ReactNode
  /** the key that also presses this, drawn into the sign */
  keyCap?: string
  /** the press has been accepted and something is happening */
  busy?: boolean
  size?: PlankSize
  /** fill the row it is in rather than sizing to its label */
  wide?: boolean
  /** a drawn mark before the label, as `[piece, face]` */
  glyph?: [string, string]
  className?: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`kit-plank kit-surface-plank kit-plank-${size}${wide ? ' kit-plank-wide' : ''} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {keyCap && <span className="kit-plank-key" aria-hidden="true">{keyCap}</span>}
      {glyph && <Glyph piece={glyph[0]} face={glyph[1]} size={18} className="kit-plank-glyph" />}
      <span className="kit-plank-ink">{children}</span>
      {busy && <span className="kit-plank-busy" aria-hidden="true" />}
    </button>
  )
}

/* ---- THE CHIP, which is a small round thing that can be spent -------------
 *
 * `chip` publishes plate, plate_lit and plate_spent: three drawn states of one
 * counter. A season token, a focus-class slot, a cord bead. The face IS the
 * state, which is what §40.31 asks for and what a `style={{opacity:.35}}`
 * written inline can never be. */
export function Chip({
  state = 'plate', children, label, className = '', ...rest
}: {
  state?: 'plate' | 'plate_lit' | 'plate_spent'
  children?: ReactNode
  label?: string
  className?: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const face = useFace('chip', state)
  const press = rest.onClick
  const Node = press ? 'button' : 'span'
  return (
    <Node
      className={`kit-chip kit-chip-${state}${face ? ' kit-chip-drawn' : ''} ${className}`}
      style={face}
      aria-label={label}
      title={label}
      {...(press ? { type: 'button' as const, ...rest } : {})}
    >
      {children}
    </Node>
  )
}

/* ---- THE TAB, on one row, because a wrapped tab row is a broken one -------
 *
 * `build-shots/ui/before/09-handbook.png`: five tabs and a Close, laid out with
 * `flex-wrap: wrap`, wrapping onto a second line at every window this game is
 * played at. The kit's `tab` piece is a drawn tab; the row it sits in scrolls
 * sideways rather than wrapping, and Left/Right walk it (`tabRowKeyDown`). */
export function Tab({
  active, children, className = '', ...rest
}: { active: boolean; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`kit-tab kit-surface-tab${active ? ' kit-tab-on' : ''} ${className}`}
      {...rest}
    >
      <span className="kit-tab-ink">{children}</span>
    </button>
  )
}

/* ---- THE FIELD, which is where a student types ---------------------------
 *
 * `field` publishes typed, unit and error regions, which is the whole shape of
 * a form row: what was entered, what unit it is in, and what is wrong with it.
 * The error is a NODE under the box and is announced, never a red border on its
 * own (§40.31 again: hue is not a message). */
export function Field({
  label, error, unit, hint, className = '', id, ...rest
}: {
  label: string
  error?: string | null
  unit?: string
  hint?: string
  className?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const auto = `kf-${label.replace(/\W+/g, '-').toLowerCase()}`
  const fid = id ?? auto
  return (
    <div className={`kit-field-row ${className}`}>
      <label className="kit-field-label" htmlFor={fid}>{label}</label>
      <span className={`kit-field kit-surface-field${error ? ' kit-field-bad' : ''}`}>
        <input
          id={fid}
          className="kit-field-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          {...rest}
        />
        {unit && <span className="kit-field-unit" aria-hidden="true">{unit}</span>}
      </span>
      {hint && !error && <span className="kit-field-hint" id={`${fid}-hint`}>{hint}</span>}
      {error && (
        <span className="kit-field-err" id={`${fid}-err`} role="alert">
          <Glyph piece="icon_set" face="cross" size={14} />
          {error}
        </span>
      )}
    </div>
  )
}

/* ---- THE GAUGE, which fills on a real number and never on a clock ---------
 *
 * §4.1's rule for the arrival card, and it is a rule about honesty rather than
 * about looks: a bar that runs on a timer tells a student the map is nearly
 * ready when nobody has asked the map. `value` is 0..1 and comes from whatever
 * is really counting. `indeterminate` is the honest answer when nothing is.
 * `gauge` publishes `fill_unit` and `reading`, so the drawn track holds a drawn
 * fill and the number sits in the place the art left for it. */
export function Gauge({
  value, label, reading, className = '',
}: {
  /** 0..1, or null when nothing can honestly be counted */
  value: number | null
  label: string
  /** the number printed in the gauge's own reading slot */
  reading?: string
  className?: string
}) {
  const pct = value === null ? null : Math.max(0, Math.min(1, value))
  return (
    <div
      className={`kit-gauge kit-surface-gauge${pct === null ? ' kit-gauge-waiting' : ''} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
      aria-valuetext={pct === null ? 'working' : `${Math.round(pct * 100)} percent`}
    >
      <span className="kit-gauge-fill" style={pct === null ? undefined : { width: `${pct * 100}%` }} />
      {reading && <span className="kit-gauge-reading">{reading}</span>}
    </div>
  )
}

/* ---- THE SOCKET, which is a place a thing goes ---------------------------
 *
 * The year sheet's season slot, and the reason the piece exists. It is drawn
 * empty, it says what it is for in its own caption slot, and it says out loud
 * whether something can go in it right now. A socket that refuses says WHY, in
 * words, in the socket: §5.9's rule that a sport refusing a season has to
 * explain itself where the refusal happened and not in a corner. */
export function Socket({
  caption, filled, refusing, over, children, className = '', ...rest
}: {
  caption: string
  filled?: boolean
  /** the reason this cannot take what is being offered, in words */
  refusing?: string | null
  /** something is being dragged over it right now */
  over?: boolean
  children?: ReactNode
  className?: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const state = filled ? 'filled' : refusing ? 'refusing' : over ? 'over' : 'empty'
  return (
    <button
      type="button"
      className={`kit-socket kit-surface-socket ${className}`}
      data-state={state}
      aria-label={refusing ? `${caption}. ${refusing}` : caption}
      {...rest}
    >
      <span className="kit-socket-cap">{caption}</span>
      <span className="kit-socket-well">{children}</span>
      {refusing && (
        <span className="kit-socket-why">
          <Glyph piece="icon_set" face="cross" size={13} />
          {refusing}
        </span>
      )}
    </button>
  )
}

/* ---- THE PORTRAIT FRAME, which had been plumbed and never drawn -----------
 *
 * `BoxLine.portrait` has carried an id since the box was written and the only
 * thing that ever consumed it was an `<img>` with no frame around it, so an
 * author could set a portrait, see no error, and ship a scene where the face
 * floats. `portrait_frame` publishes `picture` and `caption`, and `valign` on
 * the picture region is required and not defaulted because the shipped portrait
 * is bottom-anchored: a character that centres in its own box floats. */
export function PortraitFrame({
  src, caption, className = '',
}: { src: string; caption?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  return (
    <span className={`kit-portrait kit-surface-portrait_frame ${className}`}>
      {!failed && (
        <img
          className="kit-portrait-pic"
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            /* SAY WHICH ONE. There is no public/art/portraits/ in this repo yet,
             * so today every portrait takes this path, and a silent hide is how
             * an author ships a faceless scene without ever being told. */
            console.warn(`[kit] no portrait art at ${src}`)
            setFailed(true)
          }}
        />
      )}
      {caption && <span className="kit-portrait-cap">{caption}</span>}
    </span>
  )
}

/* ---- WHAT A PANEL SAYS WHEN IT HAS NOTHING TO SAY ------------------------
 *
 * §40.42's panel states are closed, opening, empty, populated, loading, error
 * and closing, and the three that were never built are the three a student
 * actually meets first: a Handbook with no facts in it, a chart page waiting on
 * the platform, and a world document that failed to come down. All three
 * rendered as a heading over white space, which reads as broken.
 *
 * An empty page is TOLD HONESTLY and says what fills it. That is §40.20's rule
 * in as many words and it is the difference between "you have not done that
 * yet" and "this is broken". */
export function Empty({ what, fills }: { what: string; fills: string }) {
  return (
    <div className="kit-empty" role="note">
      <Glyph piece="pointer" face="pin_tail" size={26} className="kit-empty-mark" />
      <p className="kit-empty-what">{what}</p>
      <p className="kit-empty-fills">{fills}</p>
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="kit-loading" role="status" aria-live="polite">
      <Gauge value={null} label={what} />
      <p className="kit-loading-what">{what}</p>
    </div>
  )
}

export function Failed({ what, retry }: { what: string; retry?: () => void }) {
  return (
    <div className="kit-failed" role="alert">
      <p className="kit-failed-what">
        <Glyph piece="icon_set" face="cross" size={16} />
        {what}
      </p>
      {retry && <Plank size="sm" onClick={retry}>Try again</Plank>}
    </div>
  )
}
