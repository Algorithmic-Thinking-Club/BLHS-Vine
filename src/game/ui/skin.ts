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
 * `?scene=` and `?legacy=1` already work.
 *
 * AND THE ASSIGNED ARM NOW REACHES THIS FILE, which is the whole reason the file
 * exists and was the one wire that had never been run. `save.ts` has recorded
 * `arm` since join day and `intent-engine.ts` has read it, and nothing put it on
 * <html>, so a student the server had put in the control group played the full
 * painted game everywhere except inside four beat screens. That is not a control
 * condition, it is the treatment with four plain pages in it, and no analysis
 * downstream could have seen the difference.
 */

import { loadSave, subscribeSave } from '../save'

export const KIT_SKINS = ['paper', 'plain'] as const
export type KitSkin = (typeof KIT_SKINS)[number]

/** the study arm as the server assigned it, as `save.ts` stores it */
export type StudyArm = 'game' | 'plain'

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
  /* WRITTEN ONLY WHEN IT ACTUALLY CHANGES. This runs on every write to the save
   * now, and a save is written on a grade, a fact, a berth and a checkpoint. An
   * attribute set to the value it already holds still invalidates style for the
   * whole document, and the whole document here is every panel in the kit. */
  if (currentSkin() === skin) return
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

/** the skin an assigned arm means. An unjoined run has no arm and gets `null`,
 *  which is not the same as 'paper': it means nobody has said yet. */
export const skinFromArm = (arm: StudyArm | null | undefined): KitSkin | null =>
  arm === 'plain' ? 'plain' : arm === 'game' ? 'paper' : null

/* ONE PRECEDENCE ORDER, WRITTEN ONCE AND PURE SO A TEST CAN READ IT.
 *
 *   1. the URL, because `?skin=` is how the other arm is LOOKED AT and a person
 *      who typed it means it. It is a dev and review door, not a student one.
 *   2. THE ASSIGNED ARM, which beats anything stored on the device. This is the
 *      study's independent variable and it is not a preference: a save that says
 *      plain renders plain even if some older settings blob says paper.
 *   3. whatever the settings hold, which today is only ever the default, because
 *      there is deliberately no chooser.
 *   4. paper. */
export function resolveSkin(
  search: string,
  arm: StudyArm | null | undefined,
  pref?: KitSkin | null,
): KitSkin {
  return skinFromUrl(search) ?? skinFromArm(arm) ?? (isKitSkin(pref) ? pref : DEFAULT_SKIN)
}

/* THE LAST PREFERENCE ANYBODY HANDED OVER, kept because the two callers know
 * different things. `applySettings` has the settings blob; the save subscription
 * below has only the save, and it fires far more often. Without this the first
 * write to the run after the settings panel closed would drop the preference on
 * the floor and snap back to the default. */
let lastPref: KitSkin | null = null

/** put the assigned arm on <html>. `pref` is only passed by `applySettings`,
 *  which is the one caller that has the settings blob in its hand. */
export function wearAssignedSkin(pref?: KitSkin | null): void {
  if (typeof document === 'undefined') return
  if (isKitSkin(pref)) lastPref = pref
  const search = typeof location === 'undefined' ? '' : location.search
  applySkin(resolveSkin(search, loadSave()?.arm, pref ?? lastPref))
}

/* APPLIED AT IMPORT, AND AGAIN ON EVERY WRITE TO THE RUN.
 *
 * At import because `applySettings` runs from the title scene, so a scene opened
 * straight from a URL (`?scene=pmap`, which is how every painted map gets looked
 * at) never reached it and the skin would have been the one thing in the kit you
 * could not see without playing from the start.
 *
 * On every write because THE ARM ARRIVES LATE. `net.ts:56` writes it when the
 * join call comes back, and `pullState` can write it again on another device, so
 * a skin decided once at boot would be decided before the answer existed. The
 * save already emits on every write for the sync push; this listens to the same
 * emit, and it is one subscription for the life of the page. */
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  wearAssignedSkin()
  subscribeSave(() => wearAssignedSkin())
}
