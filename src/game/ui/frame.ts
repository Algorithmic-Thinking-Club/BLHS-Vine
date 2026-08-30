/* THE FRAME THE CAMERA COMPOSES INTO, WHICH IS NOT THE WINDOW.
 *
 * The eyes round called the centre strip contested: a choice plank and the
 * player were drawn on the same pixels, because the conversation lays itself out
 * from the bottom of the window upward while the camera composes the painting
 * into the whole window. Both are correct on their own and neither knows the
 * other exists, so the body ends up behind the buttons.
 *
 * The fix is one number. Whatever is talking knows exactly how tall it is; it
 * says so here, and the camera treats the window as that much shorter when it
 * decides where the painting sits. A taller stack of choices lifts the picture
 * by exactly what the stack costs, and a conversation that closes gives it back,
 * eased by the follow law's own smoothing.
 *
 * IT IS A REGISTER AND NOT A VARIABLE, because more than one surface can be
 * along the bottom at once: the year's card and a station's line have both been
 * on screen together. One shared number meant whichever unmounted last wrote
 * zero over the one that was still up, and the picture dropped back onto it.
 * Each claimant holds its own entry and the band is the tallest claim.
 *
 * The reader is a PixiJS ticker running outside React and it reads this once a
 * frame, so it is a plain module rather than a hook or a context: a subscription
 * would be a re-render per frame for a number that has not changed.
 */

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
  /* AND A NUMBER IN CSS, because the camera is not the only thing that has to
   * keep out of the conversation's way. The place card sat at `bottom: 12%`,
   * which is inside the dialogue box and inside the year card, so an arrival
   * that landed while anybody was talking was drawn entirely behind the paper
   * and no student ever saw it.
   *
   * THE CSS VALUE EXCLUDES THE STACKED CLAIMS, and that is not a detail. A
   * surface that POSITIONS itself off this number cannot also be counted in it,
   * or it stands on its own shoulders and climbs the screen one measurement at a
   * time. So the place card reads the band beneath it and adds its own height to
   * the band the camera reads. */
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

/** the top of the tallest thing in a set, as a height above the bottom of the
 *  window, or 0 if none of them has been laid out yet. The measuring half of the
 *  contract, kept here so the rule about what counts as "laid out" is written
 *  once. */
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
