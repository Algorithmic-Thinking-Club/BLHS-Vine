/* WHICH MATERIALS THE KIT IS MADE OF TODAY.
 *
 * `tokens.css` holds the values; this holds the switch. A skin is one attribute
 * on <html>, the same shape `data-rm` and `data-textsize` already have, so
 * swapping every panel, button, field and box in the game is one write and no
 * component learns a second code path.
 *
 * WHY THERE ARE TWO AND WHY THE SECOND IS NOT A JOKE. §16 is the study's plain
 * arm: the same content with the game-ness taken away, which is what a control
 * condition means when the thing being measured is whether the game-ness
 * teaches. If the plain arm gets built as its own stylesheets it drifts from the
 * real one within a week and the study compares two different pieces of content
 * rather than two presentations of one. `plain` is also the honest low-chrome
 * fallback: a Chromebook that never loaded /art/ui/ still gets a readable panel
 * rather than an unpainted rectangle.
 *
 * THERE IS NO PLAYER-FACING CHOOSER, on purpose. The arm is assigned, not
 * picked, and a student who can turn the game look off has changed their own
 * condition mid-run. `?skin=plain` is the way to look at it, the same way
 * `?scene=` and `?legacy=1` already work, and the run's arm can set it from code
 * when §80.9 wires arm assignment.
 */

export const KIT_SKINS = ['paper', 'plain'] as const
export type KitSkin = (typeof KIT_SKINS)[number]

export const DEFAULT_SKIN: KitSkin = 'paper'

export const isKitSkin = (v: unknown): v is KitSkin =>
  typeof v === 'string' && (KIT_SKINS as readonly string[]).includes(v)

/** the skin now on screen. `paper` is the default and writes no attribute, so a
 *  page that never calls anything here looks exactly like it did before. */
export function currentSkin(): KitSkin {
  if (typeof document === 'undefined') return DEFAULT_SKIN
  const v = document.documentElement.dataset.skin
  return isKitSkin(v) ? v : DEFAULT_SKIN
}

export function applySkin(skin: KitSkin): void {
  if (typeof document === 'undefined') return
  /* the default leaves the attribute off rather than setting it to 'paper': a
   * selector that has to exist for the game to look right is a selector that can
   * be missing, and the paper values are already in `:root` */
  if (skin === DEFAULT_SKIN) delete document.documentElement.dataset.skin
  else document.documentElement.dataset.skin = skin
}

/** `?skin=plain` on any URL, for looking at the other arm without a build */
export function skinFromUrl(search: string): KitSkin | null {
  try {
    const v = new URLSearchParams(search).get('skin')
    return isKitSkin(v) ? v : null
  } catch { return null }
}

/* APPLIED AT IMPORT, and only when the URL actually asks. `applySettings` runs
 * from the title scene, so a scene opened straight from a URL (`?scene=pmap`,
 * which is how every painted map gets looked at) never reached it and the skin
 * would have been the one thing in the kit you could not see without playing
 * from the start. Silent when there is no `?skin=`, so the default is untouched. */
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const fromUrl = skinFromUrl(location.search)
  if (fromUrl) applySkin(fromUrl)
}
