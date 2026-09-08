/* which materials the kit is made of today, as one attribute on the html element */

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
  /* written only when it actually changes, since setting it re-styles the document */
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

/* the precedence order: the url, then the assigned arm, then settings, then paper */
export function resolveSkin(
  search: string,
  arm: StudyArm | null | undefined,
  pref?: KitSkin | null,
): KitSkin {
  return skinFromUrl(search) ?? skinFromArm(arm) ?? (isKitSkin(pref) ? pref : DEFAULT_SKIN)
}

/* the last preference anybody handed over, since the two callers know different things */
let lastPref: KitSkin | null = null

/** put the assigned arm on <html>. `pref` is only passed by `applySettings`,
 *  which is the one caller that has the settings blob in its hand. */
export function wearAssignedSkin(pref?: KitSkin | null): void {
  if (typeof document === 'undefined') return
  if (isKitSkin(pref)) lastPref = pref
  const search = typeof location === 'undefined' ? '' : location.search
  applySkin(resolveSkin(search, loadSave()?.arm, pref ?? lastPref))
}

/* applied at import and again on every write to the run, because the arm arrives late */
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  wearAssignedSkin()
  subscribeSave(() => wearAssignedSkin())
}
