/* the drawn controls the game is built from, each wearing a piece of the kit art */
import {
  useEffect, useRef, useState, useSyncExternalStore,
  type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react'
import { faceStyle } from './kitFaceStyle'
import { kitCached, kitFace, kitGeneration, kitOptedIn, kitPiece, onKitLanded } from './kit'
import { playUi } from '../audio'
import { currentSkin } from './skin'
import './controls.css'

/* redraw every control on the frame the kit art lands */
export function useKitReady(): number {
  return useSyncExternalStore(onKitLanded, kitGeneration, () => 0)
}

/* one drawn mark from a kit sheet, or the caller's fallback when nobody drew it */
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
  /* the face keeps its drawn proportion, so size is the height and the width follows */
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

/* the class for a drawn ground, or a bare marker when the platform published none */
export function useSurface(piece: string): string {
  useKitReady()
  const worn = kitOptedIn() && currentSkin() === 'paper'
  return worn && kitPiece(kitCached() ?? [], piece) ? `kit-surface-${piece}` : 'kit-bare'
}

/** the same mark as a plain style object, for a caller that owns its own box */
export function useFace(piece: string, face: string): CSSProperties | undefined {
  useKitReady()
  return faceStyle(piece, face)
}

/* the plank, the button every screen presses, with all six of its states */
export type PlankSize = 'sm' | 'md' | 'lg'

export function Plank({
  children, sub, keyCap, busy = false, size = 'md', wide = false, glyph, className = '',
  disabled, ...rest
}: {
  children: ReactNode
  /* a quieter second line printed inside the same wood */
  sub?: ReactNode
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
      className={`kit-plank kit-surface-plank kit-plank-${size}`
        + `${wide ? ' kit-plank-wide' : ''}${sub ? ' kit-plank-two' : ''} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {keyCap && <span className="kit-plank-key" aria-hidden="true">{keyCap}</span>}
      {glyph && <Glyph piece={glyph[0]} face={glyph[1]} size={18} className="kit-plank-glyph" />}
      <span className="kit-plank-lines">
        <span className="kit-plank-ink">{children}</span>
        {sub && <span className="kit-plank-sub">{sub}</span>}
      </span>
      {busy && <span className="kit-plank-busy" aria-hidden="true" />}
    </button>
  )
}

/* the chip, a small round counter that can be lit or spent */
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

/* the tab, in a row that scrolls sideways rather than wrapping */
export function Tab({
  active, children, className = '', ...rest
}: { active: boolean; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`kit-tab ${useSurface('tab')}${active ? ' kit-tab-on' : ''} ${className}`}
      {...rest}
    >
      <span className="kit-tab-ink">{children}</span>
    </button>
  )
}

/* the field, where a student types, with its unit and its reason for refusing */
export function Field({
  label, error, unit, hint, className = '', id, ...rest
}: {
  label: string
  error?: string | null
  unit?: string
  hint?: string
  className?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const surface = useSurface('field')
  const auto = `kf-${label.replace(/\W+/g, '-').toLowerCase()}`
  const fid = id ?? auto
  return (
    <div className={`kit-field-row ${className}`}>
      <label className="kit-field-label" htmlFor={fid}>{label}</label>
      <span className={`kit-field ${surface}${error ? ' kit-field-bad' : ''}`}>
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

/* the gauge, which fills on a real number and paces when nothing can be counted */
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
      className={`kit-gauge ${useSurface('gauge')}${pct === null ? ' kit-gauge-waiting' : ''} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
      aria-valuetext={pct === null ? 'Loading' : `${Math.round(pct * 100)} percent`}
    >
      <span className="kit-gauge-fill" style={pct === null ? undefined : { width: `${pct * 100}%` }} />
      {reading && <span className="kit-gauge-reading">{reading}</span>}
    </div>
  )
}

/* the socket, a place a thing goes, that says in words when it cannot take one */
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
  /* a refusal plays the deny sound once per reason, not once per render */
  useEffect(() => { if (refusing) playUi('deny') }, [refusing])
  return (
    <button
      type="button"
      className={`kit-socket ${useSurface('socket')} ${className}`}
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

/* the portrait frame, a drawn face with a caption under it */
/* where a portrait file lives, spelled out once so no caller can get it wrong */
export const portraitUrl = (id: string): string => `/art/portraits/${id}.png`

/* the drawn portraits, fetched early so the first line of the game is not a blank frame */
export const DRAWN_PORTRAITS = ['principal']

let warmed = false
export function warmPortraits() {
  if (warmed || typeof Image === 'undefined') return
  warmed = true
  for (const id of DRAWN_PORTRAITS) {
    const img = new Image()
    img.decoding = 'async'
    img.src = portraitUrl(id)
  }
}

/* portraits are game art, so the plain study arm draws none */
export function PortraitFrame({
  id, caption, className = '',
}: { id: string; caption?: string; className?: string }) {
  useKitReady()
  const src = portraitUrl(id)
  const surface = useSurface('portrait_frame')
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (currentSkin() !== 'paper') return null
  return (
    <span className={`kit-portrait ${surface} ${className}`}>
      {!failed && (
        <img
          className="kit-portrait-pic"
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            /* name the missing file: there is no public/art/portraits/ in this repo yet so every portrait takes this path, and a silent hide ships a faceless scene with nothing said */
            console.warn(`[kit] no portrait art at ${src}`)
            setFailed(true)
          }}
        />
      )}
      {caption && <span className="kit-portrait-cap">{caption}</span>}
    </span>
  )
}

/* what a panel says when it is empty, loading or failed */
/* a page that scrolls inside its panel and shows a cue while there is more below */
export function Scroller({ className = '', wrapClassName = '', children, ...rest }: HTMLAttributes<HTMLDivElement> & { wrapClassName?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
    check()
    el.addEventListener('scroll', check, { passive: true })
    /* page contents arrive after the first paint (a kit face, a chart) so the answer is re-asked when they do; both observers are absent in jsdom and the cue stays as first measured there */
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(el)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(check) : null
    mo?.observe(el, { childList: true, subtree: true })
    return () => { el.removeEventListener('scroll', check); ro?.disconnect(); mo?.disconnect() }
  }, [])
  return (
    <div className={`kit-scrollwrap ${wrapClassName}`}>
      <div ref={ref} className={className} {...rest}>{children}</div>
      {more && (
        <span className="kit-morecue" aria-hidden="true">
          <span className="kit-morecue-caret" />
          more below
        </span>
      )}
    </div>
  )
}

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
