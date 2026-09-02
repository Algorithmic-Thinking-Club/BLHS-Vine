/* WHERE THE PAINTED WORLD IS ASKED FOR, AND WHO IS ALLOWED TO ASK.
 *
 * `PmapScene` reads its map off the URL at mount and has done since doors became
 * rooms, which is right: a refresh lands a student back in the room they were
 * standing in rather than at a spawn. The consequence is that a scene which wants
 * to SEND somebody into the painted world has to write that URL before it
 * navigates, and `beginExit` inside PmapScene was the only code that knew the
 * shape. So the title and the intro could not open a map at all, and the road out
 * of the beach went to the tile island because that was the only id a `nav.go`
 * could name.
 *
 * This file is that shape, in one place, importable by a scene that must not pull
 * four thousand lines of Pixi into its own chunk. PmapScene reads the target from
 * here and writes it through here; the title and the intro write it and then
 * navigate. Nothing else may spell these parameters out.
 */
import { HUB_MAP, MAW_MAP } from '../run/objective'

/** which map, where in it, and whether the player arrives on the water */
export type PmapTarget = {
  map: string
  /** the arrival anchor. A door names one; without it the save's own position is
   *  asked for, and the guard in run/resume.ts decides how much of it to trust. */
  at?: string
  /* ARRIVING BY SEA IS A DIFFERENT ARRIVAL AND NOT A FLAG ON A BODY.
   *
   * §80.3's law is that what the camera follows and how far out it sits are both
   * a function of what the player is driving, so "he is on the water" cannot be
   * expressed by moving a walker: it is the hull being the driven body from the
   * first frame, the camera pulled out to sailing scale before the cover lifts,
   * and the island in the middle distance rather than under the feet. The scene
   * already has all three verbs; what it had no way to hear was somebody asking
   * for them at load. */
  aboard?: boolean
}

/** the default map, kept where the parameter is read rather than in the scene */
export const DEFAULT_MAP = 'quayprop'

export function targetFromUrl(search = window.location.search): PmapTarget {
  const p = new URLSearchParams(search)
  return {
    map: p.get('map') || DEFAULT_MAP,
    at: p.get('at') || undefined,
    aboard: p.get('aboard') === '1',
  }
}

/** the query a target is spelled as, preserving everything else already on the
 *  url (`dbg`, `src`, `v`, `kit`, `skin`, a member's `gh` ref) */
export function searchFor(t: PmapTarget, search = window.location.search): string {
  const q = new URLSearchParams(search)
  q.set('scene', 'pmap')
  q.set('map', t.map)
  if (t.at) q.set('at', t.at); else q.delete('at')
  if (t.aboard) q.set('aboard', '1'); else q.delete('aboard')
  return q.toString()
}

/* WRITTEN WITH replaceState AND NEVER WITH A NAVIGATION.
 *
 * `location.href = ...` reloads the page, which destroys SceneManager, remounts
 * React, throws away the cutscene runtime and the logger's queue and re-downloads
 * the bundle. PmapScene's own door learned that lesson at c7f10d5 and this is the
 * same rule for the scenes that come BEFORE the map: set the address, then let
 * the scene manager's cover do the swap. */
export function setMapUrl(t: PmapTarget) {
  window.history.replaceState(null, '', `${window.location.pathname}?${searchFor(t)}`)
}

/** the scene id every painted map lives at, so no caller spells it */
export const PMAP_SCENE = 'pmap'

/* ---- THE ROAD: the two places the game itself sends a student ---------------
 *
 * Ash's two rulings, as two values rather than as strings typed into two scenes.
 * Both were literals in the middle of a component before this, which is how the
 * intro came to send everybody to a tile island for a month after the ruling that
 * killed it.
 *
 * The map ids come off `run/objective.ts`, which is where the Maw's own name
 * already lives, so the year's state machine and the road cannot disagree about
 * what the Maw is called.
 */

/** AFTER SET SAIL: the one ocean, off the published hub, with the tiller his. */
export const SEA_ARRIVAL: PmapTarget = { map: HUB_MAP, aboard: true }

/* CONTINUE: THE MAW, ALWAYS. Ash's rule is that the Maw is Thor's home and where
 * a run resumes, so this is an explicit anchor and not a saved position: an `at`
 * outranks the resume guard by design (PmapScene reads the save's own position
 * only when no door named an arrival), which is exactly the behaviour wanted
 * here. `RunPosition` keeps being written on every map change for the study log;
 * it is simply not what Continue reads. */
export const HOME_TARGET: PmapTarget = { map: MAW_MAP, at: 'arrive_maw' }
