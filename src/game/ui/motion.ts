/* W12: REDUCED MOTION AS A VALUE THE RENDERER CAN READ, NOT A CLASS NAME.
 *
 * `SettingsPanel.tsx:22` writes `document.documentElement.dataset.rm` and the six
 * rules that read it back are CSS, every one of them shortening or cancelling a
 * DOM animation. NOTHING DRAWN ON THE PIXI CANVAS CAN SEE IT. §80.5 spells out
 * the consequence and it inverts the order anybody would guess: a timing bar in
 * a panel honours the setting, and the same timing bar moved into the world
 * where it belongs stops honouring it. So the accessibility answer and the
 * design answer point in opposite directions, silently, and the setting gets
 * quieter as the game gets better.
 *
 * §80.3 states the other half as an obligation rather than a bug: reduced motion
 * is a setting the kit owns and a behaviour the bodies OWE, and `GAME-DESIGN.md`
 * §11.3 names it as the thing that swaps big camera moves for cross-fades. Today
 * the setting exists, the CSS honours it and the camera does not, which is
 * §50.39's finding: a control that reports a state it does not deliver is worse
 * than no control.
 *
 * This file is the value. It reads the same attribute the CSS reads, so there is
 * one source and not two, and it notices a change so a camera mid-move can
 * shorten rather than waiting for a reload. The renderer imports a function; the
 * stylesheets keep their selectors; nobody has to remember to keep two settings
 * in step because there is one.
 */

let cached: boolean | null = null
const listeners = new Set<(on: boolean) => void>()

/* WHAT THE PLAYER ASKED FOR, once anybody has told us. `null` means nobody has
 * yet, and until then the attribute on <html> and the OS are the input, which is
 * how this file behaved before and what a scene mounted straight from a URL
 * still needs.
 *
 * THE OS IS A DEFAULT AND NOT AN OVERRIDE. It was an override for one draft of
 * this file and that is the same defect in a mirror: a student whose Chromebook
 * says "reduce" would have had a toggle that reads "off" while the game reduces
 * motion anyway, and §50.39's rule is that a control reporting a state it does
 * not deliver is worse than no control. So the OS decides until the player says
 * something, and after that the player decides. `loadSettings` seeds the stored
 * value from the OS the first time, so the toggle agrees on the first frame. */
let asked: boolean | null = null

const osReduce = (): boolean => {
  /* THE OS SETTING COUNTS TOO. A student who has already told Chrome OS they
   * want less motion has said it once and should not have to say it again in a
   * game, and the district image is where that setting most often comes from. */
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }
  catch { return false }
}

const attrOn = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.rm === '1'

const read = (): boolean => {
  if (typeof document === 'undefined') return false
  return asked ?? (attrOn() || osReduce())
}

/** what the OS says, for a settings sheet seeding its own first value */
export const systemPrefersReducedMotion = (): boolean => osReduce()

/** the live value, cheap enough to call every frame */
export function prefersReducedMotion(): boolean {
  if (cached === null) cached = read()
  return cached
}

/* ONE VALUE, NOT TWO SOURCES THAT AGREE MOST OF THE TIME.
 *
 * The CSS reads `html[data-rm='1']` and this file also reads the OS media query,
 * so before this they could disagree and did: a student whose Chromebook already
 * said "reduce" got a shortened camera move and a full-length panel animation in
 * the same second, and nothing said why. The attribute is now this file's OUTPUT
 * as well as its fallback input, so what the stylesheets match on is exactly the
 * boolean the renderer gets. `applySettings` calls `setReducedMotion` instead of
 * writing the attribute itself; every existing `html[data-rm='1']` rule, including
 * the ones in files this change does not touch, starts honouring the OS setting
 * for free. */
const publish = () => {
  if (typeof document === 'undefined') return
  const want = read() ? '1' : ''
  if (document.documentElement.dataset.rm !== want) document.documentElement.dataset.rm = want
}

/** what the settings sheet calls when the player moves the toggle */
export function setReducedMotion(on: boolean): void {
  asked = on
  publish()
  push()
}

const push = () => {
  const now = read()
  if (now === cached) return
  cached = now
  for (const fn of listeners) fn(now)
}

/** a renderer that is mid-animation subscribes so it can shorten rather than
 *  finish a swing the player just asked it to stop making */
export function onReducedMotion(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

if (typeof document !== 'undefined') {
  /* the attribute is the setting made visible to CSS, so watching it catches
   * anything that still writes it directly, with no second bus and no import
   * cycle between the kit and here. When the player's answer is already known,
   * a foreign write that disagrees is corrected rather than obeyed, which
   * terminates after one mutation because the correction makes it agree. */
  new MutationObserver(() => { publish(); push() })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-rm'] })
  try { window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', () => { publish(); push() }) }
  catch { /* older engines: the attribute path still works */ }
  /* the OS setting has to reach the stylesheets on the first frame, before any
   * settings sheet has been opened, or the game's first cutscene plays at full
   * swing for a student who already asked it not to */
  publish()
}

/* ---- what "reduced" means to something that draws --------------------------
 *
 * §11.3's rule is "swap big camera moves for cross-fades", so a duration is not
 * simply scaled to zero: a move that takes no time is a cut, and a cut is the
 * thing the transition library exists to prevent. These are the two numbers the
 * renderer asks for, in one place, so twelve callsites cannot each pick their own.
 */

/** how long a camera travel should take, given what it would have taken */
export const motionMs = (ms: number): number => (prefersReducedMotion() ? Math.min(ms, 120) : ms)

/** how far a decorative oscillation should swing, as a fraction of its amplitude */
export const motionAmp = (amp: number): number => (prefersReducedMotion() ? 0 : amp)
