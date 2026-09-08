/* the one place the game says that landed, drawn into a fixed layer under body */
import { announce } from './a11y'
import { faceStyle } from './kitFaceStyle'
import { play, playUi } from '../audio'

const LAYER_ID = 'kit-feedback'

export type FeedbackKind = 'saved' | 'right' | 'wrong' | 'awarded' | 'note'

/* what each kind sounds like */
const SOUND: Record<FeedbackKind, string> = {
  saved: 'mark',
  right: 'chime',
  wrong: 'page',
  awarded: 'chime',
  note: 'click',
}

/* how long each kind stays. Wrong is the longest on purpose: it carries the most
 * to read, and it is the one a student is least ready to read quickly. */
const HOLD: Record<FeedbackKind, number> = {
  saved: 1500,
  right: 1400,
  wrong: 2600,
  awarded: 2400,
  note: 1900,
}

/* the drawn mark each one wears, as [sheet, face]. All six exist on the live kit
 * and none of them was being shown before this file. */
const MARK: Record<FeedbackKind, [string, string] | null> = {
  saved: ['stamp', 'approved'],
  right: ['icon_set', 'tick'],
  wrong: ['pointer', 'hand'],
  awarded: ['stamp', 'awarded'],
  note: null,
}

function layer(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let el = document.getElementById(LAYER_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = LAYER_ID
  el.className = 'kit-fb-layer'
  /* NOT aria-live. Everything here is announced through the kit's one live
   * region (`a11y.ts`), which is already polite, atomic and off screen. A second
   * live region means a reader hears the same event twice. */
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

/** the drawn mark as an inline style string, or nothing when nobody drew it */
function markStyle(kind: FeedbackKind): string {
  const m = MARK[kind]
  if (!m) return ''
  const s = faceStyle(m[0], m[1])
  if (!s) return ''
  return [
    `background-image:${s.backgroundImage}`,
    `background-repeat:${s.backgroundRepeat}`,
    `background-size:${s.backgroundSize}`,
    `background-position:${s.backgroundPosition}`,
  ].join(';')
}

/* ONE AT A TIME, AND THE NEWEST WINS. Two stamps stacked in a corner is a
 * notification tray, which §40.6's law about what may float rules out. */
let showing: { el: HTMLElement; timer: number } | null = null

export function feedback(kind: FeedbackKind, message: string, detail?: string): void {
  const host = layer()
  if (!host) return
  if (showing) { window.clearTimeout(showing.timer); showing.el.remove(); showing = null }

  const card = document.createElement('div')
  card.className = `kit-fb kit-fb-${kind}`

  const mark = markStyle(kind)
  if (mark) {
    const m = document.createElement('span')
    m.className = 'kit-fb-mark'
    m.setAttribute('style', mark)
    card.appendChild(m)
  }

  const words = document.createElement('div')
  words.className = 'kit-fb-words'
  const head = document.createElement('div')
  head.className = 'kit-fb-head'
  head.textContent = message
  words.appendChild(head)
  if (detail) {
    const sub = document.createElement('div')
    sub.className = 'kit-fb-detail'
    sub.textContent = detail
    words.appendChild(sub)
  }
  card.appendChild(words)
  host.appendChild(card)

  /* SAID OUT LOUD TOO. A stamp in a corner is invisible to a reader, and "that
   * saved" is exactly the reassurance a student who cannot see it needs most. */
  announce(detail ? `${message}. ${detail}` : message)
  /* only the reward pop is heard by default; the other four go through the ui channel */
  if (kind === 'awarded') play(SOUND[kind], 0.5)
  else playUi(SOUND[kind], kind === 'wrong' ? 0.4 : undefined)

  const hold = HOLD[kind]
  const timer = window.setTimeout(() => {
    card.classList.add('kit-fb-going')
    window.setTimeout(() => { card.remove(); if (showing?.el === card) showing = null }, 240)
  }, hold)
  showing = { el: card, timer }
}

/* ---- the four words the rest of the game says --------------------------- */

/** a plan, a name, a choice: the run kept it. §5.16's stamp and wax. */
export const saved = (what = 'Saved'): void => feedback('saved', what)

/** a correct answer. Short, because there is nothing to fix. */
export const right = (what = 'Right', detail?: string): void => feedback('right', what, detail)

/** a wrong answer, WITHOUT A BUZZER. The message is what to do next, never what
 *  was wrong with the student. */
export const wrong = (what = 'Not quite', detail?: string): void => feedback('wrong', what, detail)

/** something earned: a cord, a badge, a sticker, a fact. Gold is honors only
 *  (`docs/ART.md`), so this is the ONLY one of the five that wears it. */
export const awarded = (what: string, detail?: string): void => feedback('awarded', what, detail)

/** anything else worth a line that is not a judgement */
export const note = (what: string, detail?: string): void => feedback('note', what, detail)

/** for tests and for a scene tearing down mid-stamp */
export function clearFeedback(): void {
  if (showing) { window.clearTimeout(showing.timer); showing.el.remove(); showing = null }
  document.getElementById(LAYER_ID)?.remove()
}
