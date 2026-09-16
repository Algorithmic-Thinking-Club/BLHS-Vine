/* the one place that spells the url a scene writes to send somebody into a painted map */
import { transitionBusy, type TransitionSpec } from '../../app/transitions'
import { HUB_MAP, MAW_MAP } from '../run/objective'

/** which map, where in it, and whether the player arrives on the water */
export type PmapTarget = {
  map: string
  /** the arrival anchor, named by a door, or the save's own position for run/resume.ts to judge */
  at?: string
  /* true when the player arrives on the water rather than on foot */
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

/** the query a target is spelled as, keeping every other pin already on the url */
export function searchFor(t: PmapTarget, search = window.location.search): string {
  const q = new URLSearchParams(search)
  q.set('scene', 'pmap')
  q.set('map', t.map)
  if (t.at) q.set('at', t.at); else q.delete('at')
  if (t.aboard) q.set('aboard', '1'); else q.delete('aboard')
  return q.toString()
}

/* written with replaceState, because a real navigation would reload the whole page */
export function setMapUrl(t: PmapTarget) {
  window.history.replaceState(null, '', `${window.location.pathname}?${searchFor(t)}`)
}

/** the scene id every painted map lives at, so no caller spells it */
export const PMAP_SCENE = 'pmap'

/* ---- write the address only when the navigation is really going to happen */
export function enterMap(
  go: (to: string, spec?: TransitionSpec) => void,
  t: PmapTarget,
  spec?: TransitionSpec,
): boolean {
  if (transitionBusy()) {
    console.warn(`[route] refused to open "${t.map}": a transition is already running`)
    return false
  }
  setMapUrl(t)
  go(PMAP_SCENE, spec)
  return true
}

/* ---- the road: the two places the game itself sends a student */

/** AFTER SET SAIL: the one ocean, off the published hub, with the tiller his. */
export const SEA_ARRIVAL: PmapTarget = { map: HUB_MAP, aboard: true }

/* continue always lands in the Maw, by naming an anchor rather than a saved position */
export const HOME_TARGET: PmapTarget = { map: MAW_MAP, at: 'arrive_maw' }
