/* THE FEEDBACK SET, AS KIT BEHAVIOUR RATHER THAN AS NINE PANELS' OPINIONS.
 *
 * `docs/ops/BRIEF-UI.md` item 16, and the shape of it is the whole point: "the
 * saved stamp, the reward pop, correct and incorrect, as kit behaviour used
 * everywhere rather than per panel". Today the year sheet says a plan was kept
 * by changing a word in a hint, the wardrobe says nothing at all, and the beat
 * runner says right or wrong with a colour. Three surfaces, three vocabularies,
 * and a student has to learn each one.
 *
 * WHY IT IS NOT A REACT COMPONENT. The four things that need to say "that
 * landed" are a React panel, a Pixi scene, the save layer and a member's Python
 * running in a worker. A component would have to be mounted by each of them and
 * would be mounted by none. This owns one fixed element under <body>, draws with
 * the kit's own classes, and can be called from anywhere including code that has
 * never heard of React.
 *
 * GETTING ONE WRONG IS MET WITH WARMTH AND NEVER A RED BUZZER. §6.9's rule, and
 * it is a rule about the study as much as about kindness: the instrument is
 * measuring whether a game teaches, and a student who has been buzzed at stops
 * trying things, which shows up as a shorter run rather than as a worse one.
 * `wrong()` is warm ink on paper, it says what to do next, and it holds longer
 * than `right()` because there is more to read.
 *
 * IT NEVER STEALS FOCUS AND IT NEVER BLOCKS. The layer is `pointer-events:
 * none`. A student mid-sentence keeps typing.
 */
import { announce } from './a11y'
import { faceStyle } from './kitFaceStyle'
import { play, playUi } from '../audio'

const LAYER_ID = 'kit-feedback'

export type FeedbackKind = 'saved' | 'right' | 'wrong' | 'awarded' | 'note'

/* WHAT EACH ONE SOUNDS LIKE, and this is where sound reaches the whole game.
 *
 * §40 asks for "a feedback sound per grant, per grade and per press, warmth
 * rather than a buzzer", and `src/game/audio.ts` has shipped twelve licensed
 * CC0 effects with a first-gesture unlock since wave four. The beat runner, the
 * year sheet and the wardrobe imported none of them, so the whole library was
 * reachable only from the intro. Hanging it here rather than on each panel is
 * the same argument the rest of this file makes: five sounds, one vocabulary,
 * and a surface that says `saved()` gets the right one without choosing.
 *
 * THERE IS NO BUZZER AND THERE IS NO SILENCE EITHER. `deny` exists in the
 * library and is deliberately NOT what a wrong answer plays: a wrong answer is
 * the student learning (§6.9), and it gets the same soft page the right one
 * gets, quieter. `deny` is for a control that refused, which is a different
 * event and one the kit does not raise here.
 *
 * `play` is already safe on its own: it swallows a dropped fetch, it honours the
 * mute setting, and it queues until the first gesture unlocks audio, so nothing
 * here needs a guard. */
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
  /* ---- AND HEARD, EXCEPT THAT MOSTLY IT IS NOT ---------------------------
   *
   * BRIEF-PLAYTHROUGH-1 law 4, after Ash played the deploy: "No annoying sound.
   * The two effects he heard are off. Nothing plays until he has picked a sound
   * and said so. The reward pop stays only if it is soft enough that he does not
   * mention it."
   *
   * So four of the five go through `playUi`, which is off, and `awarded` does
   * not. A reward pop is not the kit clicking at a student, it is the game
   * saying a credit was earned, it happens about once a beat, and his ruling
   * names it as the one thing that may survive on condition. It is halved so the
   * condition has a chance of holding.
   *
   * The quieter wrong answer stays quieter for the same reason it always was:
   * the game notices, it does not object. It just happens to be silent today. */
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
export const right = (what = 'That is it', detail?: string): void => feedback('right', what, detail)

/** a wrong answer, WITHOUT A BUZZER. The message is what to do next, never what
 *  was wrong with the student. */
export const wrong = (what = 'Not that one', detail?: string): void => feedback('wrong', what, detail)

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
