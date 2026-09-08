/* how much of the bottom of the window is taken by whatever is talking, so the camera lifts */

type Claim = { px: number; stacked: boolean }

const claims = new Map<string, Claim>()
let band = 0

/** how many pixels along the bottom of the window the conversation owns, for the
 *  renderer: everything, including whatever is stacked on top of it */
export const uiBand = (): number => band

function tallest(only: (c: Claim) => boolean): number {
  let top = 0
  for (const c of claims.values()) if (only(c) && c.px > top) top = c.px
  return top
}

function recompute(): void {
  band = tallest(() => true)
  /* the same band as a css number, for surfaces that position themselves above the talking */
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--ui-band', `${Math.round(tallest((c) => !c.stacked))}px`)
  }
}

function claim(key: string, px: number, stacked: boolean): void {
  /* NaN and Infinity come out of a rect measured before layout, and a NaN here
   * would put the camera target at NaN and blank the scene. */
  const v = Number.isFinite(px) && px > 0 ? px : 0
  if (v === 0) claims.delete(key)
  else claims.set(key, { px: v, stacked })
  recompute()
}

/** a surface along the bottom of the window says how tall it is. Zero, or an
 *  unmount, releases the claim. */
export const setUiBand = (key: string, px: number): void => claim(key, px, false)

/** the same, for a surface that places itself ABOVE the band (it reads
 *  `--ui-band` in CSS). It costs the camera exactly as much and it is not part of
 *  the number it reads. */
export const setUiBandStacked = (key: string, px: number): void => claim(key, px, true)

/** the top of the tallest laid-out thing in a set, as a height above the bottom of the window */
export function bandFromRects(els: readonly (Element | null | undefined)[]): number {
  if (typeof window === 'undefined') return 0
  let top = Infinity
  for (const el of els) {
    if (!el) continue
    const r = el.getBoundingClientRect()
    /* a zero-height rect is an element that has not been laid out (happy-dom
     * reports every rect that way), and treating it as a band the height of the
     * window would hand the camera a target off the top of the painting */
    if (r.height <= 0) continue
    if (r.top < top) top = r.top
  }
  if (!Number.isFinite(top)) return 0
  return Math.max(0, window.innerHeight - top)
}
