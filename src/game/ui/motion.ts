/* the reduced-motion setting as a value the renderer can read, shared with the CSS */

let cached: boolean | null = null
const listeners = new Set<(on: boolean) => void>()

/* what the player asked for, null until they say, and the OS is the default until then */
let asked: boolean | null = null

const osReduce = (): boolean => {
  /* the OS setting counts too: a student who already told Chrome OS they want less motion should not have to say it again in a game, and the district image is where that setting most often comes from */
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

/* write the value onto <html>, so the stylesheets match on exactly what the renderer gets */
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

/** a renderer that is mid-animation subscribes so it can shorten rather than finish a swing the player just asked it to stop making */
export function onReducedMotion(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

if (typeof document !== 'undefined') {
  /* watch the attribute, so anything that writes it directly is noticed here too */
  new MutationObserver(() => { publish(); push() })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-rm'] })
  try { window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', () => { publish(); push() }) }
  catch { /* older engines: the attribute path still works */ }
  /* the OS setting has to reach the stylesheets on the first frame, before any settings sheet has been opened, or the first cutscene plays at full swing for a student who already asked it not to */
  publish()
}

/* what reduced motion means to something that draws: a shorter move, no oscillation */

/** how long a camera travel should take, given what it would have taken */
export const motionMs = (ms: number): number => (prefersReducedMotion() ? Math.min(ms, 120) : ms)

/** how far a decorative oscillation should swing, as a fraction of its amplitude */
export const motionAmp = (amp: number): number => (prefersReducedMotion() ? 0 : amp)
