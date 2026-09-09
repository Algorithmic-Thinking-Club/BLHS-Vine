/* THE VOYAGE, HELD OUTSIDE THE SCENE.
 *
 * A trip to another island is: walk out of the room, down the quay, aboard, across
 * the water, ashore. The map changes twice on the way, and `enter()` tears the
 * scene and the island's python down with it, so no single handler can see the
 * journey through. The plan therefore lives here, in a module, the way
 * `stage/cinema.ts` holds the bars that cross a door.
 *
 * A member never touches this. `sail_to(map)` arms it and the engine does the rest.
 */

/** where the traveller is up to */
export type VoyageLeg =
  /* still inside a room, walking to the door that leads to the water */
  | 'to-dock'
  /* on a map with a berth, walking to the ship and casting off */
  | 'crossing'
  /* the far map has loaded and owes an arrival */
  | 'landing'

export type VoyagePlan = {
  /** the map being sailed to */
  to: string
  /** the map the voyage was called from, so the way back is known */
  from: string
  leg: VoyageLeg
  /** true when this is the trip home, which ends at a door rather than at a berth */
  home: boolean
}

let plan: VoyagePlan | null = null
/* a student has asked to be there already, and the leg in flight honours it */
let skipped = false
const subs = new Set<(p: VoyagePlan | null) => void>()

function tell() { for (const s of [...subs]) { try { s(plan) } catch (e) { console.error('[travel] a listener threw', e) } } }

/** what the traveller is doing, or null when nobody is travelling */
export const voyage = (): VoyagePlan | null => plan

/** start a voyage. The scene that armed it performs the first leg. */
export function beginVoyage(p: VoyagePlan) {
  plan = p
  skipped = false
  console.log(`[travel] ${p.from} -> ${p.to}, leg ${p.leg}${p.home ? ', going home' : ''}`)
  tell()
}

/** move the same voyage on to its next leg, across a map change */
export function setLeg(leg: VoyageLeg) {
  if (!plan) return
  plan = { ...plan, leg }
  console.log(`[travel] leg ${leg}`)
  tell()
}

/** the voyage is over, or has been abandoned */
export function endVoyage(why = 'arrived') {
  if (!plan) return
  console.log(`[travel] ${plan.from} -> ${plan.to} ended: ${why}`)
  plan = null
  skipped = false
  tell()
}

export function onVoyage(f: (p: VoyagePlan | null) => void): () => void {
  subs.add(f)
  f(plan)
  return () => { subs.delete(f) }
}

/* THE CEILING. A voyage is a watched stretch with the controls held, so a leg that
 * never finishes is a dead session behind two black bars. Every leg is given a
 * deadline by the scene performing it; this is the number they share. */
export const LEG_CEILING_MS = 90_000

/* ---- SKIP (Ash, 2026-09-08 item 3) ---------------------------------------
 *
 * *"A small 'Esc: skip' sits top-left during the crossing; Esc lands him at the
 * destination dock."*
 *
 * A crossing is about twenty seconds of watching a boat, once. A student on his
 * fourth voyage of an advisory period has seen it, and a game that makes him
 * watch it anyway is a game he is waiting on rather than playing. It is a FLAG
 * and not an abort: the journey still finishes, at the same dock, with the same
 * card, so nothing downstream has to know whether it was watched.
 *
 * IT IS NOT THE CUTSCENE SKIP. That one lives on `CutsceneRuntime` and
 * fast-forwards authored steps to their end states; a voyage has no steps. */
export function skipVoyage() {
  if (!plan || skipped) return
  skipped = true
  console.log('[travel] skipped by the student')
  tell()
}

/** has the student asked to be there already */
export const voyageSkipped = (): boolean => skipped
