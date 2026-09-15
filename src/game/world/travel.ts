/* the voyage is held outside the scene: the map changes twice on a trip and `enter()` tears the scene and the island's python down with it, so no single handler can see the journey through and the plan lives in this module, armed by `sail_to(map)` */

/* the four legs in order: `boarding` is a beat at the berth with the bars up until E is pressed, because walking the quay, boarding and casting off inside one leg reads as being zoomed past the ship, and the leg is public because Escape means "not now" before `crossing` and "take me there" after */
export type VoyageLeg =
  /* getting to the dock: out of the room, through whatever doors, onto the quay */
  | 'to-dock'
  /* standing at the berth with the bars up, waiting for him to press E */
  | 'boarding'
  /* aboard and under way */
  | 'crossing'
  /* the far map has loaded and owes an arrival */
  | 'landing'

/** is the journey still waiting for him, rather than carrying him */
export const voyageWaiting = (): boolean =>
  !!plan && (plan.leg === 'to-dock' || plan.leg === 'boarding')

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
  calledOff = false
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

/* called off before it started: Escape before the boat moves drops the plan and lowers the bars on an ordinary dock where E opens the chart again, and it is separate from `endVoyage` so a listener can tell a finished journey from a cancelled one */
/* called off is not the same as finished: both end with the plan going null, and the scene's listener hands the objective line back to the year, which is right for a stopped journey and wrong for an arrival, because the island just landed on set its own first sentence while the ship was still on the water */
let calledOff = false

/** was the last plan dropped by the student rather than finished */
export const voyageCalledOff = (): boolean => calledOff

export function cancelVoyage() {
  if (!plan) return
  console.log(`[travel] ${plan.from} -> ${plan.to} called off before sailing`)
  plan = null
  skipped = false
  calledOff = true
  tell()
}

/** the voyage is over, or has been abandoned */
export function endVoyage(why = 'arrived') {
  if (!plan) return
  calledOff = false
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

/* the ceiling: a voyage is a watched stretch with the controls held, so a leg that never finishes is a dead session behind two black bars, and every leg's deadline shares this number */
export const LEG_CEILING_MS = 90_000

/* a crossing is about twenty seconds of watching a boat and is worth seeing once, so the skip is a flag and not an abort: the journey still finishes at the same dock with the same card, and it is not the cutscene skip on `CutsceneRuntime`, which fast forwards authored steps a voyage does not have */
export function skipVoyage() {
  if (!plan || skipped) return
  skipped = true
  console.log('[travel] skipped by the student')
  tell()
}

/** has the student asked to be there already */
export const voyageSkipped = (): boolean => skipped
