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

/* ---- THE FOUR LEGS, AND ASH SAID THEM IN ORDER ---------------------------
 *
 * *"IF HE CLICKS GO TO OR HEAD BACK OR WHATEVER, A BUTTON, IT TURNS ON CUTSCENE,
 * TAKES HIM TO THE DOCK, AND ESC TO EXIT CUTSCENE, and E TO HOP ON THE BOAT, THEN
 * SAIL PROPERLY. IF ESC CLICKED DURING SAILING, THEN TRANSITION SCREEN AND IT SKIPS
 * MOST OF THE JOURNEY AND IT FAST FORWARDS TO THE BOAT LANDING ON THE DESTINATIONS
 * DOCK. IF ESC IS CLICKED BEFORE SAILING, THEN CUTSCENE GOES AWAY, THOR HAS TO CLICK
 * E THAT OPENS THE MAP, AND MANUALLY HAS TO CLICK WHICH ISLAND TO SAIL TO."*
 *
 * The leg that was missing is `boarding`, and it is the whole of what he was asking
 * for: a beat where he is STANDING on the dock beside his own ship with the bars up
 * and nothing happening until he presses E. What shipped instead walked him to the
 * quay, put him in the boat and cast off, all inside one leg, which is why he wrote
 * "it just ZOOMED me past. thor didnt even hop on the ship."
 *
 * The two halves of Escape fall out of the leg as well, and that is why the leg has
 * to be a thing the rest of the game can read. Before `crossing` it means "not now";
 * from `crossing` on it means "I have seen a boat, take me there".
 */
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

/* ---- CALLED OFF BEFORE IT STARTED --------------------------------------
 *
 * Escape before the boat moves does not mean "put me there", it means "let go of
 * me". The plan is dropped, the bars come down where he stands, and the dock he was
 * taken to is a dock like any other: E opens the chart, and picking an island on it
 * arms the whole thing again. Separate from `endVoyage` so a listener can tell the
 * difference between a journey that finished and one he called off. */
/* ---- CALLED OFF IS NOT THE SAME AS FINISHED ------------------------------
 *
 * Both end with the plan going null, and a listener that cannot tell them apart does
 * the wrong thing on one of them. The scene's own listener lowers the bars and hands
 * the objective line back to the year, which is right for a journey somebody stopped
 * and wrong for one that arrived: the island he has just landed on set its own first
 * sentence while the ship was still on the water, and clearing it left a student
 * reading "Go into the mountain" on an island with no mountain. */
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
