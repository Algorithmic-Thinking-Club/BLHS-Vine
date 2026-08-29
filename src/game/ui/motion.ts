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

const read = (): boolean => {
  if (typeof document === 'undefined') return false
  if (document.documentElement.dataset.rm === '1') return true
  /* THE OS SETTING COUNTS TOO. A student who has already told Chrome OS they
   * want less motion has said it once and should not have to say it again in a
   * game, and the district image is where that setting most often comes from. */
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }
  catch { return false }
}

/** the live value, cheap enough to call every frame */
export function prefersReducedMotion(): boolean {
  if (cached === null) cached = read()
  return cached
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
  /* the attribute is written by `applySettings`, so watching it is watching the
   * setting, with no second bus and no import cycle between the kit and here */
  new MutationObserver(push).observe(document.documentElement, { attributes: true, attributeFilter: ['data-rm'] })
  try { window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', push) }
  catch { /* older engines: the attribute path still works */ }
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
